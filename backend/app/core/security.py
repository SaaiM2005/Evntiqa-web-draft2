import hashlib
import hmac
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie, APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import SESSION_COOKIE, user_for_token
from app.core.config import Settings, get_settings
from app.db.session import get_session
from app.models import AdminUser

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
session_cookie = APIKeyCookie(name=SESSION_COOKIE, auto_error=False)


async def current_admin(
    token: Annotated[str | None, Depends(session_cookie)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminUser:
    """Signed-in portal user (session cookie)."""
    user = await user_for_token(session, token) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    return user


async def require_admin(
    token: Annotated[str | None, Depends(session_cookie)],
    api_key: Annotated[str | None, Depends(api_key_header)],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    """Portal session cookie, or the X-API-Key header for scripts (when ADMIN_API_KEY is set)."""
    if api_key and settings.admin_api_key:
        if hmac.compare_digest(api_key, settings.admin_api_key.get_secret_value()):
            return
    if token and await user_for_token(session, token):
        return
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")


def client_ip(request: Request) -> str:
    # Behind Caddy, uvicorn's --proxy-headers has already resolved X-Forwarded-For.
    # This is only safe because the API port is never published directly in prod.
    return request.client.host if request.client else "unknown"


def hash_ip(ip: str, salt: str) -> str:
    return hmac.new(salt.encode(), ip.encode(), hashlib.sha256).hexdigest()
