from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import update

from app.core.auth import SESSION_COOKIE, hash_password
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_sessionmaker
from app.models import AdminSession, AdminUser

EMAIL = "admin@evntiqa.com"
PASSWORD = "correct-horse-battery"


@pytest.fixture
async def admin() -> AdminUser:
    async with get_sessionmaker()() as session:
        user = AdminUser(email=EMAIL, password_hash=hash_password(PASSWORD))
        session.add(user)
        await session.commit()
        return user


async def login(client: AsyncClient, email: str = EMAIL, password: str = PASSWORD) -> int:
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return res.status_code


async def test_login_sets_httponly_cookie_and_grants_access(
    client: AsyncClient, admin: AdminUser
) -> None:
    assert (await client.get("/api/v1/submissions")).status_code == 401

    res = await client.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert res.status_code == 204
    cookie = res.headers["set-cookie"]
    assert f"{SESSION_COOKIE}=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie

    assert (await client.get("/api/v1/auth/me")).json() == {"email": EMAIL}
    assert (await client.get("/api/v1/submissions")).status_code == 200
    assert (await client.get("/api/v1/submissions/stats")).status_code == 200


async def test_email_is_case_insensitive(client: AsyncClient, admin: AdminUser) -> None:
    assert await login(client, email="Admin@Evntiqa.com") == 204


async def test_wrong_credentials_rejected(client: AsyncClient, admin: AdminUser) -> None:
    assert await login(client, password="wrong-password") == 401
    assert await login(client, email="nobody@evntiqa.com") == 401
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_logout_revokes_session(client: AsyncClient, admin: AdminUser) -> None:
    await login(client)
    token = client.cookies.get(SESSION_COOKIE)
    assert (await client.post("/api/v1/auth/logout")).status_code == 204

    # Even replaying the old token must fail: the session row is gone server-side.
    client.cookies.set(SESSION_COOKIE, token or "")
    assert (await client.get("/api/v1/submissions")).status_code == 401


async def test_expired_session_rejected(client: AsyncClient, admin: AdminUser) -> None:
    await login(client)
    async with get_sessionmaker()() as session:
        await session.execute(
            update(AdminSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        await session.commit()
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_deactivated_admin_loses_access(client: AsyncClient, admin: AdminUser) -> None:
    await login(client)
    async with get_sessionmaker()() as session:
        await session.execute(update(AdminUser).values(is_active=False))
        await session.commit()
    assert (await client.get("/api/v1/submissions")).status_code == 401
    assert await login(client) == 401


async def test_login_rate_limited(client: AsyncClient, admin: AdminUser) -> None:
    settings = get_settings()
    original = settings.login_rate_limit
    settings.login_rate_limit = "3/minute"
    limiter.reset()
    try:
        codes = [await login(client, password="nope") for _ in range(4)]
    finally:
        settings.login_rate_limit = original
    assert codes == [401, 401, 401, 429]


async def test_password_not_stored_in_plaintext(admin: AdminUser) -> None:
    assert PASSWORD not in admin.password_hash
    assert admin.password_hash.startswith("$argon2id$")
