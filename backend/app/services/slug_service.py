import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import ContentItem

MAX_SLUG_ATTEMPTS = 5


def suffixed_slug(base: str) -> str:
    return f"{base}-{uuid.uuid4().hex[:6]}"


async def ensure_unique_slug(
    db: AsyncSession,
    slug: str,
    exclude_id: uuid.UUID | None = None,
) -> str:
    current_slug = slug
    for attempt in range(MAX_SLUG_ATTEMPTS):
        query = select(ContentItem.id).where(ContentItem.slug == current_slug)
        if exclude_id is not None:
            query = query.where(ContentItem.id != exclude_id)
        existing = await db.scalar(query)
        if existing is None:
            return current_slug
        current_slug = suffixed_slug(slug)
    return f"{slug}-{uuid.uuid4().hex[:8]}"
