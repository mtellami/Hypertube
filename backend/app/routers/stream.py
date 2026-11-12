"""Video streaming endpoints (web player)."""
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Movie, Subtitle, User, WatchedMovie
from ..security import current_user
from ..services import streaming, transcode
from ..services.subtitles import subtitles_dir
from ..services.torrent.engine import NATIVE_EXT, ext_of, read_range

router = APIRouter(prefix="/api", tags=["streaming"])
MIME = {"mp4": "video/mp4", "m4v": "video/mp4", "webm": "video/webm"}
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _movie(db: Session, movie_id: int) -> Movie:
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(404, "Movie not found.")
    return movie


@router.post("/movies/{movie_id:int}/stream")
async def start_stream(movie_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Start (or resume) the server-side download and mark the movie as watched."""
    movie = _movie(db, movie_id)
    now = datetime.now(timezone.utc)
    movie.last_watched_at = now
    watched = db.scalar(select(WatchedMovie).where(WatchedMovie.user_id == user.id,
                                                    WatchedMovie.movie_id == movie_id))
    if watched:
        watched.watched_at = now
    else:
        db.add(WatchedMovie(user_id=user.id, movie_id=movie_id, watched_at=now))
    db.commit()
    await streaming.ensure_started(movie, user.language)
    return await streaming.status(movie)


@router.get("/movies/{movie_id:int}/stream")
async def stream_status(movie_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return await streaming.status(_movie(db, movie_id))


def _parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    if not header:
        return None
    m = RANGE_RE.match(header.strip())
    if not m or (not m[1] and not m[2]):
        raise HTTPException(416, headers={"Content-Range": f"bytes */{size}"})
    if m[1]:
        start, end = int(m[1]), int(m[2]) if m[2] else size - 1
    else:  # suffix range: last N bytes
        start, end = max(0, size - int(m[2])), size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        raise HTTPException(416, headers={"Content-Range": f"bytes */{size}"})
    return start, end


def _ranged(request: Request, movie: Movie, content_type: str) -> Response:
    """HTTP range responses over a file that may still be downloading."""
    path = streaming.completed_path(movie)
    job = None
    if path is None:
        job = streaming.engine.jobs.get(movie.id)
        if job is None:
            raise HTTPException(409, "The download has not been started.")
        path, size = job.abs_path, job.file_size
    else:
        size = path.stat().st_size
    rng = _parse_range(request.headers.get("range"), size)
    start, end = rng if rng else (0, size - 1)
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Cache-Control": "no-store",
    }
    if rng:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(read_range(Path(path), start, end, job), status_code=206 if rng else 200,
                             media_type=content_type, headers=headers)


@router.get("/movies/{movie_id:int}/stream/video")
async def stream_video(movie_id: int, request: Request, start: float = Query(0, ge=0, le=86400),
                       db: Session = Depends(get_db), _: User = Depends(current_user)):
    movie = _movie(db, movie_id)
    job = streaming.engine.jobs.get(movie_id)
    ext = ext_of(movie.file_path or (job.rel_path if job else ""))
    if not ext:
        raise HTTPException(409, "The download has not been started.")
    if ext in NATIVE_EXT:
        return _ranged(request, movie, MIME[ext])
    # Not natively playable: convert on the fly to fragmented MP4.
    source = streaming.source_for_ffmpeg(movie)
    info = await transcode.probe(source)
    if not info.get("video_codec"):
        raise HTTPException(503, "The video is not ready yet.")
    return StreamingResponse(transcode.stream(source, start, info), media_type="video/mp4",
                             headers={"Cache-Control": "no-store"})


@router.get("/internal/raw/{movie_id:int}", include_in_schema=False)
async def internal_raw(movie_id: int, request: Request, key: str = "", db: Session = Depends(get_db)):
    """Loopback-only source for ffmpeg while the torrent is still downloading."""
    client = request.client.host if request.client else ""
    if key != streaming.INTERNAL_KEY or client not in ("127.0.0.1", "::1"):
        raise HTTPException(404)
    return _ranged(request, _movie(db, movie_id), "application/octet-stream")


@router.get("/movies/{movie_id:int}/subtitles/{subtitle_id:int}")
def subtitle_file(movie_id: int, subtitle_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    sub = db.get(Subtitle, subtitle_id)
    if sub is None or sub.movie_id != movie_id:
        raise HTTPException(404, "Subtitle not found.")
    base = subtitles_dir(movie_id).parent.resolve()
    path = (base / sub.path).resolve()
    if base not in path.parents or not path.is_file():
        raise HTTPException(404, "Subtitle not found.")
    return FileResponse(path, media_type="text/vtt; charset=utf-8", headers={"Cache-Control": "private, max-age=3600"})
