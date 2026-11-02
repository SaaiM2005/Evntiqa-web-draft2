from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils import escape_like_pattern
from app.db.session import get_session
from app.models.category import Category
from app.models.content import ContentItem, ContentStatus, ContentType
from app.schemas.category import CategoryResponse
from app.schemas.content import ContentItemResponse, ContentItemSummary
from app.services.content_service import get_primary_featured_content

router = APIRouter(prefix="/api/v1/content", tags=["content"])


@router.get("", response_model=list[ContentItemSummary])
async def list_public_content(
    type: ContentType | None = Query(None, description="Filter by type (NEWS, ARTICLE, BLOG)"),
    category: str | None = Query(None, max_length=100, description="Filter by category slug"),
    q: str | None = Query(None, max_length=200, description="Search query string"),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
) -> list[ContentItem]:
    stmt = (
        select(ContentItem)
        .options(selectinload(ContentItem.author), selectinload(ContentItem.category))
        .where(ContentItem.status == ContentStatus.PUBLISHED)
        .order_by(ContentItem.published_at.desc().nullslast(), ContentItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if type:
        stmt = stmt.where(ContentItem.type == type)
    if category:
        stmt = stmt.outerjoin(ContentItem.category).where(Category.slug == category)
    if q and q.strip():
        search = f"%{escape_like_pattern(q.strip())}%"
        stmt = stmt.where(
            ContentItem.title.ilike(search)
            | ContentItem.slug.ilike(search)
            | ContentItem.brief.ilike(search)
            | ContentItem.content.ilike(search)
        )

    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/featured", response_model=ContentItemResponse | None)
async def get_featured_content(
    db: AsyncSession = Depends(get_session),
) -> ContentItem | None:
    featured = await get_primary_featured_content(db)
    if not featured:
        return None

    refetch = (
        select(ContentItem)
        .options(selectinload(ContentItem.author), selectinload(ContentItem.category))
        .where(ContentItem.id == featured.id)
    )
    return (await db.execute(refetch)).scalar_one_or_none()


@router.get("/categories", response_model=list[CategoryResponse])
async def get_public_categories(
    db: AsyncSession = Depends(get_session),
) -> list[Category]:
    stmt = select(Category).order_by(Category.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/by-slug/{slug}", response_model=ContentItemResponse)
async def get_content_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_session),
) -> ContentItem:
    stmt = (
        select(ContentItem)
        .options(selectinload(ContentItem.author), selectinload(ContentItem.category))
        .where(ContentItem.slug == slug, ContentItem.status == ContentStatus.PUBLISHED)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No published article found for slug '{slug}'.",
        )

    # Increment view count
    await db.execute(
        update(ContentItem)
        .where(ContentItem.id == item.id)
        .values(views_count=ContentItem.views_count + 1)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    item.views_count += 1
    return item
