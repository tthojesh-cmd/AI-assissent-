"""Agent brain: context -> LLM (function calling) -> tool execution -> verification -> reply."""
import base64, json
from pathlib import Path
from fastapi import HTTPException
from openai import OpenAI, APIConnectionError, APIStatusError, AuthenticationError, BadRequestError, RateLimitError
from sqlalchemy.orm import Session
from ..config import settings
from ..models import Activity, Conversation, Memory, Message, Upload, User, now, to_dict
from . import tools as T

SYSTEM = """You are the user's Personal AI Agent: a capable, friendly digital assistant.
Workflow: understand the intent -> for complex requests call make_plan first -> pick the right tools -> execute -> verify -> answer clearly.
Rules:
- Never claim a task succeeded unless the tool result has ok=true. If a tool failed or is unavailable, say so plainly and explain how to fix it.
- Tools marked as requiring approval are queued for the user; tell them what is waiting for their approval instead of saying it is done.
- For web searches, summarise and list source URLs. Never invent URLs.
- Use calculate for non-trivial arithmetic. Format answers in Markdown; put code in fenced blocks with a language tag.
- You can answer in English and Telugu. If the user writes Telugu, or Telugu typed in English letters (e.g. 'nuvvu ela unnav'), understand it and reply in Telugu script unless they ask for English or Roman-script Telugu.
- Ask a short clarifying question only when the request is truly ambiguous.
Current UTC time: {now}. User: {name}. Preferred language: {lang}.
{memory}"""

IMG_MIME = {"png", "jpg", "jpeg", "gif", "webp"}


class AgentError(HTTPException):
    pass


def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise AgentError(503, "The AI model is not configured. Add OPENAI_API_KEY to backend/.env and restart the server.")
    return OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url, timeout=90)


def _system(user: User, db: Session) -> str:
    mem = ""
    if user.memory_enabled:
        rows = db.query(Memory).filter(Memory.user_id == user.id).order_by(Memory.id).limit(50).all()
        if rows:
            mem = "Things the user asked you to remember:\n" + "\n".join(f"- {m.content}" for m in rows)
    return SYSTEM.format(now=now().isoformat(timespec="minutes"), name=user.name or "User", lang=user.language, memory=mem)


def _user_content(db: Session, m: Message, user: User, include_images: bool):
    ids = (m.meta or {}).get("attachments", [])
    if not ids:
        return m.content
    text, parts = m.content, []
    for up in db.query(Upload).filter(Upload.id.in_(ids), Upload.user_id == user.id):
        p = Path(up.path)
        if not p.exists():
            continue
        if up.kind == "image":
            if include_images:
                b64 = base64.b64encode(p.read_bytes()).decode()
                parts.append({"type": "image_url", "image_url": {"url": f"data:{up.mime};base64,{b64}"}})
        else:
            try:
                text += f"\n\n[Attached file: {up.name}]\n{T.extract_text(p, 12000)}"
            except Exception as e:
                text += f"\n\n[Attached file {up.name} could not be read: {e}]"
    return [{"type": "text", "text": text}] + parts if parts else text


def _history(db: Session, user: User, conv: Conversation, budget: int):
    msgs = db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.id).all()
    last_user = max((m.id for m in msgs if m.role == "user"), default=None)
    out, used = [], 0
    for m in reversed(msgs):
        c = _user_content(db, m, user, m.id == last_user) if m.role == "user" else m.content
        used += len(json.dumps(c))
        if used > budget and out:
            break
        out.append({"role": m.role, "content": c})
    return list(reversed(out))


def _chat(client, msgs, tools=True):
    kw = {"model": settings.model, "messages": msgs}
    if tools:
        kw["tools"] = T.schemas()
    try:
        return client.chat.completions.create(**kw)
    except AuthenticationError:
        raise AgentError(502, "The LLM provider rejected the API key. Check OPENAI_API_KEY.")
    except RateLimitError:
        raise AgentError(429, "The LLM provider is rate limiting requests or your quota is exhausted.")
    except APIConnectionError:
        raise AgentError(502, "Could not reach the LLM provider. Check your internet connection / OPENAI_BASE_URL.")
    except BadRequestError as e:
        if "context" in str(e).lower() or "token" in str(e).lower():
            raise
        raise AgentError(400, f"The model rejected the request: {e}")
    except APIStatusError as e:
        raise AgentError(502, f"LLM provider error ({e.status_code}).")


