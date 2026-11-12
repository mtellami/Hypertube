"""POST /api/oauth/token — OAuth2 token endpoint for the REST API.

Supported grants:
  * client_credentials: client_id + client_secret (generated per user from the profile page)
  * password: username + password (resource-owner password grant)
Credentials may be sent as form fields, JSON, or HTTP Basic auth (client_id:client_secret).
"""
import base64
import binascii
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..security import create_token, verify_password

router = APIRouter(prefix="/api/oauth", tags=["oauth2"])


def _error(code: str, description: str, status: int = 400) -> JSONResponse:
    headers = {"WWW-Authenticate": "Basic"} if status == 401 else None
    return JSONResponse({"error": code, "error_description": description}, status_code=status,
                        headers=headers or {"Cache-Control": "no-store"})


@router.post("/token")
async def token(request: Request, db: Session = Depends(get_db)):
    content_type = request.headers.get("content-type", "")
    try:
        if content_type.startswith("application/json"):
            data = await request.json()
            data = data if isinstance(data, dict) else {}
        else:
            data = dict(await request.form())
    except (ValueError, AssertionError):
        return _error("invalid_request", "Malformed request body.")
    data = {k: v for k, v in data.items() if isinstance(v, str)}

    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("basic "):
        try:
            cid, _, secret = base64.b64decode(auth[6:]).decode().partition(":")
            data.setdefault("client_id", cid)
            data.setdefault("client_secret", secret)
        except (binascii.Error, UnicodeDecodeError):
            return _error("invalid_client", "Malformed Basic credentials.", 401)

    grant = data.get("grant_type") or "client_credentials"
    user: User | None = None
    if grant == "client_credentials":
        cid, secret = data.get("client_id"), data.get("client_secret")
        if not cid or not secret:
            return _error("invalid_request", "client_id and client_secret are required.")
        user = db.scalar(select(User).where(User.api_client_id == cid))
        if not verify_password(secret, user.api_client_secret_hash if user else None):
            return _error("invalid_client", "Invalid client credentials.", 401)
    elif grant == "password":
        username, password = data.get("username"), data.get("password")
        if not username or not password:
            return _error("invalid_request", "username and password are required.")
        user = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
        if not verify_password(password, user.password_hash if user else None):
            return _error("invalid_grant", "Invalid username or password.")
    else:
        return _error("unsupported_grant_type", "Use client_credentials or password.")

    minutes = get_settings().api_token_minutes
    return JSONResponse(
        {
            "access_token": create_token(user.id, "api", timedelta(minutes=minutes)),
            "token_type": "Bearer",
            "expires_in": minutes * 60,
        },
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )
