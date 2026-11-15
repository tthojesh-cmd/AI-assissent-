"""Modular agent tools. Each tool has a JSON schema, a real implementation, and a `sensitive` flag.
Sensitive tools are NEVER run directly from model output: they are queued for user approval."""
import ast, json, math, operator, re, subprocess, webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, unquote, urlparse
import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
from ..config import settings
from ..models import Memory, Task, User, now, to_dict


@dataclass
class Ctx:
    db: Session
    user: User


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    fn: Callable
    sensitive: bool = False

    def schema(self):
        return {"type": "function", "function": {"name": self.name, "description": self.description + (" Requires user approval." if self.sensitive else ""), "parameters": self.parameters}}


REGISTRY: dict[str, Tool] = {}


def tool(name, description, props=None, required=None, sensitive=False):
    def deco(fn):
        REGISTRY[name] = Tool(name, description, {"type": "object", "properties": props or {}, "required": required or []}, fn, sensitive)
        return fn
    return deco


S = lambda d: {"type": "string", "description": d}

# ------------------------------------------------------------------ sandboxed file helpers
def user_root(user: User) -> Path:
    r = (settings.workspace / f"user_{user.id}").resolve()
    r.mkdir(parents=True, exist_ok=True)
    return r


def safe_path(user: User, rel: str = "") -> Path:
    root = user_root(user)
    p = (root / (rel or "").lstrip("/\\")).resolve()
    if p != root and root not in p.parents:
        raise PermissionError("Path is outside your authorized workspace folder.")
    return p


def extract_text(p: Path, limit: int = 20000) -> str:
    ext = p.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        text = "\n".join((pg.extract_text() or "") for pg in PdfReader(str(p)).pages)
    elif ext in {".txt", ".md", ".csv", ".json", ".py", ".js", ".ts", ".tsx", ".html", ".css", ".log", ".yml", ".yaml", ".xml", ".sql"}:
        text = p.read_text(errors="replace")
    else:
        raise ValueError(f"Unsupported file type '{ext}'. Supported: PDF and plain-text formats.")
    return text[:limit]

# ------------------------------------------------------------------ planning
@tool("make_plan", "Record a short step-by-step plan before executing a complex multi-step request.",
      {"goal": S("What the user wants"), "steps": {"type": "array", "items": {"type": "string"}}}, ["goal", "steps"])
def make_plan(c: Ctx, goal: str, steps: list):
    return {"ok": True, "summary": f"Plan: {goal} ({len(steps)} steps)", "plan": steps}

# ------------------------------------------------------------------ A. internet search
@tool("web_search", "Search the internet. Returns titles, URLs and snippets. Always cite the URLs you use.",
      {"query": S("Search query"), "max_results": {"type": "integer"}}, ["query"])
