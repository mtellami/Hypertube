"""TMDb (free API) — ratings, genres, posters, cast and crew."""

import re
import unicodedata

import httpx

from ..config import get_settings

API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p"
_genre_names: dict[int, str] = {}


def enabled() -> bool:
    return bool(get_settings().tmdb_api_key)


def _auth() -> tuple[dict, dict]:
    key = get_settings().tmdb_api_key
    if len(key) > 40:  # v4 "API Read Access Token"
        return {"Authorization": f"Bearer {key}"}, {}
    return {}, {"api_key": key}


async def _get(client: httpx.AsyncClient, path: str, **params) -> dict | None:
    headers, auth = _auth()
    try:
        r = await client.get(
            f"{API}{path}", params={**params, **auth}, headers=headers, timeout=12
        )
    except httpx.HTTPError:
        return None
    return r.json() if r.status_code == 200 else None


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"^(the|a|an)\s+", "", text.lower().strip())
    return re.sub(r"[^a-z0-9]", "", text)


NOISE = re.compile(
    r"\b(720p|1080p|480p|4k|hd|dvdrip|bluray|blu-ray|x264|h264|mkv|full movie|goofyrip|"
    r"remastered|restored|colorized|60fps|official|trailer)\b",
    re.I,
)


def clean_title(title: str) -> str:
    t = re.split(r"\s[-|–—:]\s|\s/\s", title)[0]
    t = re.sub(r"[\(\[\{].*?[\)\]\}]", " ", t)
    t = re.sub(r"\b(18|19|20)\d\d\b", " ", t)
    t = NOISE.sub(" ", t).replace("_", " ").replace(".", " ")
    return re.sub(r"\s+", " ", t).strip()


async def genre_names(client: httpx.AsyncClient) -> dict[int, str]:
    if not _genre_names:
        data = await _get(client, "/genre/movie/list", language="en-US")
        for g in (data or {}).get("genres", []):
            _genre_names[g["id"]] = g["name"]
    return _genre_names


async def match(client: httpx.AsyncClient, title: str, year: int | None) -> dict | None:
    query = clean_title(title)
    if len(query) < 2:
        return None
    data = await _get(client, "/search/movie", query=query, include_adult="false")
    wanted = norm(query)
    for r in (data or {}).get("results", [])[:10]:
        names = {norm(r.get("title") or ""), norm(r.get("original_title") or "")}
        ry = (
            int(r["release_date"][:4])
            if re.match(r"^\d{4}", r.get("release_date") or "")
            else None
        )
        if year and ry:
            ok = abs(year - ry) <= 1 and any(
                wanted == n or (len(wanted) > 4 and (wanted in n or n in wanted))
                for n in names
                if n
            )
        else:
            ok = wanted in names
        if ok:
            return r
    return None


def poster(path: str | None, size: str = "w500") -> str | None:
    return f"{IMG}/{size}{path}" if path else None


async def details(client: httpx.AsyncClient, tmdb_id: int) -> dict | None:
    return await _get(
        client,
        f"/movie/{tmdb_id}",
        append_to_response="credits,external_ids",
        language="en-US",
    )
