import uuid
from datetime import datetime
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.utils import generate_slug, sanitize_html_content, validate_safe_url
from app.models.content import ContentStatus, ContentType
from app.schemas.author import AuthorResponse, AuthorSummary
from app.schemas.category import CategoryResponse, CategorySummary


class FAQItem(BaseModel):
    q: str = Field(..., min_length=3, max_length=500, description="FAQ question text")
    a: str = Field(..., min_length=3, max_length=5000, description="FAQ answer text")


class ContentItemBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=255, description="Headline / Title")
    type: ContentType = Field(default=ContentType.ARTICLE, description="Content type")
    slug: str | None = Field(None, max_length=255, description="URL slug")
    brief: str | None = Field(None, max_length=2000, description="Short summary / excerpt")
    content: str = Field(..., min_length=1, max_length=5_000_000, description="Rich text content")
    cover_image_url: str | None = Field(None, max_length=500)
    author_id: uuid.UUID | None = Field(None, description="Author ID (optional for Article/Blog)")
    category_id: uuid.UUID | None = Field(None, description="Category / Topic ID")
    status: ContentStatus = Field(default=ContentStatus.DRAFT, description="Status")
    is_primary_featured: bool = Field(default=False, description="Set as Homepage Featured")
    published_at: datetime | None = None
    scheduled_at: datetime | None = None
    faqs: list[FAQItem] = Field(default_factory=list)
    meta_title: str | None = Field(None, max_length=255)
    meta_description: str | None = Field(None, max_length=1000)
    canonical_url: str | None = Field(None, max_length=500)


class ContentItemCreate(ContentItemBase):
    @model_validator(mode="after")
    def validate_content_rules(self) -> Self:
        if len(self.title.strip()) < 3:
            raise ValueError("Title must be at least 3 characters.")

        if not self.slug or not self.slug.strip():
            self.slug = generate_slug(self.title)

        if self.content:
            self.content = sanitize_html_content(self.content)

        if self.cover_image_url is not None:
            self.cover_image_url = validate_safe_url(
                self.cover_image_url, allow_data_image=True, field_name="cover_image_url"
            )
        if self.canonical_url is not None:
            self.canonical_url = validate_safe_url(
                self.canonical_url, allow_data_image=False, field_name="canonical_url"
            )

        return self


class ContentItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=255)
    type: ContentType | None = None
    slug: str | None = Field(None, max_length=255)
    brief: str | None = Field(None, max_length=2000)
    content: str | None = Field(None, max_length=5_000_000)
    cover_image_url: str | None = Field(None, max_length=500)
    author_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    status: ContentStatus | None = None
    is_primary_featured: bool | None = None
    published_at: datetime | None = None
    scheduled_at: datetime | None = None
    faqs: list[FAQItem] | None = None
    meta_title: str | None = Field(None, max_length=255)
    meta_description: str | None = Field(None, max_length=1000)
    canonical_url: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def validate_update_rules(self) -> Self:
        if self.title is not None and len(self.title.strip()) < 3:
            raise ValueError("Title must be at least 3 characters.")
        if self.slug is not None:
            self.slug = generate_slug(self.slug)
        if self.content is not None:
            self.content = sanitize_html_content(self.content)
        if self.cover_image_url is not None:
            self.cover_image_url = validate_safe_url(
                self.cover_image_url, allow_data_image=True, field_name="cover_image_url"
            )
        if self.canonical_url is not None:
            self.canonical_url = validate_safe_url(
                self.canonical_url, allow_data_image=False, field_name="canonical_url"
            )
        return self


class ContentItemResponse(ContentItemBase):
    id: uuid.UUID
    views_count: int = 0
    shares_count: int = 0
    reading_time_minutes: int = 1
    version: int = 1
    created_at: datetime
    updated_at: datetime
    author: AuthorResponse | None = None
    category: CategoryResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class ContentItemSummary(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    type: ContentType
    brief: str | None = None
    cover_image_url: str | None = None
    status: ContentStatus
    is_primary_featured: bool
    published_at: datetime | None = None
    views_count: int = 0
    reading_time_minutes: int = 1
    created_at: datetime
    author: AuthorSummary | None = None
    category: CategorySummary | None = None

    model_config = ConfigDict(from_attributes=True)


class AdminContentListItem(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    type: ContentType
    status: ContentStatus
    is_primary_featured: bool
    published_at: datetime | None = None
    scheduled_at: datetime | None = None
    views_count: int = 0
    created_at: datetime
    updated_at: datetime
    author_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    author: AuthorSummary | None = None
    category: CategorySummary | None = None

    model_config = ConfigDict(from_attributes=True)
