"""Response serializers. Input validation lives in validation.py and the routers."""

from datetime import datetime

from pydantic import BaseModel

from .models import Comment, Movie, User


class PublicUser(BaseModel):
    id: int
    username: str
    first_name: str
    last_name: str
    profile_picture_url: str | None
    language: str
    created_at: datetime


class PrivateUser(PublicUser):
    email: str
    has_password: bool
    oauth_providers: list[str]
    api_client_id: str | None


def public_user(u: User) -> dict:
    return PublicUser(
        id=u.id,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
        profile_picture_url=u.avatar_url,
        language=u.language,
        created_at=u.created_at,
    ).model_dump(mode="json")


def private_user(u: User) -> dict:
    return PrivateUser(
        **public_user(u),
        email=u.email,
        has_password=u.password_hash is not None,
        oauth_providers=sorted(i.provider for i in u.identities),
        api_client_id=u.api_client_id,
    ).model_dump(mode="json")


def user_view(u: User, viewer: User | None) -> dict:
    """The email address is only ever disclosed to the profile owner."""
    return (
        private_user(u) if viewer is not None and viewer.id == u.id else public_user(u)
    )


def comment_view(c: Comment) -> dict:
    return {
        "id": c.id,
        "comment": c.content,
        "username": c.user.username,
        "user_id": c.user_id,
        "author_picture_url": c.user.avatar_url,
        "movie_id": c.movie_id,
        "date": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def movie_card(m: Movie, watched: bool = False) -> dict:
    return {
        "id": m.id,
        "name": m.title,
        "year": m.year,
        "rating": round(m.rating, 1) if m.rating is not None else None,
        "cover_url": m.poster_url,
        "genres": m.genres or [],
        "source": m.source,
        "watched": watched,
    }
