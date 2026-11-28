"""PeerTube — openly licensed videos published by their rights holders
(default: the Blender Foundation's official instance, CC-BY open movies)."""

import re

import httpx

from .base import SourceItem, strip_html

INSTANCE_RE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$")


def _year(video: dict) -> int | None:
    for key in ("originallyPublishedAt", "publishedAt"):
        value = video.get(key)
        if value and re.match(r"^\d{4}", value):
            return int(value[:4])
    return None


def clean_title(name: str) -> str:
    # "Sintel - Third Open Movie by Blender Foundation" -> keep the full name for display
    return name.strip()[:500]


def _to_item(host: str, v: dict) -> SourceItem:
    category = (v.get("category") or {}).get("label")
    genres = ["Animation"]
    if category and category not in ("Unknown", "Entertainment"):
        genres.append(category)
    lang = (v.get("language") or {}).get("id")
    return SourceItem(
        source="peertube",
        source_id=f"{host}/{v['uuid']}",
        title=clean_title(v["name"]),
        year=_year(v),
        summary=strip_html(v.get("truncatedDescription") or v.get("description")),
        genres=genres,
        runtime_minutes=(
            max(1, round((v.get("duration") or 0) / 60)) if v.get("duration") else None
        ),
        poster_url=(
            f"https://{host}{v['previewPath']}" if v.get("previewPath") else None
        ),
        popularity=int(v.get("views") or 0),
        language=lang if lang and len(lang) <= 3 else None,
        directors=[(v.get("account") or {}).get("displayName") or host],
        page_url=f"https://{host}/w/{v.get('shortUUID') or v['uuid']}",
    )


def instances(setting: str) -> list[str]:
    return [
        h.strip().lower()
        for h in setting.split(",")
        if INSTANCE_RE.match(h.strip().lower())
    ]


async def _search(
    client: httpx.AsyncClient, host: str, params: dict
) -> list[SourceItem]:
    r = await client.get(
        f"https://{host}/api/v1/search/videos", params=params, timeout=20
    )
    r.raise_for_status()
    return [
        _to_item(host, v)
        for v in r.json().get("data", [])
        if v.get("uuid") and not v.get("isLive")
    ]


async def popular(client: httpx.AsyncClient, host: str) -> list[SourceItem]:
    return await _search(
        client,
        host,
        {"durationMin": 180, "sort": "-views", "count": 50, "nsfw": "false"},
    )


async def search(client: httpx.AsyncClient, host: str, query: str) -> list[SourceItem]:
    return await _search(
        client,
        host,
        {"search": query[:100], "durationMin": 60, "count": 50, "nsfw": "false"},
    )


async def video_details(client: httpx.AsyncClient, source_id: str) -> dict:
    host, uuid = source_id.split("/", 1)
    r = await client.get(f"https://{host}/api/v1/videos/{uuid}", timeout=20)
    r.raise_for_status()
    return r.json()


def best_torrent_url(details: dict) -> str | None:
    """Pick a torrent of a reasonable resolution (<= 1080p, highest available)."""
    files = list(details.get("files") or [])
    for playlist in details.get("streamingPlaylists") or []:
        files += playlist.get("files") or []
    candidates = [
        f
        for f in files
        if f.get("torrentUrl") and (f.get("resolution") or {}).get("id", 0) > 0
    ]
    if not candidates:
        return None
    capped = [f for f in candidates if f["resolution"]["id"] <= 1080] or candidates
    return max(capped, key=lambda f: f["resolution"]["id"])["torrentUrl"]


async def captions(
    client: httpx.AsyncClient, source_id: str
) -> list[tuple[str, str, str]]:
    """Return [(lang_code, label, absolute_vtt_url)]."""
    host, uuid = source_id.split("/", 1)
    r = await client.get(f"https://{host}/api/v1/videos/{uuid}/captions", timeout=20)
    if r.status_code != 200:
        return []
    out = []
    for c in r.json().get("data", []):
        lang = c.get("language") or {}
        path = c.get("fileUrl") or (
            f"https://{host}{c['captionPath']}" if c.get("captionPath") else None
        )
        if lang.get("id") and path:
            out.append((lang["id"][:8], lang.get("label") or lang["id"], path))
    return out


UUID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$|^[0-9A-Za-z]{10,32}$")


async def fetch_one(
    client: httpx.AsyncClient, source_id: str, allowed_hosts: list[str]
) -> SourceItem | None:
    """One video ("host/uuid"), only from an allowed instance."""
    host, _, uuid = source_id.partition("/")
    if host.lower() not in allowed_hosts or not UUID_RE.match(uuid):
        return None
    r = await client.get(f"https://{host}/api/v1/videos/{uuid}", timeout=20)
    if r.status_code != 200:
        return None
    video = r.json()
    if video.get("isLive") or not video.get("uuid"):
        return None
    return _to_item(host.lower(), video)
