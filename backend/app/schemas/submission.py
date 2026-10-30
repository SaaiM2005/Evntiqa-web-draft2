import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.models import FormType, SubmissionStatus

Objective = Literal["roundtables", "stalled-deals", "net-new", "webinars", "custom"]

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)]
MetaValue = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class SubmissionMeta(BaseModel):
    """Allow-listed per-form extras, stored in the JSONB `metadata` column."""

    model_config = ConfigDict(extra="forbid")

    case_study_title: MetaValue | None = None
    page_url: MetaValue | None = None
    referrer: MetaValue | None = None
    utm_source: MetaValue | None = None
    utm_medium: MetaValue | None = None
    utm_campaign: MetaValue | None = None
    utm_term: MetaValue | None = None
    utm_content: MetaValue | None = None


class SubmissionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    form_type: FormType
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    email: EmailStr
    company: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    job_title: ShortText | None = None
    objective: Objective | None = None
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    metadata: SubmissionMeta = Field(default_factory=SubmissionMeta)
    # Honeypot: hidden from humans, bots fill it in.
    website: str | None = None


class SubmissionCreated(BaseModel):
    id: uuid.UUID | None


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    form_type: FormType
    name: str
    email: str
    company: str
    job_title: str | None
    objective: str | None
    message: str | None
    metadata: dict[str, Any] = Field(validation_alias="meta")
    status: SubmissionStatus
    created_at: datetime


class SubmissionPage(BaseModel):
    items: list[SubmissionRead]
    total: int
    page: int
    page_size: int


class SubmissionStats(BaseModel):
    total: int
    by_form_type: dict[FormType, int]
    by_status: dict[SubmissionStatus, int]


class SubmissionStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SubmissionStatus
