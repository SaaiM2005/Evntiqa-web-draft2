import os
from collections.abc import AsyncIterator

# Settings are read at import time, so the test env must be in place first.
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/evntiqa_test")
os.environ["ENV"] = "test"
os.environ["ADMIN_API_KEY"] = "test-admin-key-" + "x" * 32
os.environ["IP_HASH_SALT"] = "test-salt-0123456789"
os.environ["SUBMIT_RATE_LIMIT"] = "1000/minute"
os.environ["LOGIN_RATE_LIMIT"] = "1000/minute"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.rate_limit import limiter  # noqa: E402
from app.db.session import get_engine  # noqa: E402
from app.main import app  # noqa: E402

ADMIN_HEADERS = {"X-API-Key": os.environ["ADMIN_API_KEY"]}


@pytest.fixture(scope="session", autouse=True)
def migrate() -> None:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
async def clean_db() -> AsyncIterator[None]:
    yield
    async with get_engine().begin() as conn:
        await conn.execute(text("TRUNCATE form_submissions, admin_sessions, admin_users"))
    limiter.reset()


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def valid_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "form_type": "expert_consultation",
        "name": "Elena Vance",
        "email": "elena@company.com",
        "company": "Acme Security",
        "job_title": "VP Demand Gen",
        "objective": "roundtables",
        "message": "FinServ, Q1 timeline",
        "metadata": {"page_url": "https://evntiqa.com/", "utm_source": "linkedin"},
    }
    payload.update(overrides)
    return payload
