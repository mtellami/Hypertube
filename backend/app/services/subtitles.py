"""Subtitles: conversion to WebVTT, subtitles shipped inside torrents, PeerTube captions and
OpenSubtitles (optional API key)."""

import logging
import re
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger("hypertube.subtitles")

LANG_LABELS = {
    "en": "English",
    "fr": "Français",
    "es": "Español",
    "de": "Deutsch",
    "it": "Italiano",
    "pt": "Português",
    "nl": "Nederlands",
    "ru": "Русский",
    "ar": "العربية",
    "ja": "日本語",
    "zh": "中文",
    "pl": "Polski",
    "sv": "Svenska",
    "tr": "Türkçe",
    "ko": "한국어",
}
NAME_LANG = {
    "en": "en",
    "eng": "en",
    "english": "en",
    "fr": "fr",
    "fre": "fr",
    "fra": "fr",
    "french": "fr",
    "es": "es",
    "spa": "es",
    "spanish": "es",
    "de": "de",
    "ger": "de",
    "deu": "de",
    "german": "de",
    "it": "it",
    "ita": "it",
    "italian": "it",
    "pt": "pt",
    "por": "pt",
    "nl": "nl",
    "dut": "nl",
    "ru": "ru",
    "rus": "ru",
}


def subtitles_dir(movie_id: int) -> Path:
    path = Path(get_settings().data_dir) / "subtitles" / str(movie_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def label_for(lang: str) -> str:
    return LANG_LABELS.get(lang, lang.upper())


def decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


_TS = re.compile(
    r"(?<![\d:])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[,.](\d{1,3}))?(?![\d,.])"
)


def _ts(m: re.Match) -> str:
    hours, minutes, seconds = int(m[1] or 0), int(m[2]), int(m[3])
    millis = (m[4] or "0").ljust(3, "0")  # "18,83" means 18.830 s
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}.{millis}"


def to_vtt(text: str) -> str | None:
    """Convert SRT (or pass through VTT) into a clean WebVTT document."""
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if text.startswith("WEBVTT"):
        return text + "\n"
    if "-->" not in text:
        return None
    out = ["WEBVTT", ""]
    for block in re.split(r"\n{2,}", text):
        lines = [ln for ln in block.split("\n") if ln.strip() != ""]
        idx = next((i for i, ln in enumerate(lines) if "-->" in ln), None)
        if idx is None:
            continue
        start, _, end = lines[idx].partition("-->")
        end_parts = end.strip().split(None, 1)
        timing = f"{_TS.sub(_ts, start.strip())} --> {_TS.sub(_ts, end_parts[0]) if end_parts else ''}"
        out.append(timing)
        # Strip SRT font/position tags; keep <i>, <b>, <u> which WebVTT supports.
        for ln in lines[idx + 1 :]:
            ln = re.sub(r"</?font[^>]*>|\{\\[^}]*\}", "", ln)
            out.append(ln)
        out.append("")
    return "\n".join(out) if len(out) > 2 else None


def lang_from_filename(name: str, default: str) -> str:
    stem = name.lower().rsplit("/", 1)[-1]
    tokens = re.split(r"[._\-\s\[\]()]+", stem.rsplit(".", 1)[0])
    for tok in reversed(tokens):
        if tok in NAME_LANG:
            return NAME_LANG[tok]
    return default


def write_vtt(movie_id: int, source: str, lang: str, vtt: str) -> str:
    name = f"{source}_{lang}.vtt"
    (subtitles_dir(movie_id) / name).write_text(vtt, encoding="utf-8")
    return f"{movie_id}/{name}"


# --- OpenSubtitles ------------------------------------------------------------
_os_token: str | None = None
OS_API = "https://api.opensubtitles.com/api/v1"


def opensubtitles_enabled() -> bool:
    return bool(get_settings().opensubtitles_api_key)


async def _os_headers(client: httpx.AsyncClient) -> dict:
    global _os_token
    s = get_settings()
    headers = {
        "Api-Key": s.opensubtitles_api_key,
        "User-Agent": "Hypertube v1.0",
        "Accept": "application/json",
    }
    if s.opensubtitles_username and _os_token is None:
        r = await client.post(
            f"{OS_API}/login",
            headers=headers,
            json={
                "username": s.opensubtitles_username,
                "password": s.opensubtitles_password,
            },
        )
        if r.status_code == 200:
            _os_token = r.json().get("token")
    if _os_token:
        headers["Authorization"] = f"Bearer {_os_token}"
    return headers


async def opensubtitles_fetch(imdb_id: str, lang: str) -> str | None:
    """Return a WebVTT document for the given IMDb id and language, or None."""
    if not opensubtitles_enabled() or not imdb_id:
        return None
    numeric = imdb_id.lstrip("t")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            headers = await _os_headers(client)
            r = await client.get(
                f"{OS_API}/subtitles",
                headers=headers,
                params={
                    "imdb_id": numeric,
                    "languages": lang,
                    "order_by": "download_count",
                },
            )
            if r.status_code != 200:
                return None
            for item in r.json().get("data", [])[:3]:
                files = (item.get("attributes") or {}).get("files") or []
                if not files:
                    continue
                d = await client.post(
                    f"{OS_API}/download",
                    headers=headers,
                    json={"file_id": files[0]["file_id"]},
                )
                if d.status_code != 200 or not d.json().get("link"):
                    return None
                content = await client.get(d.json()["link"])
                if content.status_code == 200:
                    vtt = to_vtt(decode(content.content))
                    if vtt:
                        return vtt
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.warning("OpenSubtitles failed for %s/%s: %s", imdb_id, lang, exc)
    return None
