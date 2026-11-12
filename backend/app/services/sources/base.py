import re
from dataclasses import dataclass, field


@dataclass
class SourceItem:
    source: str
    source_id: str
    title: str
    year: int | None = None
    summary: str | None = None
    genres: list[str] = field(default_factory=list)
    runtime_minutes: int | None = None
    poster_url: str | None = None
    popularity: int = 0
    language: str | None = None
    directors: list[str] = field(default_factory=list)
    page_url: str | None = None


_TAG_RE = re.compile(r"<[^>]+>")


def strip_html(text: str | None, limit: int = 4000) -> str | None:
    """Source descriptions may contain HTML: keep plain text only (rendered escaped by the UI)."""
    if not text:
        return None
    text = _TAG_RE.sub(" ", text)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
            .replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">"))
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text).strip()
    return text[:limit] or None


def as_list(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = re.split(r"[;,]", value)
    return [str(v).strip() for v in value if str(v).strip()]
