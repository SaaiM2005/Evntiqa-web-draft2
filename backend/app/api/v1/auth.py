import logging
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import SESSION_COOKIE, authenticate, create_session, revoke_session
from app.core.config import Settings, get_settings
from app.core.rate_limit import limiter
from app.core.security import current_admin, session_cookie
from app.db.session import get_session
from app.models import AdminUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class AdminMe(BaseModel):
    email: str


def _login_rate_limit() -> str:
    return get_settings().login_rate_limit


@router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(_login_rate_limit)
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    user = await authenticate(session, str(body.email), body.password)
    if user is None:
        logger.info("admin login failed")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    ttl = timedelta(hours=settings.session_ttl_hours)
    token = await create_session(session, user, ttl)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(ttl.total_seconds()),
        httponly=True,
        secure=settings.is_prod,
        samesite="strict",
        path="/",
    )
    logger.info("admin login id=%s", user.id)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: SessionDep,
    token: Annotated[str | None, Depends(session_cookie)],
) -> None:
    if token:
        await revoke_session(session, token)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=AdminMe)
async def me(user: Annotated[AdminUser, Depends(current_admin)]) -> AdminMe:
    return AdminMe(email=user.email)
