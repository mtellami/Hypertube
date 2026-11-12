from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..db import get_db
from ..models import Comment, Movie, User
from ..schemas import comment_view
from ..security import current_user

router = APIRouter(prefix="/api", tags=["comments"])
MAX_LEN = 1000


async def _body(request: Request) -> dict:
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(400, "Body must be valid JSON.") from None
    if not isinstance(data, dict):
        raise HTTPException(400, "Body must be a JSON object.")
    return data


def _clean_comment(value) -> str:
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(422, "Field 'comment' is required and must be a non-empty string.")
    value = value.strip()
    if len(value) > MAX_LEN:
        raise HTTPException(422, f"A comment cannot exceed {MAX_LEN} characters.")
    return value


def _get_comment(db: Session, comment_id: int) -> Comment:
    comment = db.scalar(select(Comment).options(joinedload(Comment.user)).where(Comment.id == comment_id))
    if comment is None:
        raise HTTPException(404, "Comment not found.")
    return comment


def _create(db: Session, user: User, movie_id, text) -> Comment:
    if not isinstance(movie_id, int) or isinstance(movie_id, bool):
        raise HTTPException(422, "Field 'movie_id' must be an integer.")
    if db.get(Movie, movie_id) is None:
        raise HTTPException(404, "Movie not found.")
    comment = Comment(user_id=user.id, movie_id=movie_id, content=_clean_comment(text))
    db.add(comment)
    db.commit()
    return _get_comment(db, comment.id)


@router.get("/comments")
def latest_comments(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.scalars(select(Comment).options(joinedload(Comment.user))
                      .order_by(Comment.created_at.desc(), Comment.id.desc()).limit(50)).all()
    return [comment_view(c) for c in rows]


@router.post("/comments", status_code=201)
async def post_comment(request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    data = await _body(request)
    return comment_view(_create(db, user, data.get("movie_id"), data.get("comment")))


@router.get("/comments/{comment_id:int}")
def get_comment(comment_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return comment_view(_get_comment(db, comment_id))


@router.patch("/comments/{comment_id:int}")
async def patch_comment(comment_id: int, request: Request, db: Session = Depends(get_db),
                        user: User = Depends(current_user)):
    comment = _get_comment(db, comment_id)
    if comment.user_id != user.id:
        raise HTTPException(403, "You can only edit your own comments.")
    data = await _body(request)
    if "username" in data and data["username"] != user.username:
        raise HTTPException(403, "A comment's author cannot be changed.")
    unknown = set(data) - {"comment", "username"}
    if unknown:
        raise HTTPException(422, f"Unknown field(s): {', '.join(sorted(unknown))}.")
    comment.content = _clean_comment(data.get("comment"))
    comment.updated_at = datetime.now(timezone.utc)
    db.commit()
    return comment_view(_get_comment(db, comment_id))


@router.delete("/comments/{comment_id:int}", status_code=204)
def delete_comment(comment_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    comment = _get_comment(db, comment_id)
    if comment.user_id != user.id:
        raise HTTPException(403, "You can only delete your own comments.")
    db.delete(comment)
    db.commit()
    return Response(status_code=204)


@router.get("/movies/{movie_id:int}/comments")
def movie_comments(movie_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if db.get(Movie, movie_id) is None:
        raise HTTPException(404, "Movie not found.")
    rows = db.scalars(select(Comment).options(joinedload(Comment.user)).where(Comment.movie_id == movie_id)
                      .order_by(Comment.created_at.desc(), Comment.id.desc())).all()
    return [comment_view(c) for c in rows]


@router.post("/movies/{movie_id:int}/comments", status_code=201)
async def post_movie_comment(movie_id: int, request: Request, db: Session = Depends(get_db),
                             user: User = Depends(current_user)):
    data = await _body(request)
    if "movie_id" in data and data["movie_id"] != movie_id:
        raise HTTPException(422, "movie_id in the body does not match the URL.")
    return comment_view(_create(db, user, movie_id, data.get("comment")))
