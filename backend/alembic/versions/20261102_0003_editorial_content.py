"""create editorial content tables (authors, categories, content_items)

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create authors table
    op.create_table(
        "authors",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("designation", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_authors_email_ci",
        "authors",
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )

    # 2. Create categories table
    op.create_table(
        "categories",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_categories_name_ci", "categories", [sa.text("lower(name)")], unique=True)
    op.create_index(op.f("ix_categories_slug"), "categories", ["slug"], unique=True)

    # 3. Create content_items table
    op.create_table(
        "content_items",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("type", sa.String(length=20), server_default="ARTICLE", nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("brief", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("cover_image_url", sa.String(length=500), nullable=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="DRAFT", nullable=False),
        sa.Column(
            "is_primary_featured",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "faqs",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("meta_title", sa.String(length=255), nullable=True),
        sa.Column("meta_description", sa.Text(), nullable=True),
        sa.Column("canonical_url", sa.String(length=500), nullable=True),
        sa.Column("views_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("shares_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reading_time_minutes", sa.Integer(), server_default="1", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["author_id"], ["authors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_content_items_slug"), "content_items", ["slug"], unique=True)
    op.create_index(op.f("ix_content_items_type"), "content_items", ["type"], unique=False)
    op.create_index(op.f("ix_content_items_status"), "content_items", ["status"], unique=False)
    op.create_index(
        op.f("ix_content_items_published_at"), "content_items", ["published_at"], unique=False
    )
    op.create_index(
        op.f("ix_content_items_is_primary_featured"),
        "content_items",
        ["is_primary_featured"],
        unique=False,
    )
    op.create_index(
        "uq_content_single_featured",
        "content_items",
        ["is_primary_featured"],
        unique=True,
        postgresql_where=sa.text("is_primary_featured"),
    )
    op.create_index(
        op.f("ix_content_items_author_id"), "content_items", ["author_id"], unique=False
    )
    op.create_index(
        op.f("ix_content_items_category_id"), "content_items", ["category_id"], unique=False
    )


def downgrade() -> None:
    op.drop_table("content_items")
    op.drop_table("categories")
    op.drop_table("authors")
