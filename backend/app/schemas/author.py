import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.core.utils import validate_safe_url


class AuthorBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Author full name")
    description: str = Field(
        ..., min_length=5, max_length=2000, description="Author biography / bio"
    )
    email: EmailStr | None = Field(None, description="Optional contact email")
    avatar_url: str | None = Field(
        None, max_length=500, description="Optional avatar profile image URL"
    )
    designation: str | None = Field(None, max_length=100, description="Author role / job title")


class AuthorCreate(AuthorBase):
    @model_validator(mode="after")
    def validate_author_urls(self) -> Self:
        if self.avatar_url is not None:
            self.avatar_url = validate_safe_url(
                self.avatar_url, allow_data_image=True, field_name="avatar_url"
            )
        return self


class AuthorUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = Field(None, min_length=5, max_length=2000)
    email: EmailStr | None = None
    avatar_url: str | None = Field(None, max_length=500)
    designation: str | None = Field(None, max_length=100)

    @model_validator(mode="after")
    def validate_author_update_urls(self) -> Self:
        if self.avatar_url is not None:
            self.avatar_url = validate_safe_url(
                self.avatar_url, allow_data_image=True, field_name="avatar_url"
            )
        return self


class AuthorSummary(BaseModel):
    """Lightweight representation of an Author when embedded inside articles/news."""

    id: uuid.UUID
    name: str
    designation: str | None = None
    avatar_url: str | None = None
    description: str | None = None
    email: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AuthorOption(BaseModel):
    """Compact admin dropdown entry; includes email so the UI can warn about duplicates."""

    id: uuid.UUID
    name: str
    designation: str | None = None
    avatar_url: str | None = None
    email: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AuthorResponse(AuthorBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
