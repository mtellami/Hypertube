"""Library catalog: queries the external sources, stores movies, enriches them with TMDb
metadata, then filters / sorts / paginates locally so that ordering is global."""
import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from ..config import get_settings
from ..db import SessionLocal
from ..models import Movie
from . import tmdb
from .sources import archive, peertube
from .sources.base import SourceItem

log = logging.getLogger("hypertube.catalog")
POPULAR_TTL = 3600
SEARCH_TTL = 900
_pools: dict[str, tuple[float, list[int]]] = {}
_locks: dict[str, asyncio.Lock] = {}
USER_AGENT = "Hypertube/1.0 (school project)"


def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers={"User-Agent": USER_AGENT}, follow_redirects=True,
                             limits=httpx.Limits(max_connections=20))


async def _fetch(query: str) -> tuple[list[SourceItem], int]:
    hosts = peertube.instances(get_settings().peertube_instances)
    async with http_client() as client:
        if query:
            tasks = [archive.search(client, query)] + [peertube.search(client, h, query) for h in hosts]
        else:
            tasks = [archive.popular(client)] + [peertube.popular(client, h) for h in hosts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    items: list[SourceItem] = []
    failures = 0
    for res in results:
        if isinstance(res, BaseException):
            failures += 1
            log.warning("Source request failed: %r", res)
        else:
            items.extend(res)
    return items, failures


def _upsert(items: list[SourceItem]) -> list[int]:
    with SessionLocal() as db:
        ids: list[int] = []
        seen: set[tuple[str, str]] = set()
        for it in items:
            key = (it.source, it.source_id)
            if key in seen:
                continue
            seen.add(key)
            movie = db.scalar(select(Movie).where(Movie.source == it.source, Movie.source_id == it.source_id))
            if movie is None:
                movie = Movie(source=it.source, source_id=it.source_id, title=it.title, year=it.year,
                              summary=it.summary, genres=it.genres, runtime_minutes=it.runtime_minutes,
                              poster_url=it.poster_url, popularity=it.popularity, language=it.language,
                              directors=it.directors, page_url=it.page_url, producers=[], cast=[])
                db.add(movie)
                db.flush()
            else:
                movie.popularity = it.popularity
            ids.append(movie.id)
        db.commit()
        return ids


def _unenriched(ids: list[int]) -> list[tuple[int, str, int | None]]:
    with SessionLocal() as db:
        rows = db.execute(select(Movie.id, Movie.title, Movie.year)
                          .where(Movie.id.in_(ids), Movie.enriched_at.is_(None))).all()
        return [(r.id, r.title, r.year) for r in rows]


def _apply_matches(matches: dict[int, dict | None], genres: dict[int, str]) -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        for movie_id, r in matches.items():
            movie = db.get(Movie, movie_id)
            if movie is None:
                continue
            movie.enriched_at = now
            if not r:
                continue
            movie.tmdb_id = r["id"]
            if r.get("vote_count"):
                movie.rating = float(r.get("vote_average") or 0) or None
            if r.get("poster_path"):
                movie.poster_url = tmdb.poster(r["poster_path"])
            if r.get("backdrop_path"):
                movie.backdrop_url = tmdb.poster(r["backdrop_path"], "w1280")
            names = [genres[g] for g in r.get("genre_ids", []) if g in genres]
            if names:
                movie.genres = names
            if r.get("overview"):
                movie.summary = r["overview"]
            if r.get("original_language"):
                movie.language = r["original_language"]
            if not movie.year and (r.get("release_date") or "")[:4].isdigit():
                movie.year = int(r["release_date"][:4])
        db.commit()


async def enrich(ids: list[int]) -> None:
    if not tmdb.enabled():
        return
    todo = await run_in_threadpool(_unenriched, ids)
    if not todo:
        return
    sem = asyncio.Semaphore(8)
    async with http_client() as client:
        genres = await tmdb.genre_names(client)

        async def one(movie_id: int, title: str, year: int | None):
            async with sem:
                return movie_id, await tmdb.match(client, title, year)

        results = await asyncio.gather(*(one(*t) for t in todo), return_exceptions=True)
    matches = {r[0]: r[1] for r in results if not isinstance(r, BaseException)}
    await run_in_threadpool(_apply_matches, matches, genres)


class SourcesUnavailable(Exception):
    pass


async def pool(query: str) -> list[int]:
    key = " ".join(query.lower().split())[:100]
    cached = _pools.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = _pools.get(key)
        if cached and cached[0] > time.monotonic():
            return cached[1]
        items, failures = await _fetch(key)
        if not items and failures:
            raise SourcesUnavailable()
        ids = await run_in_threadpool(_upsert, items)
        await enrich(ids)
        ttl = SEARCH_TTL if key else POPULAR_TTL
        if failures:
            ttl = 60  # retry soon if a source was down
        _pools[key] = (time.monotonic() + ttl, ids)
        if len(_pools) > 500:
            for k, (exp, _) in list(_pools.items()):
                if exp < time.monotonic():
                    _pools.pop(k, None)
        return ids


SORTS = {"name", "year", "rating", "popularity"}


def filter_sort(movies: list[Movie], *, searching: bool, genre: str | None, min_rating: float | None,
                year_min: int | None, year_max: int | None, sort: str | None, order: str | None) -> list[Movie]:
    out = movies
    if genre:
        g = genre.lower()
        out = [m for m in out if any(x.lower() == g for x in (m.genres or []))]
    if min_rating is not None:
        out = [m for m in out if m.rating is not None and m.rating >= min_rating]
    if year_min is not None:
        out = [m for m in out if m.year is not None and m.year >= year_min]
    if year_max is not None:
        out = [m for m in out if m.year is not None and m.year <= year_max]

    # Subject: search results sorted by name; front page sorted by popularity (downloads/views).
    sort = sort if sort in SORTS else ("name" if searching else "popularity")
    desc = (order == "desc") if order in ("asc", "desc") else sort in ("rating", "popularity", "year")
    if sort == "name":
        keyf = lambda m: (tmdb.norm(m.title) or m.title.lower())  # noqa: E731
        out = sorted(out, key=keyf, reverse=desc)
    else:
        attr = {"year": "year", "rating": "rating", "popularity": "popularity"}[sort]
        present = [m for m in out if getattr(m, attr) is not None]
        missing = [m for m in out if getattr(m, attr) is None]
        out = sorted(present, key=lambda m: getattr(m, attr), reverse=desc) + missing
    return out
