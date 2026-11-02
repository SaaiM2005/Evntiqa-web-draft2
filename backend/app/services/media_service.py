import asyncio
import base64
import binascii
import hashlib
import html
import io
import ipaddress
import os
import re
import socket
import uuid
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status
from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError

from app.core.config import get_settings

HTTP_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", status.HTTP_422_UNPROCESSABLE_ENTITY)

settings = get_settings()
IMAGES_DIR = os.path.join(settings.upload_dir, "images")

ALLOWED_PIL_FORMATS = {"JPEG", "PNG", "WEBP", "GIF", "BMP", "TIFF", "ICO", "AVIF"}

MAX_IMAGE_PIXELS = 40_000_000
MAX_ANIMATION_FRAMES = 300
MAX_ANIMATION_TOTAL_PIXELS = 60_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB

MAX_REDIRECTS = 5
FETCH_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
FETCH_TOTAL_SECONDS = 30.0

MAX_BODY_IMAGES_PER_SAVE = 60
BODY_IMAGE_CONCURRENCY = 4

LOCAL_IMAGE_PATH_RE = re.compile(r"^/uploads/images/[A-Za-z0-9_-]+\.webp$")
IMG_SRC_RE = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]*)(")', re.IGNORECASE)
DATA_IMAGE_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}
IMAGE_ACCEPT = "image/webp,image/avif,image/png,image/jpeg,image/*;q=0.9,*/*;q=0.5"

BLOCKED_HOSTNAMES = {"localhost", "metadata.google.internal", "metadata"}


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=HTTP_422, detail=detail)


def _ensure_scheme(url: str) -> str:
    if url.startswith("//"):
        return f"https:{url}"
    if not re.match(r"^https?://", url, re.IGNORECASE):
        return f"https://{url}"
    return url


def normalize_external_image_url(raw_url: str) -> str:
    if not raw_url:
        return ""
    url = raw_url.strip()

    drive_match = re.search(
        r"drive\.google\.com/(?:file/d/|open\?id=|uc\?(?:export=view&)?id=)([a-zA-Z0-9_-]+)",
        url,
    )
    if drive_match:
        file_id = drive_match.group(1)
        return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1600"

    if "dropbox.com/s/" in url:
        cleaned = re.sub(r"[?&]dl=0", "", url)
        cleaned = re.sub(r"[?&]raw=1", "", cleaned)
        return cleaned + ("&raw=1" if "?" in cleaned else "?raw=1")

    return _ensure_scheme(url)


def to_local_upload_path(url: str) -> str | None:
    if not url:
        return None
    candidate = url.strip()

    if candidate.startswith("/uploads/") and ".." not in candidate:
        return candidate
    return None


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def is_ssrf_safe_url(url: str, allow_local_for_testing: bool = False) -> bool:
    if allow_local_for_testing:
        return True

    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https"):
        return False
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if not hostname or hostname in BLOCKED_HOSTNAMES or hostname.endswith(".localhost"):
        return False

    try:
        addr_info = socket.getaddrinfo(hostname, parsed.port or None)
    except (socket.gaierror, UnicodeError, ValueError):
        return False
    if not addr_info:
        return False

    for *_, sockaddr in addr_info:
        try:
            ip_obj = ipaddress.ip_address(str(sockaddr[0]).split("%", 1)[0])
        except ValueError:
            return False
        if not _is_public_ip(ip_obj):
            return False
    return True


async def _fetch_external(
    url: str,
    *,
    max_bytes: int,
    accept: str,
    allow_local: bool = False,
) -> tuple[bytes, str]:
    current = url
    headers = {**BROWSER_HEADERS, "Accept": accept}
    size_mb = max_bytes // (1024 * 1024)

    try:
        async with asyncio.timeout(FETCH_TOTAL_SECONDS):
            async with httpx.AsyncClient(
                timeout=FETCH_TIMEOUT, follow_redirects=False, headers=headers
            ) as client:
                for _ in range(MAX_REDIRECTS + 1):
                    safe = await asyncio.to_thread(
                        is_ssrf_safe_url, current, allow_local_for_testing=allow_local
                    )
                    if not safe:
                        raise _unprocessable(
                            "The provided URL points to a restricted, private, "
                            "or unresolvable network address."
                        )

                    async with client.stream("GET", current) as resp:
                        if resp.is_redirect:
                            location = resp.headers.get("location")
                            if not location:
                                raise _unprocessable("The URL redirected without a target.")
                            current = str(resp.url.join(location))
                            continue

                        if resp.status_code != 200:
                            raise _unprocessable(
                                f"The URL returned HTTP {resp.status_code}. "
                                "Please verify it is publicly accessible."
                            )

                        declared = resp.headers.get("content-length")
                        if declared and declared.isdigit() and int(declared) > max_bytes:
                            raise _unprocessable(
                                f"The file exceeds the maximum allowed size of {size_mb}MB."
                            )

                        buf = bytearray()
                        async for chunk in resp.aiter_bytes():
                            buf.extend(chunk)
                            if len(buf) > max_bytes:
                                raise _unprocessable(
                                    f"The file exceeds the maximum allowed size of {size_mb}MB."
                                )
                        return bytes(buf), resp.headers.get("content-type", "").lower()

                raise _unprocessable("The URL redirected too many times.")
    except TimeoutError:
        raise _unprocessable("Timed out while downloading from the provided URL.") from None
    except httpx.TimeoutException:
        raise _unprocessable("Connection timed out while fetching the provided URL.") from None
    except httpx.RequestError as exc:
        raise _unprocessable(f"Failed to connect to the host: {exc.__class__.__name__}.") from None


