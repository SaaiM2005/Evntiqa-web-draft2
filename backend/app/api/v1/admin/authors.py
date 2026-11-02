import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.security import require_admin
from app.core.utils import escape_like_pattern
from app.db.session import get_session
from app.models.author import Author
from app.models.content import ContentItem, ContentType
from app.schemas.author import (
    AuthorCreate,
    AuthorOption,
    AuthorResponse,
    AuthorUpdate,
)
from app.schemas.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page
from app.services.author_service import validate_author_uniqueness
from app.services.media_service import ensure_local_image

router = APIRouter(
    prefix="/api/v1/admin/authors",
    tags=["admin-authors"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=Page[AuthorResponse])
async def list_authors(
    q: str | None = Query(None, max_length=200, description="Search by author name or designation"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    stmt = select(Author).order_by(Author.name.asc(), Author.id.asc())
    count_stmt = select(func.count(Author.id))

    if q and q.strip():
        search_pattern = f"%{escape_like_pattern(q.strip())}%"
        condition = Author.name.ilike(search_pattern, escape="\\") | Author.designation.ilike(
            search_pattern, escape="\\"
        )
        stmt = stmt.where(condition)
        count_stmt = count_stmt.where(condition)

    total = (await db.execute(count_stmt)).scalar_one()
    paged_stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(paged_stmt)
    authors = list(result.scalars().all())

    return {
        "items": authors,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/options", response_model=list[AuthorOption])
async def list_author_options(
    db: AsyncSession = Depends(get_session),
) -> list[Author]:
    """Compact id/name list for editor dropdowns and duplicate checking."""
    stmt = (
        select(Author)
        .options(
            load_only(Author.id, Author.name, Author.designation, Author.avatar_url, Author.email)
        )
        .order_by(Author.name.asc(), Author.id.asc())
        .limit(500)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/{author_id}", response_model=AuthorResponse)
async def get_author(
    author_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> Author:
    stmt = select(Author).where(Author.id == author_id)
    result = await db.execute(stmt)
    author = result.scalar_one_or_none()
    if not author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Author not found",
        )
    return author


@router.post("", response_model=AuthorResponse, status_code=status.HTTP_201_CREATED)
async def create_author(
    author_in: AuthorCreate,
    db: AsyncSession = Depends(get_session),
) -> Author:
    avatar_url = await ensure_local_image(author_in.avatar_url, "Avatar image")
    await validate_author_uniqueness(
        db=db,
        name=author_in.name,
        email=author_in.email,
    )

    now = datetime.now(UTC)
    author = Author(
        id=uuid.uuid4(),
        name=author_in.name.strip(),
        description=author_in.description.strip(),
        email=author_in.email.strip().lower() if author_in.email else None,
        avatar_url=avatar_url,
        designation=author_in.designation.strip() if author_in.designation else None,
        created_at=now,
        updated_at=now,
    )
    db.add(author)
    await db.commit()
    await db.refresh(author)
    return author


@router.put("/{author_id}", response_model=AuthorResponse)
async def update_author(
    author_id: uuid.UUID,
    author_in: AuthorUpdate,
    db: AsyncSession = Depends(get_session),
) -> Author:
    stmt = select(Author).where(Author.id == author_id)
    result = await db.execute(stmt)
    author = result.scalar_one_or_none()
    if not author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Author not found",
        )

    avatar_url = None
    if "avatar_url" in author_in.model_fields_set:
        avatar_url = await ensure_local_image(author_in.avatar_url, "Avatar image")

    check_name = author_in.name if author_in.name is not None else author.name
    check_email = author_in.email if author_in.email is not None else author.email
    await validate_author_uniqueness(
        db=db,
        name=check_name,
        email=check_email,
        exclude_author_id=author_id,
    )

    update_data = author_in.model_dump(exclude_unset=True)
    if "avatar_url" in update_data:
        update_data["avatar_url"] = avatar_url
    if "name" in update_data and update_data["name"]:
        update_data["name"] = update_data["name"].strip()
    if "description" in update_data and update_data["description"]:
        update_data["description"] = update_data["description"].strip()
    if "email" in update_data:
        raw_email = update_data["email"]
        update_data["email"] = raw_email.strip().lower() if raw_email else None
    if "designation" in update_data:
        raw_desig = update_data["designation"]
        update_data["designation"] = raw_desig.strip() if raw_desig else None

    update_data["updated_at"] = datetime.now(UTC)

    for field, value in update_data.items():
        setattr(author, field, value)

    await db.commit()
    await db.refresh(author)
    return author


@router.delete("/{author_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_author(
    author_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    stmt = select(Author).where(Author.id == author_id)
    result = await db.execute(stmt)
    author = result.scalar_one_or_none()
    if not author:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Author not found",
        )

    # NEWS must always have an author attribution
    news_count = (
        await db.execute(
            select(func.count(ContentItem.id)).where(
                ContentItem.author_id == author_id,
                ContentItem.type == ContentType.NEWS,
            )
        )
    ).scalar_one()

    if news_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This author is credited on {news_count} NEWS item(s). "
                "Reassign them to another author before deleting."
            ),
        )

    await db.delete(author)
    await db.commit()
