import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Author(Base):
    __tablename__ = "authors"
    __table_args__ = (
        Index(
            "uq_authors_email_ci",
            func.lower(text("email")),
            unique=True,
            postgresql_where=text("email IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )
    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    designation: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
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

    content_items = relationship(
        "ContentItem",
        back_populates="author",
        lazy="selectin",
        passive_deletes=True,
    )
