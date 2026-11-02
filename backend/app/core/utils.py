import math
import re
import unicodedata
from urllib.parse import urlparse

import nh3

ALLOWED_HTML_TAGS: set[str] = {
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "strike",
    "del",
    "blockquote",
    "pre",
    "code",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "span",
    "div",
    "sub",
    "sup",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "hr",
    "figure",
    "figcaption",
}

ALLOWED_HTML_ATTRIBUTES: dict[str, set[str]] = {
    "*": {"class", "id", "title", "dir", "lang", "data-align"},
    "a": {"href", "target"},
    "img": {"src", "alt", "width", "height", "loading", "referrerpolicy", "style"},
    "pre": {"class", "spellcheck"},
    "code": {"class"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
}

SAFE_RASTER_DATA_IMAGE_RE = re.compile(
    r"^data:image/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$",
    re.IGNORECASE,
)

SAFE_IFRAME_PATTERN = re.compile(
    r"<\s*iframe\b[^>]*\bsrc=[\"'](https:\/\/(?:www\.)?(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)[A-Za-z0-9_-]+(?:\?[A-Za-z0-9_=&%-]*)?)[\"'][^>]*>(?:.*?<\/\s*iframe\s*>|\s*)",
    re.IGNORECASE | re.DOTALL,
)

UNSAFE_DATA_HREF_RE = re.compile(
    r'\bhref\s*=\s*["\']\s*data:[^"\']*["\']',
    re.IGNORECASE,
)

IMG_DATA_SRC_RE = re.compile(
    r'(\bsrc\s*=\s*["\'])(data:[^"\']+)(["\'])',
    re.IGNORECASE,
)


def generate_slug(text: str) -> str:
    """Generate a clean, URL-safe slug from a string."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-")


def _is_valid_video_embed_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https":
            return False
        if parsed.hostname not in (
            "www.youtube.com",
            "youtube.com",
            "www.youtube-nocookie.com",
            "youtube-nocookie.com",
            "player.vimeo.com",
        ):
            return False
        if not re.match(r"^/(?:embed|video)/[A-Za-z0-9_-]+$", parsed.path or ""):
            return False
        if any(c in url for c in ('"', "'", "<", ">", "\r", "\n", "\0")):
            return False
        return True
    except Exception:
        return False


def sanitize_html_content(raw_html: str) -> str:
    """
    Sanitize rich-text HTML using nh3 to prevent stored XSS.
    Strips unsafe tags and handler attributes while preserving verified video embeds and images.
    """
    if not raw_html:
        return ""

    safe_iframes: list[str] = []

    def save_safe_iframe(match: re.Match[str]) -> str:
        src_url = match.group(1)
        if not _is_valid_video_embed_url(src_url):
            return ""
        safe_tag = (
            f'<iframe class="ql-video" src="{src_url}" '
            f'frameborder="0" allowfullscreen="true"></iframe>'
        )
        placeholder = f"__SAFE_VIDEO_IFRAME_{len(safe_iframes)}__"
        safe_iframes.append(safe_tag)
        return placeholder

    content_with_placeholders = SAFE_IFRAME_PATTERN.sub(save_safe_iframe, raw_html)

    cleaned = nh3.clean(
        content_with_placeholders,
        tags=ALLOWED_HTML_TAGS,
        attributes=ALLOWED_HTML_ATTRIBUTES,
        url_schemes={"http", "https", "mailto", "tel", "data"},
        link_rel="noopener noreferrer",
        strip_comments=True,
    )

    cleaned = UNSAFE_DATA_HREF_RE.sub('href="#"', cleaned)

    def filter_data_src(match: re.Match[str]) -> str:
        prefix, data_uri, suffix = match.group(1), match.group(2), match.group(3)
        if SAFE_RASTER_DATA_IMAGE_RE.match(data_uri.strip()):
            return f"{prefix}{data_uri.strip()}{suffix}"
        return f"{prefix}{suffix}"

    cleaned = IMG_DATA_SRC_RE.sub(filter_data_src, cleaned)

    for idx, safe_tag in enumerate(safe_iframes):
        cleaned = cleaned.replace(f"__SAFE_VIDEO_IFRAME_{idx}__", safe_tag)

    return cleaned.strip()


def validate_safe_url(
    url: str | None,
    *,
    allow_data_image: bool = False,
    field_name: str = "URL",
) -> str | None:
    if url is None:
        return None
    trimmed = url.strip()
    if not trimmed:
        return None

    if any(ch in trimmed for ch in ("\r", "\n", "\0", "\t")):
        raise ValueError(f"{field_name} contains invalid control characters.")

    if allow_data_image and trimmed.lower().startswith("data:"):
        if SAFE_RASTER_DATA_IMAGE_RE.match(trimmed):
            return trimmed
        raise ValueError(
            f"{field_name} only permits base64-encoded PNG, JPEG, WebP, or GIF data URLs."
        )

    if trimmed.startswith("/") and not trimmed.startswith("//"):
        return trimmed

    parsed = urlparse(trimmed)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"{field_name} must be a valid http:// or https:// URL.")

    return trimmed


def escape_like_pattern(query: str) -> str:
    if not query:
        return ""
    return query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def calculate_reading_time(content: str, wpm: int = 200) -> int:
    if not content:
        return 1
    text_only = re.sub(r"<[^>]+>", " ", content)
    words = re.findall(r"\b\w+\b", text_only)
    word_count = len(words)
    if word_count == 0:
        return 1
    return max(1, math.ceil(word_count / wpm))
