"""Tasks, memory, files, dashboard, voice."""
import shutil
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..agent import tools as T
from ..config import settings
from ..db import get_db
from ..models import Activity, Conversation, Memory, Task, User, now, to_dict
from ..security import current_user, rate_limit

router = APIRouter(prefix="/api", tags=["data"])


def _dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None) if s else None

# ---------------------------------------------------------------- tasks
class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(default="", max_length=5000)
    kind: str = Field(default="task", pattern="^(task|reminder)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    due_at: str | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    status: str | None = Field(default=None, pattern="^(pending|done)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high)$")
    due_at: str | None = None


def own(db, model, u, i):
    o = db.get(model, i)
    if not o or o.user_id != u.id:
        raise HTTPException(404, f"{model.__name__} not found")
    return o


@router.get("/tasks")
def tasks(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(t) for t in db.query(Task).filter_by(user_id=u.id).order_by(Task.status.desc(), Task.due_at.is_(None), Task.due_at, Task.id.desc())]


@router.post("/tasks")
def add_task(b: TaskIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        due = _dt(b.due_at)
    except ValueError:
        raise HTTPException(422, "Invalid due date")
    t = Task(user_id=u.id, title=b.title.strip(), description=b.description, kind=b.kind, priority=b.priority, due_at=due)
    db.add(t); db.commit()
    return to_dict(t)


@router.patch("/tasks/{tid}")
def patch_task(tid: int, b: TaskPatch, u: User = Depends(current_user), db: Session = Depends(get_db)):
    t = own(db, Task, u, tid)
    if b.title: t.title = b.title
    if b.priority: t.priority = b.priority
    if b.due_at is not None: t.due_at = _dt(b.due_at); t.notified = False
    if b.status:
        t.status = b.status
        t.completed_at = now() if b.status == "done" else None
    db.commit()
    return to_dict(t)


@router.delete("/tasks/{tid}")
def del_task(tid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own(db, Task, u, tid)); db.commit()
    return {"ok": True}


@router.get("/tasks-due")
def due(u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Polled by the UI: returns un-notified pending items whose due time has passed, then marks them notified."""
    rows = db.query(Task).filter(Task.user_id == u.id, Task.status == "pending", Task.notified == False, Task.due_at != None, Task.due_at <= now()).all()  # noqa: E712
    for t in rows:
        t.notified = True
    db.commit()
    return [to_dict(t) for t in rows]

# ---------------------------------------------------------------- memory
class MemIn(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    category: str = Field(default="preference", max_length=30)


@router.get("/memory")
def memories(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(m) for m in db.query(Memory).filter_by(user_id=u.id).order_by(Memory.id.desc())]


@router.post("/memory")
def add_mem(b: MemIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    m = Memory(user_id=u.id, content=b.content.strip(), category=b.category); db.add(m); db.commit()
    return to_dict(m)


@router.put("/memory/{mid}")
def edit_mem(mid: int, b: MemIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    m = own(db, Memory, u, mid); m.content, m.category = b.content.strip(), b.category; db.commit()
    return to_dict(m)


@router.delete("/memory/{mid}")
def del_mem(mid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own(db, Memory, u, mid)); db.commit()
    return {"ok": True}


@router.delete("/memory")
def clear_mem(u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Memory).filter_by(user_id=u.id).delete(); db.commit()
    return {"ok": True}

# ---------------------------------------------------------------- files (sandboxed to user workspace)
def _p(u, rel):
    try:
        return T.safe_path(u, rel)
    except PermissionError as e:
        raise HTTPException(403, str(e))


class PathIn(BaseModel):
    path: str = Field(max_length=500)
    new_path: str | None = Field(default=None, max_length=500)


@router.get("/files")
def files(path: str = "", u: User = Depends(current_user)):
    p = _p(u, path)
    if not p.is_dir():
        raise HTTPException(404, "Folder not found")
    root = T.user_root(u)
    items = [{"name": x.name, "path": str(x.relative_to(root)), "type": "folder" if x.is_dir() else "file",
              "size": x.stat().st_size if x.is_file() else None, "modified": datetime.utcfromtimestamp(x.stat().st_mtime).isoformat() + "Z"} for x in p.iterdir()]
    items.sort(key=lambda i: (i["type"] != "folder", i["name"].lower()))
    return {"path": str(p.relative_to(root)) if p != root else "", "items": items}


@router.get("/files/read")
def read(path: str, u: User = Depends(current_user)):
    p = _p(u, path)
    try:
        return {"name": p.name, "content": T.extract_text(p, 100000)}
    except Exception as e:
        raise HTTPException(415, str(e))


@router.post("/files/folder")
def mkdir(b: PathIn, u: User = Depends(current_user)):
    _p(u, b.path).mkdir(parents=True, exist_ok=True)
    return {"ok": True}


@router.post("/files/rename")
def rename(b: PathIn, u: User = Depends(current_user)):
    a, n = _p(u, b.path), _p(u, b.new_path or "")
    if not a.exists() or n.exists() or not b.new_path:
        raise HTTPException(409, "Source missing or destination exists")
    a.rename(n)
    return {"ok": True}


@router.delete("/files")
def delete(path: str, u: User = Depends(current_user)):
    """Only reachable from an explicit, confirmed click in the UI. The AI agent has no delete tool."""
    p = _p(u, path)
    if p == T.user_root(u) or not p.exists():
        raise HTTPException(400, "Cannot delete this path")
    shutil.rmtree(p) if p.is_dir() else p.unlink()
    return {"ok": True}


@router.post("/files/upload", dependencies=[Depends(rate_limit("upload", 20))])
async def upload(path: str = "", file: UploadFile = File(...), u: User = Depends(current_user)):
    import re
    dest = _p(u, path)
    name = re.sub(r"[^\w.\- ]", "_", file.filename or "file")[:100]
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, "File too large")
    if (dest / name).exists():
        raise HTTPException(409, "A file with this name already exists")
    dest.mkdir(parents=True, exist_ok=True)
    (dest / name).write_bytes(data)
    return {"ok": True, "name": name}

# ---------------------------------------------------------------- dashboard
@router.get("/dashboard")
def dashboard(u: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter_by(user_id=u.id)
    done, pend = t.filter_by(status="done").count(), t.filter_by(status="pending").count()
    week = now() - timedelta(days=6)
    acts = db.query(func.date(Activity.created_at), func.count()).filter(Activity.user_id == u.id, Activity.created_at >= week).group_by(func.date(Activity.created_at)).all()
    by_day = {str(d): n for d, n in acts}
    series = [{"day": (week + timedelta(days=i)).strftime("%a"), "count": by_day.get((week + timedelta(days=i)).strftime("%Y-%m-%d"), 0)} for i in range(7)]
    return {
        "name": u.name, "online": bool(settings.openai_api_key), "model": settings.model,
        "completed": done, "pending": pend,
        "pending_approvals": db.query(Activity).filter_by(user_id=u.id, status="pending").count(),
        "conversations": [to_dict(c) for c in db.query(Conversation).filter_by(user_id=u.id).order_by(Conversation.updated_at.desc()).limit(5)],
        "activities": [to_dict(a) for a in db.query(Activity).filter_by(user_id=u.id).order_by(Activity.id.desc()).limit(8)],
        "activity_by_day": series,
        "tool_success": {s: n for s, n in db.query(Activity.status, func.count()).filter(Activity.user_id == u.id).group_by(Activity.status).all()},
    }

# ---------------------------------------------------------------- voice
@router.get("/voice/status")
def voice_status():
    return {"browser_speech": True, "server_transcription": bool(settings.openai_api_key)}


@router.post("/voice/transcribe", dependencies=[Depends(rate_limit("voice", 20))])
async def transcribe(file: UploadFile = File(...), u: User = Depends(current_user)):
    """Optional advanced speech-to-text (Whisper-compatible). The UI defaults to the browser Speech API."""
    if not settings.openai_api_key:
        raise HTTPException(503, "Server transcription needs OPENAI_API_KEY.")
    from openai import OpenAI
    data = await file.read(10 * 1024 * 1024)
    c = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    r = c.audio.transcriptions.create(model="whisper-1", file=(file.filename or "audio.webm", data))
    return {"text": r.text}
