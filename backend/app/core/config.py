from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, PostgresDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    # Empty values (e.g. `ADMIN_API_KEY=` from .env.example) count as unset.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", env_ignore_empty=True)

    env: Literal["dev", "test", "prod"] = "dev"
    database_url: PostgresDsn
    # Optional: lets scripts (e.g. curl CSV export) call admin routes without a portal login.
    admin_api_key: SecretStr | None = Field(default=None, min_length=32)
    ip_hash_salt: SecretStr = Field(min_length=16)
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:8080"]
    submit_rate_limit: str = "5/minute"
    login_rate_limit: str = "5/minute"
    session_ttl_hours: int = 12
    max_body_bytes: int = 16_384

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"


@lru_cache
def get_settings() -> Settings:
    return Settings()
