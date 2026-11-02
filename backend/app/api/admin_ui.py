from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import FileResponse

ADMIN_DIR = Path(__file__).resolve().parent.parent / "admin"
ASSETS_DIR = ADMIN_DIR / "assets"

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
@router.get("/admin/")
@router.get("/admin/{subpath:path}")
async def admin_page(subpath: str = "") -> Response:
    if subpath.startswith("assets/") or subpath == "assets":
        rel_path = subpath[len("assets/") :] if subpath.startswith("assets/") else ""
        asset_file = (ASSETS_DIR / rel_path).resolve()
        if asset_file.is_file() and str(asset_file).startswith(str(ASSETS_DIR.resolve())):
            return FileResponse(asset_file)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    return FileResponse(
        ADMIN_DIR / "index.html",
        headers={
            "Content-Security-Policy": CSP,
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
        },
    )
