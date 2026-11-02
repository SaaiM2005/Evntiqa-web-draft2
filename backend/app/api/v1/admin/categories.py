import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_admin
from app.core.utils import generate_slug
from app.db.session import get_session
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryResponse

router = APIRouter(
    prefix="/api/v1/admin/categories",
    tags=["admin-categories"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_session),
) -> list[Category]:
    stmt = select(Category).order_by(Category.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_in: CategoryCreate,
    db: AsyncSession = Depends(get_session),
) -> Category:
    name_exists = await db.scalar(
        select(Category.id).where(func.lower(Category.name) == category_in.name.lower())
    )
    if name_exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "A category with this name already exists.")

    slug = category_in.slug or generate_slug(category_in.name)
    slug_exists = await db.scalar(select(Category.id).where(Category.slug == slug))
    if slug_exists:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    category = Category(
        name=category_in.name,
        slug=slug,
        description=category_in.description,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category
