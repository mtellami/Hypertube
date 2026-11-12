"""Password hashing, tokens and authentication dependencies."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User

SESSION_COOKIE = "ht_session"
CSRF_HEADER = "x-requested-with"
_hasher = PasswordHasher()
_JWT_ALG = "HS256"


# --- Passwords --------------------------------------------------------------
def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        # Spend comparable time so missing accounts are not distinguishable by timing.
        _hasher.hash(password)
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


# --- JWT --------------------------------------------------------------------
def create_token(user_id: int, kind: str, lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "typ": kind, "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, get_settings().secret_key, algorithm=_JWT_ALG)


def decode_token(token: str, kind: str) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[_JWT_ALG])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != kind:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, ValueError):
        return None


def set_session_cookie(response: Response, user_id: int) -> None:
    s = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        create_token(user_id, "session", timedelta(days=s.session_days)),
        max_age=s.session_days * 86400,
        httponly=True,
        secure=s.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# --- Dependencies -----------------------------------------------------------
def _resolve_user(request: Request, db: Session) -> User | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        user_id = decode_token(auth[7:].strip(), "api")
        if user_id is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                                headers={"WWW-Authenticate": "Bearer"})
    else:
        cookie = request.cookies.get(SESSION_COOKIE)
        if not cookie:
            return None
        user_id = decode_token(cookie, "session")
        if user_id is None:
            return None
        # Cookie-authenticated state-changing requests must carry a custom header that
        # cross-site forms cannot set: this protects against CSRF.
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != "hypertube":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing CSRF header")
    return db.get(User, user_id)


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    return _resolve_user(request, db)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = _resolve_user(request, db)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    return user
