"""create form_submissions

Revision ID: 0001
Revises:
Create Date: 2026-10-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

form_type = postgresql.ENUM(
    "expert_consultation", "calendar_request", "case_study_request", name="form_type"
)
submission_status = postgresql.ENUM("new", "contacted", "archived", name="submission_status")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table(
        "form_submissions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("form_type", form_type, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("company", sa.String(160), nullable=False),
        sa.Column("job_title", sa.String(160), nullable=True),
        sa.Column("objective", sa.String(40), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("ip_hash", sa.CHAR(64), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("status", submission_status, server_default="new", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_form_submissions"),
    )
    op.create_index(
        "ix_form_submissions_form_type_created_at",
        "form_submissions",
        ["form_type", sa.text("created_at DESC")],
    )
    op.create_index("ix_form_submissions_email", "form_submissions", ["email"])


def downgrade() -> None:
    op.drop_index("ix_form_submissions_email", table_name="form_submissions")
    op.drop_index("ix_form_submissions_form_type_created_at", table_name="form_submissions")
    op.drop_table("form_submissions")
    submission_status.drop(op.get_bind(), checkfirst=True)
    form_type.drop(op.get_bind(), checkfirst=True)
