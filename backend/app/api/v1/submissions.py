import csv
import io
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.rate_limit import limiter
from app.core.security import client_ip, hash_ip, require_admin
from app.db.session import get_session, get_sessionmaker
from app.models import FormSubmission, FormType, SubmissionStatus
from app.repositories.submission import SubmissionRepository
from app.schemas.submission import (
    SubmissionCreate,
    SubmissionCreated,
    SubmissionPage,
    SubmissionRead,
    SubmissionStats,
    SubmissionStatusUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/submissions", tags=["submissions"])
admin = [Depends(require_admin)]

SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _rate_limit() -> str:
    return get_settings().submit_rate_limit


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SubmissionCreated)
@limiter.limit(_rate_limit)
async def create_submission(
    request: Request,
    payload: SubmissionCreate,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> SubmissionCreated:
    if payload.website:
        # Honeypot tripped: answer like a success so the bot learns nothing, store nothing.
        logger.info("honeypot submission dropped form_type=%s", payload.form_type.value)
        return SubmissionCreated(id=None)

    row = await SubmissionRepository(session).create(
        payload,
        ip_hash=hash_ip(client_ip(request), settings.ip_hash_salt.get_secret_value()),
        user_agent=request.headers.get("user-agent"),
    )
    logger.info("submission stored id=%s form_type=%s", row.id, row.form_type.value)
    return SubmissionCreated(id=row.id)


@router.get("", response_model=SubmissionPage, dependencies=admin)
async def list_submissions(
    session: SessionDep,
    form_type: FormType | None = None,
    status_: Annotated[SubmissionStatus | None, Query(alias="status")] = None,
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> SubmissionPage:
    rows, total = await SubmissionRepository(session).list(
        form_type=form_type,
        status=status_,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        q=q,
    )
    return SubmissionPage(
        items=[SubmissionRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/stats", response_model=SubmissionStats, dependencies=admin)
async def submission_stats(session: SessionDep) -> SubmissionStats:
    stats = SubmissionStats(
        total=0,
        by_form_type={f: 0 for f in FormType},
        by_status={s: 0 for s in SubmissionStatus},
    )
    for form_type, status_, n in await SubmissionRepository(session).counts():
        stats.total += n
        stats.by_form_type[form_type] += n
        stats.by_status[status_] += n
    return stats


CSV_COLUMNS = [
    "id", "created_at", "form_type", "status", "name", "email", "company",
    "job_title", "objective", "message", "case_study_title", "page_url",
    "utm_source", "utm_medium", "utm_campaign",
]  # fmt: skip


def _csv_safe(value: object) -> str:
    """Neutralise spreadsheet formula injection (cells opened in Excel/Sheets)."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def _csv_row(row: FormSubmission) -> list[str]:
    meta = row.meta or {}
    values: list[object] = [
        row.id, row.created_at.isoformat(), row.form_type.value, row.status.value,
        row.name, row.email, row.company, row.job_title, row.objective, row.message,
        meta.get("case_study_title"), meta.get("page_url"),
        meta.get("utm_source"), meta.get("utm_medium"), meta.get("utm_campaign"),
    ]  # fmt: skip
    return [_csv_safe(v) for v in values]


@router.get("/export.csv", dependencies=admin)
async def export_submissions(
    form_type: FormType | None = None,
    status_: Annotated[SubmissionStatus | None, Query(alias="status")] = None,
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
) -> StreamingResponse:
    async def rows() -> AsyncIterator[str]:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(CSV_COLUMNS)
        # The generator owns its session so it stays open for the whole stream.
        async with get_sessionmaker()() as session:
            repo = SubmissionRepository(session)
            async for row in repo.stream(
                form_type=form_type, status=status_, date_from=date_from, date_to=date_to, q=q
            ):
                writer.writerow(_csv_row(row))
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate()
        yield buf.getvalue()

    return StreamingResponse(
        rows(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="submissions.csv"'},
    )


async def _get_or_404(session: AsyncSession, submission_id: uuid.UUID) -> FormSubmission:
    row = await SubmissionRepository(session).get(submission_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Submission not found")
    return row


@router.get("/{submission_id}", response_model=SubmissionRead, dependencies=admin)
async def get_submission(submission_id: uuid.UUID, session: SessionDep) -> SubmissionRead:
    return SubmissionRead.model_validate(await _get_or_404(session, submission_id))


@router.patch("/{submission_id}", response_model=SubmissionRead, dependencies=admin)
async def update_submission_status(
    submission_id: uuid.UUID, body: SubmissionStatusUpdate, session: SessionDep
) -> SubmissionRead:
    row = await _get_or_404(session, submission_id)
    row = await SubmissionRepository(session).set_status(row, body.status)
    return SubmissionRead.model_validate(row)