async def validate_and_download_image(
    url: str,
    allow_local: bool = False,
) -> tuple[bytes, str]:
    norm_url = normalize_external_image_url(url)
    image_bytes, content_type = await _fetch_external(
        norm_url,
        max_bytes=MAX_IMAGE_SIZE_BYTES,
        accept=IMAGE_ACCEPT,
        allow_local=allow_local,
    )

    if "text/html" in content_type:
        raise _unprocessable(
            "The provided URL rendered a web page (HTML) rather than a direct image file."
        )
    if not image_bytes:
        raise _unprocessable("The provided URL returned an empty response.")

    return image_bytes, content_type


def _webp_from_animation(img: Image.Image, max_width: int, quality: int) -> tuple[bytes, int, int]:
    n_frames = getattr(img, "n_frames", 1)
    if n_frames > MAX_ANIMATION_FRAMES:
        raise _unprocessable(
            f"Animated image has too many frames ({n_frames}; max {MAX_ANIMATION_FRAMES})."
        )

    width, height = img.size
    if width > max_width:
        height = max(1, int(height * (max_width / width)))
        width = max_width
    if n_frames * width * height > MAX_ANIMATION_TOTAL_PIXELS:
        raise _unprocessable("Animated image is too large.")

    frames: list[Image.Image] = []
    durations: list[int] = []
    for frame in ImageSequence.Iterator(img):
        converted = frame.convert("RGBA")
        if converted.size != (width, height):
            converted = converted.resize((width, height), Image.Resampling.LANCZOS)
        frames.append(converted)
        durations.append(int(frame.info.get("duration", img.info.get("duration", 100)) or 100))

    out = io.BytesIO()
    frames[0].save(
        out,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=img.info.get("loop", 0),
        quality=quality,
        method=4,
    )
    return out.getvalue(), width, height


def process_image_to_webp(
    image_bytes: bytes,
    max_width: int = 1920,
    quality: int = 85,
) -> tuple[bytes, int, int]:
    try:
        img: Image.Image = Image.open(io.BytesIO(image_bytes))
    except Image.DecompressionBombError:
        raise _unprocessable("Image dimensions are too large to process.") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise _unprocessable(
            "The image file could not be recognized or decoded. "
            "Supported formats: .png, .jpeg, .webp, .gif."
        ) from None

    if not img.format or img.format.upper() not in ALLOWED_PIL_FORMATS:
        raise _unprocessable(
            f"Unsupported image format: '{img.format}'. "
            "Supported formats: .png, .jpeg, .webp, .gif, .bmp."
        )

    width, height = img.size
    if width <= 0 or height <= 0:
        raise _unprocessable("Image dimensions are invalid (0x0).")
    if width * height > MAX_IMAGE_PIXELS:
        raise _unprocessable("Image dimensions are too large to process.")

    try:
        if getattr(img, "is_animated", False):
            return _webp_from_animation(img, max_width, quality)

        img = ImageOps.exif_transpose(img)

        if img.mode in ("RGBA", "LA"):
            pass
        elif img.mode == "P":
            img = img.convert("RGBA" if "transparency" in img.info else "RGB")
        elif img.mode != "RGB":
            img = img.convert("RGB")

        width, height = img.size
        if width > max_width:
            new_height = max(1, int(height * (max_width / width)))
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            width, height = img.size

        out_buffer = io.BytesIO()
        img.save(out_buffer, format="WEBP", quality=quality, method=6)
    except HTTPException:
        raise
    except Image.DecompressionBombError:
        raise _unprocessable("Image dimensions are too large to process.") from None
    except (OSError, ValueError, SyntaxError):
        raise _unprocessable("The image file is corrupt or truncated.") from None

    return out_buffer.getvalue(), width, height


def save_webp_image(webp_bytes: bytes) -> str:
    os.makedirs(IMAGES_DIR, exist_ok=True)
    file_hash = hashlib.sha256(webp_bytes).hexdigest()[:24]
    filename = f"{file_hash}.webp"
    filepath = os.path.join(IMAGES_DIR, filename)

    if not os.path.exists(filepath):
        tmp_path = f"{filepath}.{uuid.uuid4().hex[:8]}.tmp"
        with open(tmp_path, "wb") as f:
            f.write(webp_bytes)
        os.replace(tmp_path, filepath)

    return f"/uploads/images/{filename}"


