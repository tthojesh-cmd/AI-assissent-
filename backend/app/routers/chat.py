import re, uuid
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..agent.orchestrator import run_agent
from ..config import settings
from ..db import get_db
from ..models import Conversation, Message, Upload, User, now, to_dict
from ..security import current_user, rate_limit

router = APIRouter(prefix="/api/chat", tags=["chat"])
ALLOWED = {".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image", ".pdf": "pdf",
           ".txt": "text", ".md": "text", ".csv": "text", ".json": "text", ".py": "text", ".js": "text", ".html": "text", ".css": "text"}


def own_conv(db: Session, user: User, cid: int) -> Conversation:
    c = db.get(Conversation, cid)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return c


class NewMsg(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    attachment_ids: list[int] = []


@router.get("/conversations")
def list_convs(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Conversation).filter_by(user_id=u.id).order_by(Conversation.updated_at.desc()).limit(300).all()
    return [to_dict(c) for c in rows]


@router.post("/conversations")
def new_conv(u: User = Depends(current_user), db: Session = Depends(get_db)):
    c = Conversation(user_id=u.id); db.add(c); db.commit()
    return to_dict(c)


@router.get("/conversations/{cid}")
def get_conv(cid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    c = own_conv(db, u, cid)
    return {**to_dict(c), "messages": [to_dict(m) for m in c.messages]}


@router.delete("/conversations/{cid}")
def del_conv(cid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own_conv(db, u, cid)); db.commit()
    return {"ok": True}


@router.delete("/conversations")
def clear_all(u: User = Depends(current_user), db: Session = Depends(get_db)):
    for c in db.query(Conversation).filter_by(user_id=u.id).all():
        db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/conversations/{cid}/messages", dependencies=[Depends(rate_limit("chat", 30))])
def send(cid: int, b: NewMsg, u: User = Depends(current_user), db: Session = Depends(get_db)):
    c = own_conv(db, u, cid)
    ups = db.query(Upload).filter(Upload.id.in_(b.attachment_ids), Upload.user_id == u.id).all() if b.attachment_ids else []
    um = Message(conversation_id=c.id, role="user", content=b.content.strip(),
                 meta={"attachments": [x.id for x in ups], "attachment_names": [x.name for x in ups]})
    if c.title == "New chat":
        c.title = b.content.strip()[:50]
    db.add(um); db.commit()
    reply = run_agent(db, u, c)  # raises a readable HTTP error if the LLM is unavailable (user msg stays saved)
    return {"user_message": to_dict(um), "assistant_message": to_dict(reply), "title": c.title}


@router.post("/conversations/{cid}/regenerate", dependencies=[Depends(rate_limit("chat", 30))])
def regenerate(cid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    c = own_conv(db, u, cid)
    msgs = list(c.messages)
    last_user = next((i for i in range(len(msgs) - 1, -1, -1) if msgs[i].role == "user"), None)
    if last_user is None:
        raise HTTPException(400, "Nothing to regenerate.")
    for m in msgs[last_user + 1:]:
        db.delete(m)
    db.commit()
    db.refresh(c)
    return {"assistant_message": to_dict(run_agent(db, u, c))}


@router.post("/uploads", dependencies=[Depends(rate_limit("upload", 20))])
async def upload(file: UploadFile = File(...), u: User = Depends(current_user), db: Session = Depends(get_db)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(415, f"File type '{ext or 'unknown'}' is not allowed. Allowed: {', '.join(sorted(ALLOWED))}")
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB.")
    d = settings.uploads / f"user_{u.id}"; d.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^\w.\-]", "_", file.filename or "file")[:80]
    p = d / f"{uuid.uuid4().hex[:8]}_{safe}"
    p.write_bytes(data)
    up = Upload(user_id=u.id, name=safe, mime=file.content_type or "application/octet-stream", kind=ALLOWED[ext], path=str(p), size=len(data))
    db.add(up); db.commit()
    return to_dict(up)
