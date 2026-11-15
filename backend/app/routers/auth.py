from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Conversation, Memory, Task, User, to_dict
from ..security import current_user, hash_password, make_token, rate_limit, verify_password

router = APIRouter(prefix="/api", tags=["auth"])


class Signup(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=120)


class Login(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class Patch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    language: str | None = Field(default=None, pattern="^(auto|en|te)$")
    memory_enabled: bool | None = None
    settings: dict | None = None


class Pw(BaseModel):
    current: str
    new: str = Field(min_length=8, max_length=128)


@router.post("/auth/signup", dependencies=[Depends(rate_limit("auth", 10))])
def signup(b: Signup, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == b.email.lower()).first():
        raise HTTPException(409, "An account with this email already exists.")
    u = User(email=b.email.lower(), name=b.name.strip() or b.email.split("@")[0], password_hash=hash_password(b.password))
    db.add(u); db.commit()
    return {"token": make_token(u.id), "user": to_dict(u)}


@router.post("/auth/login", dependencies=[Depends(rate_limit("auth", 10))])
def login(b: Login, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == b.email.lower()).first()
    if not u or not verify_password(b.password, u.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    return {"token": make_token(u.id), "user": to_dict(u)}


@router.get("/me")
def me(u: User = Depends(current_user), db: Session = Depends(get_db)):
    stats = {"conversations": db.query(Conversation).filter_by(user_id=u.id).count(),
             "tasks": db.query(Task).filter_by(user_id=u.id).count(),
             "memories": db.query(Memory).filter_by(user_id=u.id).count()}
    return {**to_dict(u), "stats": stats}


@router.patch("/me")
def patch_me(b: Patch, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if b.name is not None: u.name = b.name.strip()
    if b.language is not None: u.language = b.language
    if b.memory_enabled is not None: u.memory_enabled = b.memory_enabled
    if b.settings is not None: u.settings = {**(u.settings or {}), **{k: v for k, v in b.settings.items() if k in {"voice_lang", "voice_rate", "auto_speak"}}}
    db.commit()
    return to_dict(u)


@router.post("/me/password")
def change_pw(b: Pw, u: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(b.current, u.password_hash):
        raise HTTPException(400, "Current password is incorrect.")
    u.password_hash = hash_password(b.new); db.commit()
    return {"ok": True}
