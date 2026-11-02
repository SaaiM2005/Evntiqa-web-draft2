import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.utils import generate_slug


class CategoryBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=1000)


class CategoryCreate(CategoryBase):
    def model_post_init(self, __context: object) -> None:
        if not self.slug or not self.slug.strip():
            self.slug = generate_slug(self.name)


class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    slug: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=1000)


class CategoryResponse(CategoryBase):
    id: uuid.UUID
    slug: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CategorySummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str

    model_config = ConfigDict(from_attributes=True)