def web_search(c: Ctx, query: str, max_results: int = 6):
    try:
        r = httpx.post("https://html.duckduckgo.com/html/", data={"q": query}, timeout=15,
                       headers={"User-Agent": "Mozilla/5.0 (PersonalAIAgent)"}, follow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        return {"ok": False, "error": f"Search provider unreachable: {e}"}
    out = []
    for res in BeautifulSoup(r.text, "html.parser").select(".result")[: max(1, min(max_results, 10))]:
        a = res.select_one("a.result__a")
        if not a:
            continue
        href = a.get("href", "")
        q = parse_qs(urlparse(href).query)
        url = unquote(q["uddg"][0]) if "uddg" in q else href
        sn = res.select_one(".result__snippet")
        out.append({"title": a.get_text(" ", strip=True), "url": url, "snippet": sn.get_text(" ", strip=True) if sn else ""})
    if not out:
        return {"ok": False, "error": "No results parsed (the provider may have blocked the request)."}
    return {"ok": True, "summary": f"{len(out)} results for '{query}'", "results": out}

# ------------------------------------------------------------------ G. calculator
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Pow: operator.pow, ast.Mod: operator.mod, ast.FloorDiv: operator.floordiv, ast.USub: operator.neg, ast.UAdd: operator.pos}
_FUNCS = {k: getattr(math, k) for k in ("sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "log", "log10", "exp", "factorial", "radians", "degrees", "ceil", "floor")}
_FUNCS.update(abs=abs, round=round, min=min, max=max)
_CONST = {"pi": math.pi, "e": math.e}


def safe_eval(expr: str):
    def ev(n):
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if isinstance(n, ast.BinOp) and type(n.op) in _OPS:
            l, r = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Pow) and abs(r) > 1000:
                raise ValueError("Exponent too large")
            return _OPS[type(n.op)](l, r)
        if isinstance(n, ast.UnaryOp) and type(n.op) in _OPS:
            return _OPS[type(n.op)](ev(n.operand))
        if isinstance(n, ast.Name) and n.id in _CONST:
            return _CONST[n.id]
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FUNCS and not n.keywords:
            return _FUNCS[n.func.id](*[ev(a) for a in n.args])
        raise ValueError("Unsupported expression")
    return ev(ast.parse(expr.replace("^", "**"), mode="eval").body)


@tool("calculate", "Evaluate a math expression exactly (+ - * / ** % sqrt sin cos tan log log10 exp factorial pi e).",
      {"expression": S("e.g. 'sqrt(144) + 3**2'")}, ["expression"])
def calculate(c: Ctx, expression: str):
    try:
        v = safe_eval(expression)
        return {"ok": True, "summary": f"{expression} = {v}", "result": v}
    except Exception as e:
        return {"ok": False, "error": f"Cannot evaluate: {e}"}


_UNITS = {  # to base unit
    "length": {"m": 1, "km": 1000, "cm": .01, "mm": .001, "mi": 1609.344, "ft": .3048, "in": .0254, "yd": .9144},
    "mass": {"kg": 1, "g": .001, "mg": 1e-6, "lb": .45359237, "oz": .028349523125, "t": 1000},
    "volume": {"l": 1, "ml": .001, "gal": 3.785411784, "cup": .2365882365, "tbsp": .01478676478, "tsp": .00492892159},
    "data": {"b": 1, "kb": 1024, "mb": 1024**2, "gb": 1024**3, "tb": 1024**4},
    "time": {"s": 1, "min": 60, "h": 3600, "day": 86400, "week": 604800},
}


@tool("convert_units", "Convert between units of length, mass, volume, data size, time, or temperature (c/f/k).",
      {"value": {"type": "number"}, "from_unit": S("e.g. km"), "to_unit": S("e.g. mi")}, ["value", "from_unit", "to_unit"])
def convert_units(c: Ctx, value: float, from_unit: str, to_unit: str):
    f, t = from_unit.lower().strip(), to_unit.lower().strip()
    if f in ("c", "f", "k") and t in ("c", "f", "k"):
        k = value + 273.15 if f == "c" else (value - 32) * 5 / 9 + 273.15 if f == "f" else value
        r = k - 273.15 if t == "c" else (k - 273.15) * 9 / 5 + 32 if t == "f" else k
        return {"ok": True, "summary": f"{value} {f} = {r:.4g} {t}", "result": r}
    for table in _UNITS.values():
        if f in table and t in table:
            r = value * table[f] / table[t]
            return {"ok": True, "summary": f"{value} {f} = {r:.6g} {t}", "result": r}
    return {"ok": False, "error": f"Cannot convert '{from_unit}' to '{to_unit}'."}

# ------------------------------------------------------------------ F. productivity
def _parse_due(s):
    from datetime import datetime
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None) if s else None


@tool("create_task", "Add an item to the user's to-do list.",
      {"title": S("Task title"), "description": S("Optional details"), "due_at": S("ISO-8601 UTC datetime, optional"), "priority": {"type": "string", "enum": ["low", "medium", "high"]}}, ["title"])
def create_task(c: Ctx, title, description="", due_at=None, priority="medium"):
    t = Task(user_id=c.user.id, title=title[:300], description=description, due_at=_parse_due(due_at), priority=priority)
    c.db.add(t); c.db.commit()
    return {"ok": True, "summary": f"Task #{t.id} created: {t.title}", "task": to_dict(t)}


@tool("create_reminder", "Create a reminder that notifies the user in the app at the given UTC time.",
      {"title": S("What to remind"), "due_at": S("ISO-8601 UTC datetime, e.g. 2026-11-15T09:30:00Z")}, ["title", "due_at"])
def create_reminder(c: Ctx, title, due_at):
    try:
        d = _parse_due(due_at)
    except ValueError:
        return {"ok": False, "error": "due_at must be an ISO-8601 datetime."}
    t = Task(user_id=c.user.id, title=title[:300], kind="reminder", due_at=d)
    c.db.add(t); c.db.commit()
    return {"ok": True, "summary": f"Reminder #{t.id} set for {due_at}", "task": to_dict(t)}


