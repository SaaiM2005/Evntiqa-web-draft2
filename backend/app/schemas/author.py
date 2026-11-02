import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AuthorBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: str = Field(default="", max_length=1000)
    email: EmailStr | None = None
    avatar_url: str | None = Field(None, max_length=500)
    designation: str | None = Field(None, max_length=100)


class AuthorCreate(AuthorBase):
    pass


class AuthorUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    description: str | None = Field(None, max_length=1000)
    email: EmailStr | None = None
    avatar_url: str | None = Field(None, max_length=500)
    designation: str | None = Field(None, max_length=100)


class AuthorResponse(AuthorBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthorSummary(BaseModel):
    id: uuid.UUID
    name: str
    designation: str | None = None
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
