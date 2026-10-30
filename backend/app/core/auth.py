import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminSession, AdminUser

SESSION_COOKIE = "evntiqa_admin"
MIN_PASSWORD_LENGTH = 10

_hasher = PasswordHasher()
# Verified against when the email is unknown, so response time doesn't reveal which emails exist.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def authenticate(session: AsyncSession, email: str, password: str) -> AdminUser | None:
    user = await session.scalar(select(AdminUser).where(AdminUser.email == email))
    if user is None:
        verify_password(_DUMMY_HASH, password)
        return None
    if not verify_password(user.password_hash, password) or not user.is_active:
        return None
    if _hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


async def create_session(session: AsyncSession, user: AdminUser, ttl: timedelta) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    # Opportunistic cleanup keeps the table small without a separate job.
    await session.execute(delete(AdminSession).where(AdminSession.expires_at < now))
    session.add(AdminSession(token_hash=_token_hash(token), user_id=user.id, expires_at=now + ttl))
    user.last_login_at = now
    await session.commit()
    return token


async def user_for_token(session: AsyncSession, token: str) -> AdminUser | None:
    row = await session.scalar(
        select(AdminSession).where(
            AdminSession.token_hash == _token_hash(token),
            AdminSession.expires_at > datetime.now(UTC),
        )
    )
    if row is None or not row.user.is_active:
        return None
    return row.user


async def revoke_session(session: AsyncSession, token: str) -> None:
    await session.execute(delete(AdminSession).where(AdminSession.token_hash == _token_hash(token)))
    await session.commit()


async def revoke_all_sessions(session: AsyncSession, user: AdminUser) -> None:
    await session.execute(delete(AdminSession).where(AdminSession.user_id == user.id))
