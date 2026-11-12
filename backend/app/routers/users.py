from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Movie, User, WatchedMovie
from ..schemas import movie_card, private_user, public_user, user_view
from ..security import current_user, hash_password, random_token
from ..services.users import MAX_AVATAR_BYTES, FieldErrors, save_avatar, update_user

router = APIRouter(prefix="/api", tags=["users"])


async def _json_body(request: Request):
    try:
        return await request.json()
    except ValueError:
        raise HTTPException(400, "Body must be valid JSON.") from None


# --- REST API ---------------------------------------------------------------
@router.get("/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.execute(select(User.id, User.username).order_by(User.id)).all()
    return [{"id": r.id, "username": r.username} for r in rows]


@router.get("/users/{user_id:int}")
def get_user(user_id: int, db: Session = Depends(get_db), viewer: User = Depends(current_user)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found.")
    return user_view(user, viewer)


@router.patch("/users/{user_id:int}")
async def patch_user(user_id: int, request: Request, db: Session = Depends(get_db),
                     viewer: User = Depends(current_user)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found.")
    if target.id != viewer.id:
        raise HTTPException(403, "You can only modify your own profile.")
    data = await _json_body(request)
    try:
        user = update_user(db, viewer, data)
    except FieldErrors as exc:
        return JSONResponse({"detail": "Validation failed.", "errors": exc.errors}, status_code=exc.status)
    return private_user(user)


@router.get("/users/{user_id:int}/watched")
def watched_movies(user_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if db.get(User, user_id) is None:
        raise HTTPException(404, "User not found.")
    rows = db.execute(
        select(Movie).join(WatchedMovie, WatchedMovie.movie_id == Movie.id)
        .where(WatchedMovie.user_id == user_id).order_by(WatchedMovie.watched_at.desc()).limit(24)
    ).scalars().all()
    return [movie_card(m, True) for m in rows]


# --- Web UI helpers (expected errors reported as {"ok": false}) --------------
@router.patch("/me")
async def update_me(request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        data = await request.json()
    except ValueError:
        data = None
    try:
        user = update_user(db, user, data)
    except FieldErrors as exc:
        return {"ok": False, "error": "Please fix the highlighted fields.", "fields": exc.errors}
    return {"ok": True, "user": private_user(user)}


@router.post("/me/avatar")
async def upload_avatar(file: UploadFile, db: Session = Depends(get_db), user: User = Depends(current_user)):
    raw = await file.read(MAX_AVATAR_BYTES + 1)
    try:
        user = save_avatar(db, user, raw)
    except FieldErrors as exc:
        return {"ok": False, "error": exc.errors.get("file", "Invalid file."), "fields": exc.errors}
    return {"ok": True, "user": private_user(user)}


@router.post("/me/api-credentials")
def regenerate_credentials(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Create (or rotate) the OAuth2 client credentials of the current user.
    The secret is only shown once; a hash is stored."""
    user.api_client_id = f"ht_{random_token(12)}"
    secret = random_token(32)
    user.api_client_secret_hash = hash_password(secret)
    db.commit()
    return {"ok": True, "client_id": user.api_client_id, "client_secret": secret}


__all__ = ["router", "public_user"]
