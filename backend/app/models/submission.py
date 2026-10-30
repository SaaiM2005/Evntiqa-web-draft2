import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, DateTime, Enum, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FormType(enum.StrEnum):
    EXPERT_CONSULTATION = "expert_consultation"
    CALENDAR_REQUEST = "calendar_request"
    CASE_STUDY_REQUEST = "case_study_request"


class SubmissionStatus(enum.StrEnum):
    NEW = "new"
    CONTACTED = "contacted"
    ARCHIVED = "archived"


def _pg_enum(cls: type[enum.StrEnum], name: str) -> Enum:
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])


class FormSubmission(Base):
    __tablename__ = "form_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    form_type: Mapped[FormType] = mapped_column(_pg_enum(FormType, "form_type"))
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(CITEXT)
    company: Mapped[str] = mapped_column(String(160))
    job_title: Mapped[str | None] = mapped_column(String(160))
    objective: Mapped[str | None] = mapped_column(String(40))
    message: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    ip_hash: Mapped[str | None] = mapped_column(CHAR(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[SubmissionStatus] = mapped_column(
        _pg_enum(SubmissionStatus, "submission_status"),
        server_default=SubmissionStatus.NEW.value,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_form_submissions_form_type_created_at", "form_type", created_at.desc()),
        Index("ix_form_submissions_email", "email"),
    )
