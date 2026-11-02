from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

ADMIN_DIR = Path(__file__).resolve().parent.parent / "admin"

# Strict CSP: no inline scripts, data only from this origin.
CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: https: blob:; "
    "media-src 'self' data: blob:; "
    "frame-src 'self' https://www.youtube.com https://youtube.com "
    "https://www.youtube-nocookie.com https://player.vimeo.com; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'none'; "
    "form-action 'none'"
)

router = APIRouter(include_in_schema=False)


@router.get("/admin")
async def admin_page() -> FileResponse:
    return FileResponse(
        ADMIN_DIR / "index.html",
        headers={
            "Content-Security-Policy": CSP,
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
        },
    )
