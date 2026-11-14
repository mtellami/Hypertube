"""Browser-session authentication used by the web UI.

These endpoints report *expected* user errors (bad credentials, invalid fields) as
200 responses with {"ok": false, ...} so the browser console stays free of failed
request messages during normal use. The public REST API (users/movies/comments,
oauth/token) uses standard HTTP status codes.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import validation as v
from ..config import get_settings
from ..db import get_db
from ..models import OAuthIdentity, PasswordResetToken, User
from ..schemas import private_user
from ..security import (
    clear_session_cookie, hash_password, optional_user, random_token, set_session_cookie, sha256,
    verify_password,
)
from ..services import oauth_providers as oauth
from ..services.mailer import send_password_reset
from ..services.users import FieldErrors, create_user, unique_username, validate_registration

router = APIRouter(prefix="/api/auth", tags=["session"])
log = logging.getLogger("hypertube.auth")
STATE_COOKIE = "ht_oauth_state"


async def _json(request: Request) -> dict:
    try:
        body = await request.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


def _fail(error: str, fields: dict | None = None) -> dict:
    return {"ok": False, "error": error, "fields": fields or {}}


@router.get("/session")
def session(user: User | None = Depends(optional_user)):
    return {"user": private_user(user) if user else None}


@router.post("/register")
async def register(request: Request, db: Session = Depends(get_db)):
    data = await _json(request)
    try:
        clean = validate_registration(db, data)
    except FieldErrors as exc:
        return _fail("Please fix the highlighted fields.", exc.errors)
    user = create_user(db, clean)
    response = JSONResponse({"ok": True, "user": private_user(user)}, status_code=201)
    set_session_cookie(response, user.id)
    return response


@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    data = await _json(request)
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        return _fail("Username and password are required.")
    user = db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
    if not verify_password(password, user.password_hash if user else None) or user is None:
        return _fail("Invalid username or password.")
    response = JSONResponse({"ok": True, "user": private_user(user)})
    set_session_cookie(response, user.id)
    return response


@router.post("/logout")
def logout():
    response = JSONResponse({"ok": True})
    clear_session_cookie(response)
    return response


@router.post("/forgot-password")
async def forgot_password(request: Request, db: Session = Depends(get_db)):
    data = await _json(request)
    try:
        email = v.check_email(data.get("email", "") if isinstance(data.get("email"), str) else "")
    except ValueError as exc:
        return _fail(str(exc), {"email": str(exc)})
    user = db.scalar(select(User).where(User.email == email))
    if user:
        token = random_token()
        db.add(PasswordResetToken(user_id=user.id, token_hash=sha256(token),
                                  expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        db.commit()
        link = f"{get_settings().public_url}/reset-password?token={token}"
        send_password_reset(user.email, user.first_name, user.language, link)
    # Same answer whether or not the account exists (no user enumeration).
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(request: Request, db: Session = Depends(get_db)):
    data = await _json(request)
    token, password = data.get("token"), data.get("password")
    if not isinstance(token, str) or not token:
        return _fail("This reset link is invalid or has expired.")
    try:
        v.check_password(password if isinstance(password, str) else "")
    except ValueError as exc:
        return _fail(str(exc), {"password": str(exc)})
    record = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256(token)))
    now = datetime.now(timezone.utc)
    if record is None or record.used_at is not None or record.expires_at < now:
        return _fail("This reset link is invalid or has expired.")
    user = db.get(User, record.user_id)
    user.password_hash = hash_password(password)
    record.used_at = now
    db.commit()
    response = JSONResponse({"ok": True, "user": private_user(user)})
    set_session_cookie(response, user.id)
    return response


# --- OAuth (Omniauth-style) -------------------------------------------------
@router.get("/oauth/providers")
def providers():
    return {"providers": [p for p in oauth.PROVIDERS if oauth.is_configured(p)]}


def _login_error(code: str) -> RedirectResponse:
    response = RedirectResponse(f"{get_settings().public_url}/login?error={code}", status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/api/auth/oauth")
    return response


@router.get("/oauth/{provider}/login")
def oauth_login(provider: str):
    if provider not in oauth.PROVIDERS or not oauth.is_configured(provider):
        return _login_error("oauth_unavailable")
    state = random_token(24)
    response = RedirectResponse(oauth.authorize_url(provider, state), status_code=302)
    response.set_cookie(STATE_COOKIE, f"{provider}:{state}", max_age=600, httponly=True,
                        secure=get_settings().secure_cookies, samesite="lax", path="/api/auth/oauth")
    return response


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: Session = Depends(get_db)):
    if provider not in oauth.PROVIDERS or not oauth.is_configured(provider):
        return _login_error("oauth_unavailable")
    code, state = request.query_params.get("code"), request.query_params.get("state")
    expected = request.cookies.get(STATE_COOKIE)
    if not code or not state or expected != f"{provider}:{state}":
        return _login_error("oauth_state")
    try:
        profile = await oauth.fetch_profile(provider, code)
    except oauth.OAuthError:
        return _login_error("oauth_failed")
    try:
        user = _user_for_profile(db, provider, profile)
    except Exception:  # never surface a 500 at the end of a provider redirect
        db.rollback()
        log.exception("OAuth sign-in failed for provider %s", provider)
        return _login_error("oauth_failed")
    if user is None:
        return _login_error("oauth_no_email")
    response = RedirectResponse(f"{get_settings().public_url}/", status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/api/auth/oauth")
    set_session_cookie(response, user.id)
    return response


def _user_for_profile(db: Session, provider: str, profile: oauth.OAuthProfile) -> User | None:
    """Find the account for a provider profile, link it by verified email, or create it."""
    identity = db.scalar(select(OAuthIdentity).where(
        OAuthIdentity.provider == provider, OAuthIdentity.provider_user_id == profile.provider_user_id))
    if identity:
        user = identity.user
    else:
        email = None
        if profile.email:
            try:
                email = v.check_email(profile.email)
            except ValueError:
                email = None
        if not email:
            return None
        # Providers only return verified addresses, so an existing account is linked.
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                username=unique_username(db, profile.username),
                first_name=v.clean_name(profile.first_name, profile.username),
                last_name=v.clean_name(profile.last_name, profile.username),
                avatar_url=profile.avatar_url,
                password_hash=None,
                language="en",
            )
            db.add(user)
            db.flush()
        db.add(OAuthIdentity(user_id=user.id, provider=provider, provider_user_id=profile.provider_user_id))
        db.commit()
    return user
