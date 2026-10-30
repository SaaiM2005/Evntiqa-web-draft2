import csv
import io

from httpx import AsyncClient
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_sessionmaker
from app.models import FormSubmission
from tests.conftest import ADMIN_HEADERS, valid_payload


async def count_rows() -> int:
    async with get_sessionmaker()() as session:
        return await session.scalar(select(func.count()).select_from(FormSubmission)) or 0


async def test_create_submission_stores_row(client: AsyncClient) -> None:
    res = await client.post("/api/v1/submissions", json=valid_payload())
    assert res.status_code == 201
    sub_id = res.json()["id"]

    res = await client.get(f"/api/v1/submissions/{sub_id}", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    body = res.json()
    assert body["form_type"] == "expert_consultation"
    assert body["email"] == "elena@company.com"
    assert body["status"] == "new"
    assert body["metadata"] == {"page_url": "https://evntiqa.com/", "utm_source": "linkedin"}
    assert "ip_hash" not in body


async def test_case_study_keeps_title_in_metadata(client: AsyncClient) -> None:
    payload = valid_payload(
        form_type="case_study_request", metadata={"case_study_title": "3x pipeline at FinCo"}
    )
    res = await client.post("/api/v1/submissions", json=payload)
    assert res.status_code == 201
    got = await client.get(f"/api/v1/submissions/{res.json()['id']}", headers=ADMIN_HEADERS)
    assert got.json()["metadata"]["case_study_title"] == "3x pipeline at FinCo"


async def test_optional_fields_can_be_omitted(client: AsyncClient) -> None:
    payload = {
        "form_type": "calendar_request",
        "name": "A",
        "email": "a@b.co",
        "company": "C",
    }
    res = await client.post("/api/v1/submissions", json=payload)
    assert res.status_code == 201


async def test_validation_errors(client: AsyncClient) -> None:
    cases = [
        valid_payload(email="not-an-email"),
        valid_payload(objective="something-else"),
        valid_payload(form_type="unknown"),
        valid_payload(name="   "),
        valid_payload(message="x" * 2001),
        valid_payload(unexpected="field"),
        valid_payload(metadata={"not_allowed": "x"}),
    ]
    for payload in cases:
        res = await client.post("/api/v1/submissions", json=payload)
        assert res.status_code == 422, payload
        assert res.json()["detail"] == "Invalid request"
    assert await count_rows() == 0


async def test_honeypot_returns_success_but_stores_nothing(client: AsyncClient) -> None:
    res = await client.post("/api/v1/submissions", json=valid_payload(website="spam.example"))
    assert res.status_code == 201
    assert res.json()["id"] is None
    assert await count_rows() == 0


async def test_oversized_body_rejected(client: AsyncClient) -> None:
    res = await client.post(
        "/api/v1/submissions",
        content=b'{"x":"' + b"a" * 20_000 + b'"}',
        headers={"content-type": "application/json"},
    )
    assert res.status_code == 413


async def test_admin_routes_require_api_key(client: AsyncClient) -> None:
    for path in ["/api/v1/submissions", "/api/v1/submissions/export.csv"]:
        assert (await client.get(path)).status_code == 401
        assert (await client.get(path, headers={"X-API-Key": "wrong"})).status_code == 401


async def test_list_filters_and_paginates(client: AsyncClient) -> None:
    for _ in range(3):
        await client.post("/api/v1/submissions", json=valid_payload())
    await client.post("/api/v1/submissions", json=valid_payload(form_type="calendar_request"))

    res = await client.get(
        "/api/v1/submissions",
        params={"form_type": "expert_consultation", "page_size": 2},
        headers=ADMIN_HEADERS,
    )
    body = res.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2


async def test_status_update(client: AsyncClient) -> None:
    sub_id = (await client.post("/api/v1/submissions", json=valid_payload())).json()["id"]
    res = await client.patch(
        f"/api/v1/submissions/{sub_id}", json={"status": "contacted"}, headers=ADMIN_HEADERS
    )
    assert res.status_code == 200
    assert res.json()["status"] == "contacted"

    res = await client.get(
        "/api/v1/submissions", params={"status": "contacted"}, headers=ADMIN_HEADERS
    )
    assert res.json()["total"] == 1


async def test_unknown_submission_404(client: AsyncClient) -> None:
    res = await client.get(
        "/api/v1/submissions/00000000-0000-0000-0000-000000000000", headers=ADMIN_HEADERS
    )
    assert res.status_code == 404


async def test_csv_export_escapes_formulas(client: AsyncClient) -> None:
    await client.post("/api/v1/submissions", json=valid_payload(company='=HYPERLINK("x")'))
    res = await client.get("/api/v1/submissions/export.csv", headers=ADMIN_HEADERS)
    assert res.status_code == 200
    rows = list(csv.DictReader(io.StringIO(res.text)))
    assert len(rows) == 1
    assert rows[0]["company"].startswith("'=")
    assert rows[0]["utm_source"] == "linkedin"


async def test_rate_limit(client: AsyncClient) -> None:
    settings = get_settings()
    original = settings.submit_rate_limit
    settings.submit_rate_limit = "2/minute"
    limiter.reset()
    try:
        codes = [
            (await client.post("/api/v1/submissions", json=valid_payload())).status_code
            for _ in range(3)
        ]
    finally:
        settings.submit_rate_limit = original
    assert codes == [201, 201, 429]


async def test_cors_allows_only_configured_origin(client: AsyncClient) -> None:
    preflight = {"Access-Control-Request-Method": "POST"}
    ok = await client.options(
        "/api/v1/submissions", headers={"Origin": "http://localhost:8080", **preflight}
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:8080"
    bad = await client.options(
        "/api/v1/submissions", headers={"Origin": "https://evil.example", **preflight}
    )
    assert "access-control-allow-origin" not in bad.headers


async def test_health(client: AsyncClient) -> None:
    assert (await client.get("/health/live")).status_code == 200
    assert (await client.get("/health/ready")).status_code == 200


async def test_search_matches_name_email_company(client: AsyncClient) -> None:
    await client.post("/api/v1/submissions", json=valid_payload(company="Zeta 100%_Corp"))
    await client.post("/api/v1/submissions", json=valid_payload(name="Other", email="o@x.io"))

    async def hits(q: str) -> int:
        res = await client.get("/api/v1/submissions", params={"q": q}, headers=ADMIN_HEADERS)
        return int(res.json()["total"])

    assert await hits("zeta") == 1
    assert await hits("100%_") == 1
    assert await hits("%") == 1  # wildcard is escaped, matches the literal only
    assert await hits("o@x.io") == 1
    assert await hits("nobody") == 0


async def test_stats(client: AsyncClient) -> None:
    await client.post("/api/v1/submissions", json=valid_payload())
    await client.post("/api/v1/submissions", json=valid_payload(form_type="calendar_request"))
    assert (await client.get("/api/v1/submissions/stats")).status_code == 401

    res = await client.get("/api/v1/submissions/stats", headers=ADMIN_HEADERS)
    body = res.json()
    assert body["total"] == 2
    assert body["by_form_type"] == {
        "expert_consultation": 1,
        "calendar_request": 1,
        "case_study_request": 0,
    }
    assert body["by_status"]["new"] == 2


async def test_admin_page_served_with_csp(client: AsyncClient) -> None:
    res = await client.get("/admin")
    assert res.status_code == 200
    assert "script-src 'self'" in res.headers["content-security-policy"]
    assert (await client.get("/admin/assets/admin.js")).status_code == 200
