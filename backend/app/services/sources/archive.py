"""Internet Archive (archive.org) — public-domain / openly licensed feature films."""
import re

import httpx

from .base import SourceItem, as_list, strip_html

SEARCH_URL = "https://archive.org/advancedsearch.php"
# Only items that are explicitly openly licensed, or old enough to be public-domain
# candidates (US works up to 1977 without renewed copyright); recent "rips" are excluded.
BASE_QUERY = ('collection:(feature_films) AND mediatype:(movies) '
              'AND (licenseurl:(*publicdomain* OR *creativecommons*) OR year:[1880 TO 1977]) '
              'AND -subject:(nudity OR sexploitation OR "nudie cutie" OR erotic) '
              'AND -title:(rip OR brrip OR x265 OR hevc OR 1080p)')
FIELDS = ["identifier", "title", "year", "date", "description", "subject", "downloads", "runtime",
          "creator", "language"]
GENRES = {
    "action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "family", "fantasy",
    "film noir", "history", "horror", "music", "musical", "mystery", "romance", "science fiction",
    "sci-fi", "thriller", "war", "western", "silent", "short",
}


def _runtime(value) -> int | None:
    if not value:
        return None
    value = str(value).strip().lower()
    m = re.match(r"^(\d+):(\d{1,2}):(\d{1,2})$", value)
    if m:
        return int(m[1]) * 60 + int(m[2])
    m = re.match(r"^(\d+):(\d{1,2})$", value)
    if m:
        return max(1, int(m[1]))
    m = re.search(r"(\d+)\s*(?:min|m\b)", value)
    if m:
        return int(m[1])
    return None


def _year(doc: dict) -> int | None:
    for key in ("year", "date"):
        m = re.search(r"\b(18[89]\d|19\d\d|20\d\d)\b", str(doc.get(key) or ""))
        if m:
            return int(m[1])
    return None


LANG_MAP = {"english": "en", "eng": "en", "french": "fr", "fre": "fr", "fra": "fr", "spanish": "es",
            "spa": "es", "german": "de", "ger": "de", "italian": "it", "ita": "it", "russian": "ru"}


def _to_item(doc: dict) -> SourceItem:
    ident = doc["identifier"]
    title = doc.get("title") or ident
    if isinstance(title, list):
        title = title[0]
    subjects = [s.lower() for s in as_list(doc.get("subject"))]
    genres = sorted({("Science Fiction" if s in ("sci-fi", "science fiction") else s.title())
                     for s in subjects if s in GENRES})
    lang = as_list(doc.get("language"))
    directors = as_list(doc.get("creator"))[:3]
    return SourceItem(
        source="archive",
        source_id=ident,
        title=str(title).strip()[:500],
        year=_year(doc),
        summary=strip_html(doc.get("description") if isinstance(doc.get("description"), str)
                           else " ".join(as_list(doc.get("description")))),
        genres=genres,
        runtime_minutes=_runtime(doc.get("runtime")),
        poster_url=f"https://archive.org/services/img/{ident}",
        popularity=int(doc.get("downloads") or 0),
        language=LANG_MAP.get(lang[0].lower()) if lang else None,
        directors=directors,
        page_url=f"https://archive.org/details/{ident}",
    )


def _escape(query: str) -> str:
    words = [w for w in re.findall(r"\w+", query, flags=re.UNICODE) if len(w) > 1 or w.isdigit()]
    return " AND ".join(f"{w.lower()}*" for w in words[:8])


async def _query(client: httpx.AsyncClient, q: str, rows: int, sort: str) -> list[SourceItem]:
    params = [("q", q), ("rows", str(rows)), ("page", "1"), ("output", "json"), ("sort[]", sort)]
    params += [("fl[]", f) for f in FIELDS]
    r = await client.get(SEARCH_URL, params=params, timeout=20)
    r.raise_for_status()
    docs = r.json().get("response", {}).get("docs", [])
    return [_to_item(d) for d in docs if d.get("identifier")]


async def popular(client: httpx.AsyncClient, rows: int = 150) -> list[SourceItem]:
    return await _query(client, BASE_QUERY, rows, "downloads desc")


async def search(client: httpx.AsyncClient, query: str, rows: int = 120) -> list[SourceItem]:
    terms = _escape(query)
    if not terms:
        return []
    return await _query(client, f"({BASE_QUERY}) AND title:({terms})", rows, "downloads desc")


def torrent_url(identifier: str) -> str:
    return f"https://archive.org/download/{identifier}/{identifier}_archive.torrent"


async def storage_web_seeds(client: httpx.AsyncClient, identifier: str) -> list[str]:
    """The item's storage nodes as BEP 19 web seeds.

    The web seeds listed in archive.org torrents answer with per-file redirects, which
    prevents libtorrent from fetching pieces that span two files. The storage nodes
    serve every file directly."""
    try:
        r = await client.get(f"https://archive.org/metadata/{identifier}", timeout=15)
        data = r.json() if r.status_code == 200 else {}
    except (httpx.HTTPError, ValueError):
        return []
    directory = data.get("dir") or ""
    if not re.match(r"^/[\w./-]+$", directory):
        return []
    parent = directory.rsplit("/", 1)[0] + "/"
    hosts = data.get("workable_servers") or [h for h in (data.get("d1"), data.get("d2")) if h]
    return [f"https://{h}{parent}" for h in hosts if isinstance(h, str) and re.match(r"^[a-z0-9.-]+\.archive\.org$", h)][:3]
