import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import ContentItem, ContentStatus


async def clear_primary_featured(
    session: AsyncSession,
    exclude_id: uuid.UUID | None = None,
) -> None:
    stmt = update(ContentItem).where(ContentItem.is_primary_featured.is_(True))
    if exclude_id is not None:
        stmt = stmt.where(ContentItem.id != exclude_id)
    await session.execute(
        stmt.values(is_primary_featured=False, version=ContentItem.version + 1).execution_options(
            synchronize_session=False
        )
    )


async def toggle_primary_featured_content(
    session: AsyncSession,
    content_id: uuid.UUID,
) -> ContentItem | None:
    stmt = select(ContentItem).where(ContentItem.id == content_id)
    result = await session.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        return None

    if item.is_primary_featured:
        item.is_primary_featured = False
    else:
        await clear_primary_featured(session, exclude_id=content_id)
        item.is_primary_featured = True

    await session.commit()
    await session.refresh(item)
    return item


set_primary_featured_content = toggle_primary_featured_content


async def get_primary_featured_content(
    session: AsyncSession,
) -> ContentItem | None:
    # 1. Check for manual override
    manual_query = (
        select(ContentItem)
        .where(
            ContentItem.is_primary_featured.is_(True),
            ContentItem.status == ContentStatus.PUBLISHED,
        )
        .limit(1)
    )
    manual_result = await session.execute(manual_query)
    featured = manual_result.scalar_one_or_none()
    if featured:
        return featured

    # 2. Automated fallback: most recently published item with a cover image
    fallback_query = (
        select(ContentItem)
        .where(
            ContentItem.status == ContentStatus.PUBLISHED,
            ContentItem.cover_image_url.isnot(None),
            ContentItem.cover_image_url != "",
        )
        .order_by(ContentItem.published_at.desc().nullslast(), ContentItem.created_at.desc())
        .limit(1)
    )
    fallback_result = await session.execute(fallback_query)
    fallback_item = fallback_result.scalar_one_or_none()
    if fallback_item:
        return fallback_item

    # 3. Final fallback: most recently published item
    final_query = (
        select(ContentItem)
        .where(ContentItem.status == ContentStatus.PUBLISHED)
        .order_by(ContentItem.published_at.desc().nullslast(), ContentItem.created_at.desc())
        .limit(1)
    )
    final_result = await session.execute(final_query)
    return final_result.scalar_one_or_none()