@tool("list_tasks", "List the user's tasks and reminders.", {"status": {"type": "string", "enum": ["pending", "done", "all"]}})
def list_tasks(c: Ctx, status="pending"):
    q = c.db.query(Task).filter(Task.user_id == c.user.id)
    if status != "all":
        q = q.filter(Task.status == status)
    rows = [to_dict(t) for t in q.order_by(Task.id.desc()).limit(50)]
    return {"ok": True, "summary": f"{len(rows)} tasks", "tasks": rows}


@tool("complete_task", "Mark a task as done.", {"task_id": {"type": "integer"}}, ["task_id"])
def complete_task(c: Ctx, task_id: int):
    t = c.db.get(Task, task_id)
    if not t or t.user_id != c.user.id:
        return {"ok": False, "error": "Task not found."}
    t.status, t.completed_at = "done", now(); c.db.commit()
    return {"ok": True, "summary": f"Task #{t.id} completed"}


@tool("save_memory", "Remember a user-approved preference, project detail or fact for future chats.",
      {"content": S("The fact to remember"), "category": {"type": "string", "enum": ["preference", "project", "language", "task", "other"]}}, ["content"], sensitive=True)
def save_memory(c: Ctx, content, category="preference"):
    if not c.user.memory_enabled:
        return {"ok": False, "error": "Memory is disabled in settings."}
    m = Memory(user_id=c.user.id, content=content[:1000], category=category)
    c.db.add(m); c.db.commit()
    return {"ok": True, "summary": f"Saved to memory: {content[:80]}"}

# ------------------------------------------------------------------ E. file assistant (sandboxed)
@tool("list_files", "List files and folders in the user's workspace folder.", {"path": S("Relative folder, '' for root")})
def list_files(c: Ctx, path=""):
    try:
        p = safe_path(c.user, path)
        items = [{"name": x.name, "type": "folder" if x.is_dir() else "file", "size": x.stat().st_size if x.is_file() else None} for x in sorted(p.iterdir())]
        return {"ok": True, "summary": f"{len(items)} items in /{path}", "items": items}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@tool("read_file", "Read a PDF or text-based file from the workspace (for summarising or extracting information).", {"path": S("Relative file path")}, ["path"])
def read_file(c: Ctx, path):
    try:
        p = safe_path(c.user, path)
        text = extract_text(p)
        return {"ok": True, "summary": f"Read {p.name} ({len(text)} chars)", "content": text}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@tool("create_folder", "Create a new folder in the workspace.", {"path": S("Relative folder path")}, ["path"])
