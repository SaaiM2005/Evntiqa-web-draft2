import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.db.session import get_session
from app.models.author import Author
from app.schemas.author import AuthorCreate, AuthorResponse, AuthorUpdate

router = APIRouter(
    prefix="/api/v1/admin/authors",
    tags=["admin-authors"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=list[AuthorResponse])
async def list_authors(
    db: AsyncSession = Depends(get_session),
) -> list[Author]:
    stmt = select(Author).order_by(Author.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=AuthorResponse, status_code=status.HTTP_201_CREATED)
async def create_author(
    author_in: AuthorCreate,
    db: AsyncSession = Depends(get_session),
) -> Author:
    if author_in.email:
        existing = await db.scalar(
            select(Author.id).where(func.lower(Author.email) == author_in.email.lower())
        )
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "An author with this email already exists.")

    author = Author(**author_in.model_dump())
    db.add(author)
    await db.commit()
    await db.refresh(author)
    return author
