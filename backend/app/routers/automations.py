from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Automation, ExecutionLog, Task, User, now, to_dict, Conversation, Message
from ..security import current_user

router = APIRouter(prefix="/api/automations", tags=["automations"])


class AutoIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="reminder", pattern="^(reminder|agent_prompt)$")
    payload: str = Field(min_length=1, max_length=5000)
    interval_minutes: int = Field(default=60, ge=1, le=525600)
    recurring: bool = True


class AutoPatch(BaseModel):
    enabled: bool | None = None
    paused: bool | None = None
    name: str | None = Field(default=None, max_length=200)
    interval_minutes: int | None = Field(default=None, ge=1, le=525600)


def own(db, u, aid) -> Automation:
    a = db.get(Automation, aid)
    if not a or a.user_id != u.id:
        raise HTTPException(404, "Automation not found")
    return a


def execute(db: Session, a: Automation) -> tuple[str, str]:
    """Runs one automation and returns (status, output). Used by the scheduler and 'Run now'."""
    user = db.get(User, a.user_id)
    try:
        if a.kind == "reminder":
            t = Task(user_id=a.user_id, title=a.payload[:300], kind="reminder", due_at=now())
            db.add(t); db.commit()
            return "success", f"Reminder #{t.id} created"
        from ..agent.orchestrator import run_agent
        c = Conversation(user_id=a.user_id, title=f"[Automation] {a.name}"[:60]); db.add(c); db.commit()
        db.add(Message(conversation_id=c.id, role="user", content=a.payload)); db.commit()
        r = run_agent(db, user, c)  # sensitive tools still wait for approval
        return "success", f"Conversation #{c.id}: {r.content[:300]}"
    except Exception as e:
        db.rollback()
        return "failed", f"{type(e).__name__}: {getattr(e, 'detail', e)}"


def run_and_log(db: Session, a: Automation):
    status, out = execute(db, a)
    db.add(ExecutionLog(user_id=a.user_id, automation_id=a.id, automation_name=a.name, status=status, output=out))
    a.last_run, a.last_status = now(), status
    if a.recurring:
        a.next_run = now() + timedelta(minutes=a.interval_minutes)
    else:
        a.enabled, a.next_run = False, None
    db.commit()


@router.get("")
def list_all(u: User = Depends(current_user), db: Session = Depends(get_db)):
    return [to_dict(a) for a in db.query(Automation).filter_by(user_id=u.id).order_by(Automation.id.desc())]


@router.post("")
def create(b: AutoIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    a = Automation(user_id=u.id, **b.model_dump(), next_run=now() + timedelta(minutes=b.interval_minutes))
    db.add(a); db.commit()
    return to_dict(a)


@router.patch("/{aid}")
def patch(aid: int, b: AutoPatch, u: User = Depends(current_user), db: Session = Depends(get_db)):
    a = own(db, u, aid)
    for k, v in b.model_dump(exclude_none=True).items():
        setattr(a, k, v)
    if (b.enabled or b.paused is False) and a.enabled and not a.paused:
        a.next_run = now() + timedelta(minutes=a.interval_minutes)
    db.commit()
    return to_dict(a)


@router.post("/{aid}/run")
def run_now(aid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    a = own(db, u, aid); run_and_log(db, a)
    return to_dict(a)


@router.delete("/{aid}")
def delete(aid: int, u: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own(db, u, aid)); db.commit()
    return {"ok": True}


@router.get("/logs/all")
def logs(automation_id: int | None = None, u: User = Depends(current_user), db: Session = Depends(get_db)):
    q = db.query(ExecutionLog).filter_by(user_id=u.id)
    if automation_id:
        q = q.filter_by(automation_id=automation_id)
    return [to_dict(l) for l in q.order_by(ExecutionLog.id.desc()).limit(100)]