def execute_tool(db: Session, user: User, name: str, args: dict) -> dict:
    spec = T.REGISTRY.get(name)
    if not spec:
        return {"ok": False, "error": f"Unknown tool '{name}'"}
    try:
        res = spec.fn(T.Ctx(db, user), **args)
    except TypeError as e:
        res = {"ok": False, "error": f"Invalid arguments: {e}"}
    except Exception as e:  # error recovery: report to the model so it can retry or explain
        db.rollback()
        res = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    return res


def _log(db, user, conv, tool, args, status, detail, ) -> Activity:
    a = Activity(user_id=user.id, conversation_id=conv.id if conv else None, tool=tool, args=args, status=status, detail=detail[:2000])
    db.add(a); db.commit()
    return a


def _summ(res: dict) -> str:
    return res.get("summary") or res.get("error") or ("done" if res.get("ok") else "failed")


def run_agent(db: Session, user: User, conv: Conversation) -> Message:
    """Runs the agent over the stored conversation and persists the assistant reply."""
    client = _client()
    budget = settings.history_chars
    msgs = [{"role": "system", "content": _system(user, db)}] + _history(db, user, conv, budget)
    used, pending, final = [], [], None
    for _ in range(settings.max_agent_steps):
        try:
            resp = _chat(client, msgs)
        except BadRequestError:  # token limit: trim history once and retry
            budget //= 3
            msgs = [msgs[0]] + _history(db, user, conv, budget)
            resp = _chat(client, msgs)
        m = resp.choices[0].message
        if not m.tool_calls:
            final = m.content or ""
            break
        msgs.append(m.model_dump(exclude_none=True))
        for tc in m.tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
                res = {"ok": False, "error": "Malformed tool arguments"}
            else:
                spec = T.REGISTRY.get(name)
                if spec and spec.sensitive:
                    act = _log(db, user, conv, name, args, "pending", "Waiting for user approval")
                    pending.append({"id": act.id, "tool": name, "args": args})
                    res = {"ok": False, "status": "awaiting_user_approval", "note": "Queued. The user must approve it in the UI; do NOT say it was done."}
                else:
                    res = execute_tool(db, user, name, args)
                    _log(db, user, conv, name, args, "success" if res.get("ok") else "failed", _summ(res))
            used.append({"tool": name, "ok": bool(res.get("ok")), "summary": _summ(res)})
            msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(res, ensure_ascii=False, default=str)[:8000]})
        if pending:  # stop acting; let the model explain what is waiting
            final = (_chat(client, msgs, tools=False).choices[0].message.content or "")
            break
    if final is None:
        final = "I reached the step limit before finishing. Here is what was done so far; tell me to continue if you want more."
    reply = Message(conversation_id=conv.id, role="assistant", content=final, meta={"tools": used, "pending": [p["id"] for p in pending]})
    conv.updated_at = now()
    db.add(reply); db.commit()
    return reply


def decide(db: Session, user: User, act: Activity, approve: bool) -> Message | None:
    """Approve/deny a queued sensitive action. Executes only the stored, schema-registered tool."""
    if act.status != "pending":
        raise HTTPException(409, "This action was already handled.")
    if approve:
        res = execute_tool(db, user, act.tool, act.args or {})
        act.status = "success" if res.get("ok") else "failed"
        act.detail = _summ(res)[:2000]
        text = (f"✅ **{act.tool}** completed: {act.detail}" if res.get("ok") else f"⚠️ **{act.tool}** failed: {act.detail}")
    else:
        act.status, act.detail = "denied", "Denied by user"
        text = f"🚫 You denied **{act.tool}**. Nothing was changed."
    db.commit()
    if act.conversation_id:
        conv = db.get(Conversation, act.conversation_id)
        if conv and conv.user_id == user.id:
            msg = Message(conversation_id=conv.id, role="assistant", content=text, meta={"tools": [{"tool": act.tool, "ok": act.status == "success", "summary": act.detail}]})
            conv.updated_at = now()
            db.add(msg); db.commit()
            return msg
    return None