def _decode_data_image(url: str) -> bytes:
    match = DATA_IMAGE_RE.match(url)
    if not match:
        raise _unprocessable("Malformed base64 data image URL.")
    payload = match.group(2)
    if len(payload) > MAX_IMAGE_SIZE_BYTES * 4 // 3 + 4:
        raise _unprocessable(
            f"Image exceeds the maximum allowed size of {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB."
        )
    try:
        return base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError):
        raise _unprocessable("Failed to decode base64 image data.") from None


async def _convert_and_store(image_bytes: bytes) -> tuple[str, int, int, int]:
    webp_bytes, width, height = await asyncio.to_thread(process_image_to_webp, image_bytes)
    local_url = await asyncio.to_thread(save_webp_image, webp_bytes)
    return local_url, width, height, len(webp_bytes)


async def ingest_image_url(url: str, allow_local: bool = False) -> dict[str, Any]:
    if not url or not url.strip():
        raise _unprocessable("Image URL cannot be empty.")
    url = url.strip()

    local = to_local_upload_path(url)
    if local is not None:
        if not LOCAL_IMAGE_PATH_RE.match(local):
            raise _unprocessable("Local image path must point to /uploads/images/<file>.webp.")
        return {"url": local, "original_url": url, "format": "webp", "is_local": True}

    if url.startswith("data:"):
        image_bytes = _decode_data_image(url)
    else:
        image_bytes, _ = await validate_and_download_image(url, allow_local=allow_local)

    local_url, width, height, size = await _convert_and_store(image_bytes)
    return {
        "url": local_url,
        "original_url": url if not url.startswith("data:") else "data:(inline image)",
        "format": "webp",
        "width": width,
        "height": height,
        "size_bytes": size,
    }


async def ingest_image_file(file_bytes: bytes, filename: str = "upload.png") -> dict[str, Any]:
    if not file_bytes:
        raise _unprocessable("Uploaded file is empty.")
    if len(file_bytes) > MAX_IMAGE_SIZE_BYTES:
        max_mb = MAX_IMAGE_SIZE_BYTES // (1024 * 1024)
        raise _unprocessable(f"Image file exceeds maximum allowable size of {max_mb}MB.")

    local_url, width, height, size = await _convert_and_store(file_bytes)
    return {
        "url": local_url,
        "original_filename": filename,
        "format": "webp",
        "width": width,
        "height": height,
        "size_bytes": size,
    }


async def ensure_local_image(url: str | None, label: str = "Image") -> str | None:
    if url is None or not url.strip():
        return None
    try:
        result = await ingest_image_url(url)
    except HTTPException as exc:
        raise _unprocessable(f"{label}: {exc.detail}") from None
    return str(result["url"])


def _describe_src(src: str) -> str:
    if src.startswith("data:"):
        return "an inline (pasted) image"
    return src if len(src) <= 120 else src[:117] + "..."


async def localize_html_images(content: str | None) -> str | None:
    if not content or "<img" not in content.lower():
        return content

    raw_srcs = list(dict.fromkeys(m.group(2) for m in IMG_SRC_RE.finditer(content)))
    pending: list[tuple[str, str]] = []
    replacements: dict[str, str] = {}

    for raw in raw_srcs:
        src = html.unescape(raw).strip()
        if not src:
            continue
        local = to_local_upload_path(src)
        if local is not None:
            if local != src:
                replacements[raw] = local
            continue
        if src.startswith(("data:", "http://", "https://", "//")):
            pending.append((raw, src))

    if len(pending) > MAX_BODY_IMAGES_PER_SAVE:
        raise _unprocessable(
            f"Content contains {len(pending)} external or inline images; "
            f"at most {MAX_BODY_IMAGES_PER_SAVE} can be imported per save."
        )

    semaphore = asyncio.Semaphore(BODY_IMAGE_CONCURRENCY)

    async def _ingest(raw: str, src: str) -> None:
        async with semaphore:
            target = f"https:{src}" if src.startswith("//") else src
            try:
                result = await ingest_image_url(target)
            except HTTPException as exc:
                desc = _describe_src(src)
                raise _unprocessable(
                    f"Image in content body could not be imported ({desc}): {exc.detail}"
                ) from None
            replacements[raw] = result["url"]

    if pending:
        await asyncio.gather(*(_ingest(raw, src) for raw, src in pending))

    if not replacements:
        return content
    return IMG_SRC_RE.sub(
        lambda m: f"{m.group(1)}{replacements.get(m.group(2), m.group(2))}{m.group(3)}",
        content,
    )
