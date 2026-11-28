"""Orchestrates downloads, cached files, subtitles and the monthly cleanup."""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..config import get_settings
from ..db import SessionLocal
from ..models import Movie, Subtitle
from . import subtitles as subs
from . import transcode
from .catalog import http_client
from .sources import archive, peertube
from .torrent.engine import NATIVE_EXT, Job, TorrentEngine, ext_of

log = logging.getLogger("hypertube.streaming")
INTERNAL_KEY = secrets.token_urlsafe(32)  # authorizes ffmpeg's loopback reads

engine: TorrentEngine | None = None
_starting: dict[int, asyncio.Task] = {}
_errors: dict[int, str] = {}
_sub_attempts: set[tuple[int, str]] = set()
_probes: dict[int, dict] = {}
_bg: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    async def guarded():
        try:
            await coro
        except Exception:
            log.exception("Background task failed")

    task = asyncio.create_task(guarded())
    _bg.add(task)
    task.add_done_callback(_bg.discard)


def downloads_dir() -> Path:
    return Path(get_settings().data_dir) / "downloads"


def init_engine() -> TorrentEngine:
    global engine
    engine = TorrentEngine(downloads_dir(), get_settings().torrent_listen_port)
    engine.on_finished = _on_finished
    engine.on_failed = _on_failed
    engine.start()
    _spawn(_resume_interrupted())
    return engine


def _interrupted_ids() -> list[int]:
    with SessionLocal() as db:
        return list(
            db.scalars(select(Movie.id).where(Movie.download_state == "downloading"))
        )


async def _resume_interrupted() -> None:
    """Downloads cut by a server restart are resumed so they complete and get cached."""
    for movie_id in await run_in_threadpool(_interrupted_ids):
        if movie_id not in engine.jobs and movie_id not in _starting:
            _starting[movie_id] = asyncio.create_task(_start(movie_id))


# --- DB helpers (run in threadpool) ----------------------------------------
def _get_movie(movie_id: int) -> Movie | None:
    with SessionLocal() as db:
        return db.get(Movie, movie_id)


def _update_movie(movie_id: int, **values) -> None:
    with SessionLocal() as db:
        movie = db.get(Movie, movie_id)
        if movie:
            for k, v in values.items():
                setattr(movie, k, v)
            db.commit()


