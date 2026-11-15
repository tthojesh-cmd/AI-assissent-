from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..agent import tools as T
from ..agent.orchestrator import decide, run_agent
from ..config import settings
from ..db import get_db
from ..models import Activity, Conversation, Message, User, to_dict
from ..security import current_user, rate_limit

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.get("/status")
def status():
    return {"online": bool(settings.openai_api_key), "model": settings.model, "desktop_enabled": settings.desktop,
            "message": "Agent online" if settings.openai_api_key else "OPENAI_API_KEY is not set"}


@router.get("/tools")
def tools():
    return [{"name": t.name, "description": t.description, "sensitive": t.sensitive,
             "available": settings.desktop if t.name in ("open_website", "open_app") else True} for t in T.REGISTRY.values()]


@router.get("/activities")
def activities(limit: int = 50, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(a) for a in db.query(Activity).filter_by(user_id=u.id).order_by(Activity.id.desc()).limit(min(limit, 200))]


@router.get("/pending")
def pending(conversation_id: int | None = None, u: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(Activity).filter_by(user_id=u.id, status="pending")
    if conversation_id:
        q = q.filter_by(conversation_id=conversation_id)
    return [to_dict(a) for a in q.order_by(Activity.id)]


def _act(db, u, aid):
    a = db.get(Activity, aid)
    if not a or a.user_id != u.id:
        raise HTTPException(404, "Action not found")
    return a


@router.post("/activities/{aid}/approve")
def approve(aid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _act(db, u, aid); m = decide(db, u, a, True)
    return {"activity": to_dict(a), "message": to_dict(m) if m else None}


@router.post("/activities/{aid}/deny")
def deny(aid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _act(db, u, aid); m = decide(db, u, a, False)
    return {"activity": to_dict(a), "message": to_dict(m) if m else None}


class Run(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)


@router.post("/run", dependencies=[Depends(rate_limit("chat", 30))])
def run(b: Run, u: User = Depends(current_user), db: Session = Depends(get_db)):
    c = Conversation(user_id=u.id, title=("Task: " + b.prompt)[:60]); db.add(c); db.commit()
    db.add(Message(conversation_id=c.id, role="user", content=b.prompt)); db.commit()
    r = run_agent(db, u, c)
    return {"conversation_id": c.id, "message": to_dict(r)}
