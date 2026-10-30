import uuid
from collections.abc import AsyncIterator
from datetime import datetime

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FormSubmission, FormType, SubmissionStatus
from app.schemas.submission import SubmissionCreate


class SubmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self, data: SubmissionCreate, *, ip_hash: str | None, user_agent: str | None
    ) -> FormSubmission:
        row = FormSubmission(
            form_type=data.form_type,
            name=data.name,
            email=str(data.email),
            company=data.company,
            job_title=data.job_title or None,
            objective=data.objective,
            message=data.message or None,
            meta=data.metadata.model_dump(exclude_none=True),
            ip_hash=ip_hash,
            user_agent=user_agent[:300] if user_agent else None,
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def get(self, submission_id: uuid.UUID) -> FormSubmission | None:
        return await self.session.get(FormSubmission, submission_id)

    @staticmethod
    def _filtered(
        form_type: FormType | None,
        status: SubmissionStatus | None,
        date_from: datetime | None,
        date_to: datetime | None,
        q: str | None = None,
    ) -> Select[tuple[FormSubmission]]:
        stmt = select(FormSubmission)
        if form_type:
            stmt = stmt.where(FormSubmission.form_type == form_type)
        if status:
            stmt = stmt.where(FormSubmission.status == status)
        if date_from:
            stmt = stmt.where(FormSubmission.created_at >= date_from)
        if date_to:
            stmt = stmt.where(FormSubmission.created_at < date_to)
        if q:
            escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            stmt = stmt.where(
                or_(
                    FormSubmission.name.ilike(pattern, escape="\\"),
                    FormSubmission.email.ilike(pattern, escape="\\"),
                    FormSubmission.company.ilike(pattern, escape="\\"),
                )
            )
        return stmt

    async def counts(self) -> list[tuple[FormType, SubmissionStatus, int]]:
        rows = await self.session.execute(
            select(FormSubmission.form_type, FormSubmission.status, func.count()).group_by(
                FormSubmission.form_type, FormSubmission.status
            )
        )
        return [(f, s, n) for f, s, n in rows.tuples()]

    async def list(
        self,
        *,
        form_type: FormType | None,
        status: SubmissionStatus | None,
        date_from: datetime | None,
        date_to: datetime | None,
        page: int,
        page_size: int,
        q: str | None = None,
    ) -> tuple[list[FormSubmission], int]:
        stmt = self._filtered(form_type, status, date_from, date_to, q)
        total = await self.session.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = await self.session.scalars(
            stmt.order_by(FormSubmission.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(rows), total or 0

    async def stream(
        self,
        *,
        form_type: FormType | None,
        status: SubmissionStatus | None,
        date_from: datetime | None,
        date_to: datetime | None,
        q: str | None = None,
    ) -> AsyncIterator[FormSubmission]:
        stmt = self._filtered(form_type, status, date_from, date_to, q).order_by(
            FormSubmission.created_at.desc()
        )
        result = await self.session.stream_scalars(stmt.execution_options(yield_per=500))
        async for row in result:
            yield row

    async def set_status(self, row: FormSubmission, status: SubmissionStatus) -> FormSubmission:
        row.status = status
        await self.session.commit()
        await self.session.refresh(row)
        return row
