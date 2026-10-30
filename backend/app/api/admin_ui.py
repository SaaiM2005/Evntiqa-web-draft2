from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

ADMIN_DIR = Path(__file__).resolve().parent.parent / "admin"

# Strict CSP: no inline scripts, data only from this origin.
CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data:; "
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
