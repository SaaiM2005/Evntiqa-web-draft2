import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import require_admin
from app.core.utils import calculate_reading_time, escape_like_pattern, generate_slug
from app.db.session import get_session
from app.models.author import Author
from app.models.category import Category
from app.models.content import ContentItem, ContentStatus, ContentType
from app.schemas.content import (
    AdminContentListItem,
    ContentItemCreate,
    ContentItemResponse,
    ContentItemUpdate,
)
from app.schemas.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page
from app.services.content_service import clear_primary_featured, toggle_primary_featured_content
from app.services.media_service import ensure_local_image, localize_html_images
from app.services.slug_service import ensure_unique_slug

router = APIRouter(
    prefix="/api/v1/admin/content",
    tags=["admin-content"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=Page[AdminContentListItem])
async def list_content_items(
    type: ContentType | None = Query(None, description="Filter by type (NEWS, ARTICLE, BLOG)"),
    status_filter: ContentStatus | None = Query(None, alias="status", description="Filter by status"),
    category_id: uuid.UUID | None = Query(None, description="Filter by category ID"),
    q: str | None = Query(None, max_length=200, description="Search by title, brief, or slug"),
    sort_by: str = Query("created_at"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
) -> dict:
    stmt = (
        select(ContentItem)
        .options(
            selectinload(ContentItem.author),
            selectinload(ContentItem.category),
        )
    )

    if sort_by == "author":
        stmt = stmt.outerjoin(Author, ContentItem.author_id == Author.id)
        order_col = Author.name
    elif sort_by in ("primary_feature", "is_primary_featured"):
        order_col = ContentItem.is_primary_featured
    elif sort_by == "title":
        order_col = ContentItem.title
    elif sort_by == "type":
        order_col = ContentItem.type
    elif sort_by == "status":
        order_col = ContentItem.status
    elif sort_by in ("reads", "views_count"):
        order_col = ContentItem.views_count
    else:
        order_col = ContentItem.created_at

    if sort_order == "asc":
        stmt = stmt.order_by(order_col.asc().nullslast(), ContentItem.id.asc())
    else:
        stmt = stmt.order_by(order_col.desc().nullslast(), ContentItem.id.desc())

    count_stmt = select(func.count(ContentItem.id))

    if type:
        stmt = stmt.where(ContentItem.type == type)
        count_stmt = count_stmt.where(ContentItem.type == type)
    if status_filter:
        stmt = stmt.where(ContentItem.status == status_filter)
        count_stmt = count_stmt.where(ContentItem.status == status_filter)
    if category_id:
        stmt = stmt.where(ContentItem.category_id == category_id)
        count_stmt = count_stmt.where(ContentItem.category_id == category_id)
    if q and q.strip():
        search = f"%{escape_like_pattern(q.strip())}%"
        condition = (
            ContentItem.title.ilike(search)
            | ContentItem.slug.ilike(search)
            | ContentItem.brief.ilike(search)
        )
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = (await db.execute(count_stmt)).scalar() or 0
    items = (await db.execute(stmt.limit(limit).offset(offset))).scalars().all()

    return {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=ContentItemResponse, status_code=status.HTTP_201_CREATED)
async def create_content_item(
    item_in: ContentItemCreate,
    db: AsyncSession = Depends(get_session),
) -> ContentItem:
    if item_in.author_id:
        author = await db.get(Author, item_in.author_id)
        if not author:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Author not found.")

    if item_in.category_id:
        category = await db.get(Category, item_in.category_id)
        if not category:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found.")

    local_cover = await ensure_local_image(item_in.cover_image_url, label="Cover image")
    localized_content = await localize_html_images(item_in.content)

    base_slug = item_in.slug or generate_slug(item_in.title)
    final_slug = await ensure_unique_slug(db, base_slug)

    reading_time = calculate_reading_time(localized_content or "")

    published_at = item_in.published_at
    if item_in.status == ContentStatus.PUBLISHED and not published_at:
        published_at = datetime.now(UTC)

    if item_in.is_primary_featured:
        await clear_primary_featured(db)

    item = ContentItem(
        type=item_in.type,
        title=item_in.title,
        slug=final_slug,
        brief=item_in.brief,
        content=localized_content or "",
        cover_image_url=local_cover,
        author_id=item_in.author_id,
        category_id=item_in.category_id,
        status=item_in.status,
        is_primary_featured=item_in.is_primary_featured,
        published_at=published_at,
        scheduled_at=item_in.scheduled_at,
        faqs=[f.model_dump() for f in item_in.faqs],
        meta_title=item_in.meta_title,
        meta_description=item_in.meta_description,
        canonical_url=item_in.canonical_url,
        reading_time_minutes=reading_time,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item, attribute_names=["author", "category"])
    return item


@router.get("/{id}", response_model=ContentItemResponse)
async def get_content_item(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ContentItem:
    stmt = (
        select(ContentItem)
        .options(selectinload(ContentItem.author), selectinload(ContentItem.category))
        .where(ContentItem.id == id)
    )
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content item not found.")
    return item


@router.patch("/{id}", response_model=ContentItemResponse)
async def update_content_item(
    id: uuid.UUID,
    item_in: ContentItemUpdate,
    db: AsyncSession = Depends(get_session),
) -> ContentItem:
    stmt = (
        select(ContentItem)
        .options(selectinload(ContentItem.author), selectinload(ContentItem.category))
        .where(ContentItem.id == id)
    )
    item = (await db.execute(stmt)).scalar_one_or_none()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content item not found.")

    update_data = item_in.model_dump(exclude_unset=True)

    if "author_id" in update_data and update_data["author_id"]:
        author = await db.get(Author, update_data["author_id"])
        if not author:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Author not found.")

    if "category_id" in update_data and update_data["category_id"]:
        category = await db.get(Category, update_data["category_id"])
        if not category:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found.")

    if "cover_image_url" in update_data:
        update_data["cover_image_url"] = await ensure_local_image(
            update_data["cover_image_url"], label="Cover image"
        )

    if "content" in update_data and update_data["content"] is not None:
        update_data["content"] = await localize_html_images(update_data["content"])
        update_data["reading_time_minutes"] = calculate_reading_time(update_data["content"] or "")

    if "slug" in update_data and update_data["slug"]:
        update_data["slug"] = await ensure_unique_slug(db, update_data["slug"], exclude_id=id)

    if update_data.get("is_primary_featured") is True:
        await clear_primary_featured(db, exclude_id=id)

    if "status" in update_data and update_data["status"] == ContentStatus.PUBLISHED:
        if not item.published_at and not update_data.get("published_at"):
            update_data["published_at"] = datetime.now(UTC)

    if "faqs" in update_data and update_data["faqs"] is not None:
        update_data["faqs"] = [f if isinstance(f, dict) else f.model_dump() for f in update_data["faqs"]]

    for field, value in update_data.items():
        setattr(item, field, value)

    item.version += 1
    await db.commit()
    await db.refresh(item, attribute_names=["author", "category"])
    return item


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_content_item(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    item = await db.get(ContentItem, id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content item not found.")
    await db.delete(item)
    await db.commit()


@router.post("/{id}/set-primary-featured", response_model=ContentItemResponse)
async def set_primary_featured(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ContentItem:
    item = await toggle_primary_featured_content(db, id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content item not found.")
    await db.refresh(item, attribute_names=["author", "category"])
    return item
