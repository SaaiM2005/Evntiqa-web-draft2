from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


def async_url(url: str) -> str:
    return url.replace("postgresql://", "postgresql+asyncpg://", 1)


@lru_cache
def get_engine() -> AsyncEngine:
    url = async_url(str(get_settings().database_url))
    return create_async_engine(url, pool_size=5, max_overflow=5, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session