def create_folder(c: Ctx, path):
    try:
        p = safe_path(c.user, path)
        p.mkdir(parents=True, exist_ok=True)
        return {"ok": p.is_dir(), "summary": f"Folder ready: /{path}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@tool("rename_file", "Rename or move a file/folder inside the workspace.", {"path": S("Existing relative path"), "new_path": S("New relative path")}, ["path", "new_path"], sensitive=True)
def rename_file(c: Ctx, path, new_path):
    try:
        a, b = safe_path(c.user, path), safe_path(c.user, new_path)
        if not a.exists() or b.exists():
            return {"ok": False, "error": "Source missing or destination already exists."}
        b.parent.mkdir(parents=True, exist_ok=True)
        a.rename(b)
        return {"ok": b.exists() and not a.exists(), "summary": f"Renamed {path} -> {new_path}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


_CATS = {"images": {".png", ".jpg", ".jpeg", ".gif", ".webp"}, "documents": {".pdf", ".doc", ".docx", ".txt", ".md"}, "code": {".py", ".js", ".ts", ".tsx", ".html", ".css", ".json"}, "data": {".csv", ".xlsx", ".xml"}}


@tool("organize_files", "Sort files in a workspace folder into subfolders (images, documents, code, data, other) by extension. Never deletes.", {"path": S("Relative folder")}, ["path"], sensitive=True)
def organize_files(c: Ctx, path=""):
    try:
        base, moved = safe_path(c.user, path), []
        for f in [x for x in base.iterdir() if x.is_file()]:
            cat = next((k for k, v in _CATS.items() if f.suffix.lower() in v), "other")
            dest = base / cat / f.name
            if dest.exists():
                continue
            dest.parent.mkdir(exist_ok=True); f.rename(dest)
            if dest.exists():
                moved.append(f"{f.name} -> {cat}/")
        return {"ok": True, "summary": f"Moved {len(moved)} files", "moved": moved}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ------------------------------------------------------------------ B. documents
@tool("create_document", "Create a new document file (txt, md or pdf) in the workspace. Will not overwrite existing files.",
      {"filename": S("e.g. report.pdf"), "content": S("Full document text (markdown-ish headings with # are supported for pdf)"), "folder": S("Relative folder, optional")}, ["filename", "content"])
def create_document(c: Ctx, filename, content, folder=""):
    try:
        name = re.sub(r"[^\w.\- ]", "_", filename)[:100]
        ext = Path(name).suffix.lower()
        if ext not in {".txt", ".md", ".pdf"}:
            return {"ok": False, "error": "Supported formats: .txt, .md, .pdf"}
        p = safe_path(c.user, f"{folder}/{name}")
        if p.exists():
            return {"ok": False, "error": f"{name} already exists; choose another name."}
        p.parent.mkdir(parents=True, exist_ok=True)
        if ext == ".pdf":
            from xml.sax.saxutils import escape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
            st = getSampleStyleSheet(); flow = []
            for line in content.splitlines():
                if not line.strip():
                    flow.append(Spacer(1, 8)); continue
                h = re.match(r"^(#{1,3})\s+(.*)", line)
                flow.append(Paragraph(escape(h.group(2) if h else line), st[f"Heading{len(h.group(1))}"] if h else st["BodyText"]))
            SimpleDocTemplate(str(p)).build(flow)
            from pypdf import PdfReader
            pages = len(PdfReader(str(p)).pages)  # verification: re-open the PDF
            return {"ok": pages > 0, "summary": f"Created {name} ({pages} page(s)) in /{folder}", "path": str(p.relative_to(user_root(c.user)))}
        p.write_text(content, encoding="utf-8")
        ok = p.exists() and p.stat().st_size > 0
        return {"ok": ok, "summary": f"Created {name} ({p.stat().st_size} bytes)", "path": str(p.relative_to(user_root(c.user)))}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ------------------------------------------------------------------ C/D. coding + website builder
@tool("scaffold_project", "Write a multi-file project (website, API, script) into workspace/projects/<name>. Never overwrites existing files.",
      {"name": S("Project folder name"), "files": {"type": "array", "description": "Files to write", "items": {"type": "object", "properties": {"path": S("Relative path inside the project"), "content": S("File content")}, "required": ["path", "content"]}}}, ["name", "files"], sensitive=True)
def scaffold_project(c: Ctx, name, files):
    try:
        slug = re.sub(r"[^\w\-]", "_", name)[:60]
        written = []
        for f in files[:60]:
            p = safe_path(c.user, f"projects/{slug}/{f['path']}")
            if p.exists():
                continue
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(f["content"], encoding="utf-8")
            if p.exists():
                written.append(f["path"])
        return {"ok": len(written) > 0, "summary": f"Wrote {len(written)}/{len(files)} files to projects/{slug}", "written": written}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ------------------------------------------------------------------ desktop automation (opt-in, allow-listed, no shell)
def _desktop_off():
    return {"ok": False, "error": "Desktop automation is disabled. Set DESKTOP_AUTOMATION=true in backend/.env (runs on the machine hosting the backend)."}


@tool("open_website", "Open an http(s) URL in the default browser on the user's computer.", {"url": S("https URL")}, ["url"], sensitive=True)
def open_website(c: Ctx, url):
    if not settings.desktop:
        return _desktop_off()
    if urlparse(url).scheme not in ("http", "https"):
        return {"ok": False, "error": "Only http/https URLs are allowed."}
    return {"ok": bool(webbrowser.open(url)), "summary": f"Opened {url}"}


@tool("open_app", "Open an application from the approved allow-list.", {"app": S("Allow-listed app name")}, ["app"], sensitive=True)
def open_app(c: Ctx, app):
    if not settings.desktop:
        return _desktop_off()
    cmd = settings.desktop_apps.get(app.lower())
    if not cmd:
        return {"ok": False, "error": f"'{app}' is not allow-listed. Allowed: {', '.join(settings.desktop_apps) or 'none'}"}
    try:
        proc = subprocess.Popen([cmd])  # list form, shell=False
        return {"ok": proc.poll() in (None, 0), "summary": f"Launched {app}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def schemas():
    return [t.schema() for t in REGISTRY.values()]


def describe_args(name: str, args: dict) -> str:
    return json.dumps(args, ensure_ascii=False)[:400]
