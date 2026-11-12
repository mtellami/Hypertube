"""User creation and profile update logic shared by the UI and the REST API."""
import io
import os
import re
import secrets
import warnings
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import validation as v
from ..config import get_settings
from ..models import User
from ..security import hash_password

MAX_AVATAR_BYTES = 5 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 40_000_000


class FieldErrors(Exception):
    def __init__(self, errors: dict[str, str], status: int = 422):
        super().__init__(errors)
        self.errors = errors
        self.status = status


def avatars_dir() -> Path:
    path = Path(get_settings().data_dir) / "media" / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def username_taken(db: Session, username: str, exclude_id: int | None = None) -> bool:
    q = select(User.id).where(func.lower(User.username) == username.lower())
    if exclude_id:
        q = q.where(User.id != exclude_id)
    return db.scalar(q) is not None


def email_taken(db: Session, email: str, exclude_id: int | None = None) -> bool:
    q = select(User.id).where(User.email == email.lower())
    if exclude_id:
        q = q.where(User.id != exclude_id)
    return db.scalar(q) is not None


def _run(errors: dict, field: str, fn, value):
    if not isinstance(value, str):
        errors[field] = "Must be a string."
        return None
    try:
        return fn(value)
    except ValueError as exc:
        errors[field] = str(exc)
        return None


def validate_registration(db: Session, data: dict) -> dict:
    errors: dict[str, str] = {}
    out = {
        "email": _run(errors, "email", v.check_email, data.get("email", "")),
        "username": _run(errors, "username", v.check_username, data.get("username", "")),
        "first_name": _run(errors, "first_name", v.check_name, data.get("first_name", "")),
        "last_name": _run(errors, "last_name", v.check_name, data.get("last_name", "")),
        "password": _run(errors, "password", v.check_password, data.get("password", "")),
        "language": _run(errors, "language", v.check_language, data.get("language") or "en"),
    }
    if out["username"] and username_taken(db, out["username"]):
        errors["username"] = "This username is already taken."
    if out["email"] and email_taken(db, out["email"]):
        errors["email"] = "An account already uses this email address."
    if errors:
        raise FieldErrors(errors)
    return out


def create_user(db: Session, data: dict) -> User:
    user = User(
        email=data["email"], username=data["username"], first_name=data["first_name"],
        last_name=data["last_name"], password_hash=hash_password(data["password"]),
        language=data["language"],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


UPDATABLE = {
    "username": v.check_username,
    "email": v.check_email,
    "password": v.check_password,
    "first_name": v.check_name,
    "last_name": v.check_name,
    "language": v.check_language,
    "profile_picture_url": v.check_avatar_url,
}


def update_user(db: Session, user: User, data: dict) -> User:
    if not isinstance(data, dict):
        raise FieldErrors({"body": "Expected a JSON object."})
    unknown = set(data) - set(UPDATABLE)
    if unknown:
        raise FieldErrors({k: "Unknown field." for k in sorted(unknown)})
    if not data:
        raise FieldErrors({"body": "No field to update."})
    errors: dict[str, str] = {}
    clean = {k: _run(errors, k, UPDATABLE[k], val) for k, val in data.items()}
    if clean.get("username") and username_taken(db, clean["username"], user.id):
        errors["username"] = "This username is already taken."
    if clean.get("email") and email_taken(db, clean["email"], user.id):
        errors["email"] = "An account already uses this email address."
    if errors:
        conflict = any("taken" in e or "already" in e for e in errors.values())
        raise FieldErrors(errors, 409 if conflict and len(errors) == 1 else 422)

    for key, value in clean.items():
        if key == "password":
            user.password_hash = hash_password(value)
        elif key == "profile_picture_url":
            _remove_local_avatar(user)
            user.avatar_url = value
        else:
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def _remove_local_avatar(user: User) -> None:
    if user.avatar_url and user.avatar_url.startswith("/api/media/avatars/"):
        name = user.avatar_url.rsplit("/", 1)[-1]
        if re.match(r"^[A-Za-z0-9_-]+\.webp$", name):
            try:
                os.remove(avatars_dir() / name)
            except FileNotFoundError:
                pass


def save_avatar(db: Session, user: User, raw: bytes) -> User:
    """Validate an uploaded picture by decoding it, then re-encode it: only clean WebP is stored."""
    if not raw:
        raise FieldErrors({"file": "The file is empty."})
    if len(raw) > MAX_AVATAR_BYTES:
        raise FieldErrors({"file": "The picture must be smaller than 5 MB."}, 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                if probe.format not in ("JPEG", "PNG", "WEBP", "GIF"):
                    raise FieldErrors({"file": "Only JPEG, PNG, WebP or GIF pictures are allowed."}, 415)
                probe.verify()
            with Image.open(io.BytesIO(raw)) as img:
                img.seek(0)
                img = ImageOps.exif_transpose(img).convert("RGB")
                img = ImageOps.fit(img, (512, 512), Image.Resampling.LANCZOS)
                out = io.BytesIO()
                img.save(out, "WEBP", quality=85)
    except FieldErrors:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError,
            Image.DecompressionBombWarning, SyntaxError):
        raise FieldErrors({"file": "This file is not a valid image."}, 415) from None

    name = f"{secrets.token_urlsafe(18)}.webp"
    (avatars_dir() / name).write_bytes(out.getvalue())
    _remove_local_avatar(user)
    user.avatar_url = f"/api/media/avatars/{name}"
    db.commit()
    db.refresh(user)
    return user


def unique_username(db: Session, wanted: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_.-]", "", wanted)[:28] or "user"
    if len(base) < 3:
        base = f"{base}user"
    candidate = base
    while username_taken(db, candidate):
        candidate = f"{base}{secrets.randbelow(10000)}"
    return candidate
