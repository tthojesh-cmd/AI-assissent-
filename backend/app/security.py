import hashlib, hmac, os, time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


def hash_password(p: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(p.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(p: str, stored: str) -> bool:
    try:
        s, h = stored.split("$")
        dk = hashlib.scrypt(p.encode(), salt=bytes.fromhex(s), n=2**14, r=8, p=1)
        return hmac.compare_digest(dk.hex(), h)
    except Exception:
        return False


def make_token(uid: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_hours)
    return jwt.encode({"sub": str(uid), "exp": exp}, settings.jwt_secret, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        uid = int(jwt.decode(cred.credentials, settings.jwt_secret, algorithms=["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Session expired. Please sign in again.")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(401, "Account not found")
    return user


# ---- simple in-memory sliding-window rate limiter (use Redis behind several workers) ----
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(name: str, limit: int, window: int = 60):
    def dep(request: Request):
        key = f"{name}:{request.client.host if request.client else 'anon'}"
        q, t = _hits[key], time.monotonic()
        while q and q[0] < t - window:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, f"Too many requests. Try again in a minute.")
        q.append(t)
    return dep
