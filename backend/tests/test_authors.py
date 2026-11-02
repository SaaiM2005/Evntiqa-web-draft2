import uuid

import pytest
from fastapi import HTTPException
from httpx import AsyncClient

from app.db.session import get_sessionmaker
from app.models.author import Author
from app.models.content import ContentItem, ContentStatus, ContentType
from app.services.author_service import (
    calculate_name_similarity,
    normalize_author_name,
    validate_author_uniqueness,
)
from tests.conftest import ADMIN_HEADERS


def test_normalize_author_name() -> None:
    assert normalize_author_name("Dr. Aris Thorne") == "aris thorne"
    assert normalize_author_name("Prof. Jane Doe") == "jane doe"
    assert normalize_author_name("  Mr.  John   Smith  ") == "john smith"
    assert normalize_author_name("Er. Alex Rivera") == "alex rivera"
    assert normalize_author_name("Marcus Vance, Ph.D.") == "marcus vance phd"
    assert normalize_author_name("") == ""


def test_calculate_name_similarity() -> None:
    # Identical with honorific difference
    assert calculate_name_similarity("Dr. Aris Thorne", "Aris Thorne") == 1.0

    # Token swapped
    assert calculate_name_similarity("Marcus Vance", "Vance Marcus") == 1.0

    # Minor typo (high similarity >= 0.85)
    assert calculate_name_similarity("Marcus Vance", "Marcus Vanc") >= 0.85

    # Completely different names
    assert calculate_name_similarity("Aris Thorne", "Sarah Jenkins") < 0.5


async def test_validate_author_uniqueness_db() -> None:
    async with get_sessionmaker()() as session:
        author = Author(
            id=uuid.uuid4(),
            name="Marcus Vance",
            description="Tech Editor",
            email="marcus@evntiqa.com",
            designation="Principal Analyst",
        )
        session.add(author)
        await session.commit()

        # Duplicate email
        with pytest.raises(HTTPException) as exc_email:
            await validate_author_uniqueness(
                db=session,
                name="Different Name",
                email="Marcus@Evntiqa.com",
            )
        assert exc_email.value.status_code == 409
        assert "already exists" in exc_email.value.detail

        # Exact name (with honorific)
        with pytest.raises(HTTPException) as exc_name:
            await validate_author_uniqueness(
                db=session,
                name="Dr. Marcus Vance",
            )
        assert exc_name.value.status_code == 409

        # Fuzzy similar name (Marcus Vanc)
        with pytest.raises(HTTPException) as exc_fuzzy:
            await validate_author_uniqueness(
                db=session,
                name="Marcus Vanc",
            )
        assert exc_fuzzy.value.status_code == 409
        assert "match" in exc_fuzzy.value.detail


async def test_authors_api_crud_lifecycle(client: AsyncClient) -> None:
    # 1. Unauthorized attempt
    unauth_res = await client.post(
        "/api/v1/admin/authors",
        json={"name": "Evelyn Reed", "description": "Senior Journalist"},
    )
    assert unauth_res.status_code == 401

    # 2. Successful creation
    create_res = await client.post(
        "/api/v1/admin/authors",
        headers=ADMIN_HEADERS,
        json={
            "name": "Evelyn Reed",
            "description": "Senior Journalist & Investigative Reporter",
            "email": "evelyn.reed@evntiqa.com",
            "designation": "Senior Journalist",
        },
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    author_id = created_data["id"]
    assert created_data["name"] == "Evelyn Reed"
    assert created_data["email"] == "evelyn.reed@evntiqa.com"

    # 3. Duplicate rejection on same email
    dup_email_res = await client.post(
        "/api/v1/admin/authors",
        headers=ADMIN_HEADERS,
        json={
            "name": "Another Person",
            "description": "Contributor",
            "email": "Evelyn.Reed@Evntiqa.com",
        },
    )
    assert dup_email_res.status_code == 409

    # 4. Duplicate rejection on fuzzy similar name
    dup_name_res = await client.post(
        "/api/v1/admin/authors",
        headers=ADMIN_HEADERS,
        json={
            "name": "Dr. Evelyn Reed",
            "description": "Contributor",
        },
    )
    assert dup_name_res.status_code == 409

    # 5. List authors paginated
    list_res = await client.get("/api/v1/admin/authors", headers=ADMIN_HEADERS)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    assert any(a["id"] == author_id for a in list_data["items"])

    # 6. List author options
    opts_res = await client.get("/api/v1/admin/authors/options", headers=ADMIN_HEADERS)
    assert opts_res.status_code == 200
    opts_data = opts_res.json()
    assert any(o["id"] == author_id for o in opts_data)

    # 7. Get single author
    get_res = await client.get(f"/api/v1/admin/authors/{author_id}", headers=ADMIN_HEADERS)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Evelyn Reed"

    # 8. Update author
    update_res = await client.put(
        f"/api/v1/admin/authors/{author_id}",
        headers=ADMIN_HEADERS,
        json={
            "designation": "Lead Investigative Journalist",
        },
    )
    assert update_res.status_code == 200
    assert update_res.json()["designation"] == "Lead Investigative Journalist"

    # 9. Delete author
    del_res = await client.delete(f"/api/v1/admin/authors/{author_id}", headers=ADMIN_HEADERS)
    assert del_res.status_code == 204

    # 10. Verify deleted
    verify_res = await client.get(f"/api/v1/admin/authors/{author_id}", headers=ADMIN_HEADERS)
    assert verify_res.status_code == 404


async def test_author_deletion_blocked_if_used_in_news(client: AsyncClient) -> None:
    # 1. Create author
    create_res = await client.post(
        "/api/v1/admin/authors",
        headers=ADMIN_HEADERS,
        json={
            "name": "David Sterling",
            "description": "Cybersecurity Editor",
            "email": "david.sterling@evntiqa.com",
            "designation": "Editor-in-Chief",
        },
    )
    assert create_res.status_code == 201
    author_id = uuid.UUID(create_res.json()["id"])

    # 2. Attach to a NEWS ContentItem
    async with get_sessionmaker()() as session:
        news_item = ContentItem(
            id=uuid.uuid4(),
            title="Breaking: Cyber Incident Reported",
            slug="breaking-cyber-incident-reported",
            type=ContentType.NEWS,
            status=ContentStatus.PUBLISHED,
            brief="Emergency report on cyber incident.",
            content="Emergency report details and analysis.",
            author_id=author_id,
        )
        session.add(news_item)
        await session.commit()

    # 3. Attempting to delete author should be blocked with 409
    del_res = await client.delete(f"/api/v1/admin/authors/{author_id}", headers=ADMIN_HEADERS)
    assert del_res.status_code == 409
    assert "credited on 1 NEWS item(s)" in del_res.json()["detail"]
