from datetime import datetime, timezone

import shutil

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import Comment, Movie, User, WatchedMovie
from ..schemas import movie_card
from ..security import current_user
from ..services import catalog, streaming, tmdb
from ..services.subtitles import subtitles_dir

router = APIRouter(prefix="/api", tags=["movies"])
PAGE_SIZE = 24


def _watched_ids(db: Session, user_id: int, ids: list[int]) -> set[int]:
    if not ids:
        return set()
    return set(
        db.scalars(
            select(WatchedMovie.movie_id).where(
                WatchedMovie.user_id == user_id, WatchedMovie.movie_id.in_(ids)
            )
        )
    )


@router.get("/movies")
async def front_page():
    """Public: the movies shown on the front page (most popular at the sources)."""
    try:
        ids = await catalog.pool("")
    except catalog.SourcesUnavailable:
        raise HTTPException(503, "Video sources are temporarily unavailable.") from None

    def load():
        with SessionLocal() as db:
            movies = db.scalars(select(Movie).where(Movie.id.in_(ids))).all()
            movies = sorted(movies, key=lambda m: m.popularity or 0, reverse=True)[:50]
            return [
                {
                    "id": m.id,
                    "name": m.title,
                    "year": m.year,
                    "rating": round(m.rating, 1) if m.rating is not None else None,
                    "cover_url": m.poster_url,
                }
                for m in movies
            ]

    return await run_in_threadpool(load)