def _add_subtitle(movie_id: int, lang: str, source: str, rel_path: str) -> None:
    with SessionLocal() as db:
        exists = db.scalar(
            select(Subtitle.id).where(
                Subtitle.movie_id == movie_id,
                Subtitle.lang == lang,
                Subtitle.source == source,
            )
        )
        if exists:
            return
        db.add(
            Subtitle(
                movie_id=movie_id,
                lang=lang,
                label=subs.label_for(lang),
                source=source,
                path=rel_path,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()


def _subtitle_langs(movie_id: int) -> set[str]:
    with SessionLocal() as db:
        return set(
            db.scalars(select(Subtitle.lang).where(Subtitle.movie_id == movie_id))
        )


# --- Local file state ------------------------------------------------------
def completed_path(movie: Movie) -> Path | None:
    if movie.download_state == "complete" and movie.file_path:
        path = downloads_dir() / movie.file_path
        if path.is_file():
            return path
    return None


# --- Starting a download ---------------------------------------------------
async def _fetch_torrent(movie: Movie) -> tuple[bytes, list[str]]:
    seeds: list[str] = []
    async with http_client() as client:
        if movie.source == "archive":
            url = archive.torrent_url(movie.source_id)
            seeds = await archive.storage_web_seeds(client, movie.source_id)
        else:
            details = await peertube.video_details(client, movie.source_id)
            url = peertube.best_torrent_url(details)
            if not url:
                raise ValueError("No torrent is published for this video.")
        r = await client.get(url, timeout=30)
        r.raise_for_status()
        if len(r.content) > 20 * 1024 * 1024 or not r.content.startswith(b"d"):
            raise ValueError("Invalid torrent file received from the source.")
        return r.content, seeds


async def _start(movie_id: int) -> None:
    try:
        movie = await run_in_threadpool(_get_movie, movie_id)
        data, seeds = await _fetch_torrent(movie)
        job = engine.add(movie_id, data, seeds)
        rel = f"{movie_id}/{job.rel_path}"
        await run_in_threadpool(
            _update_movie,
            movie_id,
            download_state="downloading",
            file_path=rel,
            file_size=job.file_size,
        )
        _errors.pop(movie_id, None)
        _spawn(_watch_torrent_subtitles(job, movie.language or "en"))
    except Exception as exc:  # report to the UI, allow retry
        log.warning("Could not start movie %s: %s", movie_id, exc)
        _errors[movie_id] = (
            str(exc)
            if isinstance(exc, ValueError)
            else "The torrent could not be started."
        )
    finally:
        _starting.pop(movie_id, None)


async def ensure_started(movie: Movie, user_language: str) -> None:
    """Non-blocking: kicks off the torrent (if needed) and subtitle lookups in the background."""
    _spawn(fetch_external_subtitles(movie.id, user_language))
    if completed_path(movie) or movie.id in engine.jobs or movie.id in _starting:
        return
    _errors.pop(movie.id, None)
    _starting[movie.id] = asyncio.create_task(_start(movie.id))


async def _on_finished(job: Job) -> None:
    await _process_torrent_subtitles(job, None)
    await run_in_threadpool(
        _update_movie,
        job.movie_id,
        download_state="complete",
        downloaded_at=datetime.now(timezone.utc),
    )
    log.info("Movie %s fully downloaded and cached", job.movie_id)
    # Keep the job object alive for in-flight readers (job.finished means no waiting).
    engine.remove(job.movie_id)


async def _on_failed(movie_id: int, message: str) -> None:
    _errors[movie_id] = "Download error: " + message[:200]


# --- Subtitles --------------------------------------------------------------
async def _process_torrent_subtitles(job: Job, done: set[int] | None) -> set[int]:
    done = done if done is not None else set()
    if not job.subtitle_files:
        return done
    try:
        progress = job.handle.file_progress()
    except RuntimeError:
        progress = None
    fs_sizes = None
    movie = await run_in_threadpool(_get_movie, job.movie_id)
    default_lang = (movie.language if movie else None) or "en"
    for index, path in job.subtitle_files:
        if index in done:
            continue
        abs_path = job.save_path / path
        if progress is not None:
            if fs_sizes is None:
                fs = job.handle.torrent_file().layout()
                fs_sizes = {i: fs.file_size(i) for i, _ in job.subtitle_files}
            if progress[index] < fs_sizes[index]:
                continue
        if not abs_path.is_file():
            continue
        done.add(index)
        vtt = subs.to_vtt(subs.decode(abs_path.read_bytes()))
        if not vtt:
            continue
        lang = subs.lang_from_filename(path, default_lang)
        rel = await run_in_threadpool(
            subs.write_vtt, job.movie_id, "torrent", lang, vtt
        )
        await run_in_threadpool(_add_subtitle, job.movie_id, lang, "torrent", rel)
    return done


async def _watch_torrent_subtitles(job: Job, default_lang: str) -> None:
    done: set[int] = set()
    for _ in range(300):
        if job.error or len(done) >= len(job.subtitle_files):
            return
        await _process_torrent_subtitles(job, done)
        await asyncio.sleep(2)


async def fetch_external_subtitles(movie_id: int, user_language: str) -> None:
    """English subtitles, plus the user's language when it differs from the movie's."""
    movie = await run_in_threadpool(_get_movie, movie_id)
    if movie is None:
        return
    wanted = {"en"}
    if user_language and user_language != (movie.language or "en"):
        wanted.add(user_language)
    have = await run_in_threadpool(_subtitle_langs, movie_id)
    todo = [
        lang
        for lang in wanted
        if lang not in have and (movie_id, lang) not in _sub_attempts
    ]
    if not todo:
        return
    for lang in todo:
        _sub_attempts.add((movie_id, lang))

    if movie.source == "peertube":
        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                for code, _label, url in await peertube.captions(
                    client, movie.source_id
                ):
                    lang = code.split("-")[0].lower()
                    if lang not in todo:
                        continue
                    r = await client.get(url)
                    vtt = (
                        subs.to_vtt(subs.decode(r.content))
                        if r.status_code == 200
                        else None
                    )
                    if vtt:
                        rel = await run_in_threadpool(
                            subs.write_vtt, movie_id, "peertube", lang, vtt
                        )
                        await run_in_threadpool(
                            _add_subtitle, movie_id, lang, "peertube", rel
                        )
                        todo.remove(lang)
        except httpx.HTTPError as exc:
            log.warning("PeerTube captions failed: %s", exc)

    if movie.imdb_id:
        for lang in todo:
            vtt = await subs.opensubtitles_fetch(movie.imdb_id, lang)
            if vtt:
                rel = await run_in_threadpool(
                    subs.write_vtt, movie_id, "opensubtitles", lang, vtt
                )
                await run_in_threadpool(
                    _add_subtitle, movie_id, lang, "opensubtitles", rel
                )


# --- Status -------------------------------------------------------------------
def source_for_ffmpeg(movie: Movie) -> str:
    path = completed_path(movie)
    if path:
        return str(path)
    return (
        f"{get_settings().internal_url}/api/internal/raw/{movie.id}?key={INTERNAL_KEY}"
    )


async def status(movie: Movie) -> dict:
    settings = get_settings()
    path = completed_path(movie)
    job = engine.jobs.get(movie.id)
    ext = ext_of(movie.file_path or (job.rel_path if job else ""))
    mode = "native" if ext in NATIVE_EXT else "transcode"
    result = {
        "state": "idle",
        "progress": 0.0,
        "buffer": 0.0,
        "download_rate": 0,
        "peers": 0,
        "ready": False,
        "mode": mode if ext else None,
        "container": ext or None,
        "duration": None,
        "error": None,
        "height": None,
        "qualities": [],
        "mse_type": None,
        "mse_type_converted": None,
    }
    if path:
        result.update(state="complete", progress=100.0, buffer=100.0, ready=True)
    elif job:
        result.update(engine.status(movie.id) or {})
        result["ready"] = engine.ready(job, settings.stream_ready_bytes)
        if not result["ready"]:
            engine.ensure_startup_pieces(job, settings.stream_ready_bytes)
        result["buffer"] = engine.buffer_percent(job, settings.stream_ready_bytes)
    elif movie.id in _starting:
        result["state"] = "preparing"
    elif movie.id in _errors:
        result.update(state="error", error=_errors[movie.id])

    if result["ready"]:
        # Probe once (cached): duration for converted streams, resolutions for the quality
        # menu, and the codec string the player needs for MediaSource.
        info = _probes.get(movie.id)
        if info is None:
            info = await transcode.probe(source_for_ffmpeg(movie))
            if info.get("video_codec"):
                _probes[movie.id] = info
        if info.get("video_codec"):
            result["duration"] = info.get("duration") or None
            result["height"] = info.get("height")
            result["qualities"] = transcode.available_qualities(info)
            result["mse_type"] = transcode.mse_codecs(info, None)
            result["mse_type_converted"] = transcode.mse_codecs(info, 720)
    return result


# --- Cleanup ------------------------------------------------------------------
def _expired_movies(cutoff: datetime) -> list[int]:
    with SessionLocal() as db:
        return list(
            db.scalars(
                select(Movie.id).where(
                    Movie.download_state != "none", Movie.last_watched_at < cutoff
                )
            )
        )


async def cleanup_once() -> int:
    """Erase movies that have not been watched for a month."""
    cutoff = datetime.now(timezone.utc) - timedelta(
        days=get_settings().unwatched_retention_days
    )
    ids = await run_in_threadpool(_expired_movies, cutoff)
    for movie_id in ids:
        engine.remove(movie_id, delete_files=True)
        _probes.pop(movie_id, None)
        await run_in_threadpool(
            _update_movie,
            movie_id,
            download_state="none",
            file_path=None,
            file_size=None,
            downloaded_at=None,
        )
        log.info(
            "Movie %s erased (unwatched for %s days)",
            movie_id,
            get_settings().unwatched_retention_days,
        )
    return len(ids)


async def cleanup_loop() -> None:
    while True:
        try:
            await cleanup_once()
        except Exception:
            log.exception("Cleanup failed")
        await asyncio.sleep(3600)
