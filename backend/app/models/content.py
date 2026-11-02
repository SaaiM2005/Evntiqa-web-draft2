import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base

JsonType = JSON().with_variant(JSONB, "postgresql")


class ContentType(enum.StrEnum):
    NEWS = "NEWS"
    ARTICLE = "ARTICLE"
    BLOG = "BLOG"


class ContentStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    SCHEDULED = "SCHEDULED"
    ARCHIVED = "ARCHIVED"


class ContentItem(Base):
    __tablename__ = "content_items"
    __table_args__ = (
        Index(
            "uq_content_single_featured",
            "is_primary_featured",
            unique=True,
            postgresql_where=text("is_primary_featured"),
        ),
        Index("ix_content_created", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    type: Mapped[ContentType] = mapped_column(
        String(20),
        default=ContentType.ARTICLE,
        nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    slug: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    brief: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    cover_image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("authors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[ContentStatus] = mapped_column(
        String(20),
        default=ContentStatus.DRAFT,
        nullable=False,
        index=True,
    )
    is_primary_featured: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    faqs: Mapped[list[dict[str, Any]]] = mapped_column(
        JsonType,
        default=list,
        server_default=text("'[]'::jsonb"),
        nullable=False,
    )
    meta_title: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    meta_description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    canonical_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    views_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )
    shares_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )
    reading_time_minutes: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=func.now(),
        nullable=False,
    )

    author = relationship(
        "Author",
        back_populates="content_items",
        lazy="joined",
    )
    category = relationship(
        "Category",
        back_populates="content_items",
        lazy="joined",
    )