@router.get("/library")
async def library(
    user: User = Depends(current_user),
    q: str = Query("", max_length=100),
    genre: str | None = Query(None, max_length=40),
    min_rating: float | None = Query(None, ge=0, le=10),
    year_min: int | None = Query(None, ge=1850, le=2100),
    year_max: int | None = Query(None, ge=1850, le=2100),
    sort: str | None = Query(None, pattern="^(name|year|rating|popularity)$"),
    order: str | None = Query(None, pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1, le=100),
):
    query = q.strip()
    try:
        ids = await catalog.pool(query)
        warning = None
    except catalog.SourcesUnavailable:
        ids, warning = [], "sources_unavailable"

    def load():
        with SessionLocal() as db:
            movies = (
                db.scalars(select(Movie).where(Movie.id.in_(ids))).all() if ids else []
            )
            genres = sorted({g for m in movies for g in (m.genres or [])})
            movies = catalog.filter_sort(
                movies,
                searching=bool(query),
                genre=genre,
                min_rating=min_rating,
                year_min=year_min,
                year_max=year_max,
                sort=sort,
                order=order,
            )
            total = len(movies)
            chunk = movies[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
            watched = _watched_ids(db, user.id, [m.id for m in chunk])
            return {
                "results": [movie_card(m, m.id in watched) for m in chunk],
                "page": page,
                "total": total,
                "has_more": page * PAGE_SIZE < total,
                "genres": genres,
                "warning": warning,
            }

    return await run_in_threadpool(load)


def _load_movie(movie_id: int) -> Movie:
    with SessionLocal() as db:
        return db.get(Movie, movie_id)


async def ensure_details(movie_id: int) -> None:
    """Fetch full TMDb details (cast, crew, runtime, IMDb id) once per movie."""
    if not tmdb.enabled():
        return
    movie = await run_in_threadpool(_load_movie, movie_id)
    if movie.enriched_at is None:
        await catalog.enrich([movie_id])
        movie = await run_in_threadpool(_load_movie, movie_id)
    if movie.details_at is not None:
        return
    data = None
    if movie.tmdb_id:
        async with catalog.http_client() as client:
            data = await tmdb.details(client, movie.tmdb_id)

    def save():
        with SessionLocal() as db:
            m = db.get(Movie, movie_id)
            m.details_at = datetime.now(timezone.utc)
            if data:
                crew = (data.get("credits") or {}).get("crew") or []
                cast = (data.get("credits") or {}).get("cast") or []
                directors = [c["name"] for c in crew if c.get("job") == "Director"]
                producers = list(
                    dict.fromkeys(
                        c["name"]
                        for c in crew
                        if c.get("job") in ("Producer", "Executive Producer")
                    )
                )
                if directors:
                    m.directors = directors[:4]
                m.producers = producers[:6]
                m.cast = [
                    {
                        "name": c["name"],
                        "character": c.get("character") or "",
                        "photo": tmdb.poster(c.get("profile_path"), "w185"),
                    }
                    for c in cast[:12]
                ]
                if data.get("runtime"):
                    m.runtime_minutes = data["runtime"]
                m.imdb_id = data.get("imdb_id") or (data.get("external_ids") or {}).get(
                    "imdb_id"
                )
                if data.get("genres"):
                    m.genres = [g["name"] for g in data["genres"]]
            db.commit()

    await run_in_threadpool(save)


# One track per language: human-made subtitles beat Internet Archive's auto-generated (ASR) ones.
SUBTITLE_PREFERENCE = {"opensubtitles": 0, "peertube": 1, "torrent": 2}


def best_subtitles(subtitles: list) -> list:
    best: dict = {}
    for sub in subtitles:
        current = best.get(sub.lang)
        if current is None or SUBTITLE_PREFERENCE.get(
            sub.source, 9
        ) < SUBTITLE_PREFERENCE.get(current.source, 9):
            best[sub.lang] = sub
    return sorted(best.values(), key=lambda s: (s.lang != "en", s.lang))


def movie_detail(db: Session, movie: Movie, viewer: User) -> dict:
    comments = db.scalar(
        select(func.count(Comment.id)).where(Comment.movie_id == movie.id)
    )
    watched = (
        db.scalar(
            select(WatchedMovie.id).where(
                WatchedMovie.user_id == viewer.id, WatchedMovie.movie_id == movie.id
            )
        )
        is not None
    )
    return {
        "id": movie.id,
        "name": movie.title,
        "year": movie.year,
        "rating": round(movie.rating, 1) if movie.rating is not None else None,
        "rating_source": "TMDb" if movie.rating is not None else None,
        "length": movie.runtime_minutes,
        "cover_url": movie.poster_url,
        "backdrop_url": movie.backdrop_url,
        "summary": movie.summary,
        "genres": movie.genres or [],
        "language": movie.language,
        "directors": movie.directors or [],
        "producers": movie.producers or [],
        "cast": movie.cast or [],
        "imdb_id": movie.imdb_id,
        "source": movie.source,
        "source_url": movie.page_url,
        "available_subtitles": [
            {
                "id": s.id,
                "lang": s.lang,
                "label": s.label,
                "url": f"/api/movies/{movie.id}/subtitles/{s.id}",
            }
            for s in best_subtitles(movie.subtitles)
        ],
        "comments_count": comments,
        "watched": watched,
        "downloaded": movie.download_state == "complete",
    }


@router.get("/movies/{movie_id:int}")
async def get_movie(
    movie_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(404, "Movie not found.")
    await ensure_details(movie_id)
    db.expire_all()
    movie = db.get(Movie, movie_id)
    return movie_detail(db, movie, user)


# --- Bonus API routes -----------------------------------------------------------
@router.get("/movies/search")
async def api_search(
    q: str = Query(..., min_length=1, max_length=100),
    page: int = Query(1, ge=1, le=100),
    _: User = Depends(current_user),
):
    """Search both sources; results sorted by name, 24 per page."""
    try:
        ids = await catalog.pool(q.strip())
    except catalog.SourcesUnavailable:
        raise HTTPException(503, "Video sources are temporarily unavailable.") from None

    def load():
        with SessionLocal() as db:
            movies = (
                db.scalars(select(Movie).where(Movie.id.in_(ids))).all() if ids else []
            )
            movies = catalog.filter_sort(
                movies,
                searching=True,
                genre=None,
                min_rating=None,
                year_min=None,
                year_max=None,
                sort=None,
                order=None,
            )
            chunk = movies[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
            return {
                "page": page,
                "total": len(movies),
                "has_more": page * PAGE_SIZE < len(movies),
                "results": [
                    {
                        "id": m.id,
                        "name": m.title,
                        "year": m.year,
                        "rating": round(m.rating, 1) if m.rating is not None else None,
                    }
                    for m in chunk
                ],
            }

    return await run_in_threadpool(load)


@router.post("/movies", status_code=201)
async def add_movie(
    request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Import a film from a source: {"source": "archive"|"peertube", "source_id": "..."}.
    PeerTube ids are "host/uuid" and must belong to an allowed instance."""
    try:
        data = await request.json()
    except ValueError:
        raise HTTPException(400, "Body must be valid JSON.") from None
    if not isinstance(data, dict):
        raise HTTPException(400, "Body must be a JSON object.")
    source, source_id = data.get("source"), data.get("source_id")
    if source not in ("archive", "peertube"):
        raise HTTPException(422, "Field 'source' must be 'archive' or 'peertube'.")
    if not isinstance(source_id, str) or not 1 <= len(source_id.strip()) <= 255:
        raise HTTPException(422, "Field 'source_id' must be a non-empty string.")
    try:
        result = await catalog.import_one(source, source_id.strip(), user.id)
    except Exception:
        raise HTTPException(503, "The source could not be reached.") from None
    if result is None:
        raise HTTPException(
            404, "No legally distributable video with this id was found at the source."
        )
    movie_id, created = result
    await ensure_details(movie_id)
    catalog.forget_pools()
    db.expire_all()
    body = movie_detail(db, db.get(Movie, movie_id), user)
    if not created:
        return JSONResponse(
            {"detail": "This movie already exists.", "movie": body},
            status_code=409,
            headers={"Location": f"/api/movies/{movie_id}"},
        )
    return JSONResponse(
        body, status_code=201, headers={"Location": f"/api/movies/{movie_id}"}
    )


@router.delete("/movies/{movie_id:int}", status_code=204)
def delete_movie(
    movie_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Only the user who imported a movie through the API may delete it (catalog films are protected)."""
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(404, "Movie not found.")
    if movie.added_by_id != user.id:
        raise HTTPException(403, "You can only delete movies you added.")
    streaming.engine.remove(movie_id, delete_files=True)
    shutil.rmtree(subtitles_dir(movie_id), ignore_errors=True)
    db.delete(movie)
    db.commit()
    catalog.forget_pools()
    return Response(status_code=204)
