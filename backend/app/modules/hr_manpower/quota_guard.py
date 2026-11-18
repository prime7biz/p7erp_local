"""Over-quota hire / reassign / activate guard (Phase 2).

Call ``assert_within_manpower_quota`` before writing the employee, then
``consume_exception_slot`` in the same transaction after the employee row has an id.
Admin / manager / ``*`` cannot bypass the quota; only an approved exception with
remaining slots can allow a hire into a full cell.

Denial paths avoid ``FOR UPDATE`` so a 409 does not leave the shared test/savepoint
session holding row locks. Allow paths lock the cell and re-check before consuming.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_manpower_quota_enforcement_v1_enabled
from app.models.hr import Employee
from app.models.hr_manpower import (
    HrManpowerQuotaException,
    HrManpowerQuotaExceptionConsumption,
    HrManpowerSanctionedStrength,
    HrManpowerSettings,
)
from app.models.tenant import Tenant


@dataclass(frozen=True)
class QuotaCheckResult:
    """``exception_id`` is set when the hire must consume an approved exception slot."""

    exception_id: int | None
    approved_quota: int
    present: int
    remaining_exception_slots: int


def _quota_detail(code: str, **extra: object) -> dict:
    return {"code": code, **extra}


async def _settings_allow_unmapped(db: AsyncSession, tenant_id: int) -> bool:
    row = (
        await db.execute(select(HrManpowerSettings).where(HrManpowerSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    return bool(row and row.allow_unmapped_hire)


async def _current_sanctioned(
    db: AsyncSession,
    tenant_id: int,
    department_id: int,
    designation_id: int,
    *,
    on: date,
    for_update: bool,
) -> HrManpowerSanctionedStrength | None:
    q = (
        select(HrManpowerSanctionedStrength)
        .where(
            HrManpowerSanctionedStrength.tenant_id == tenant_id,
            HrManpowerSanctionedStrength.department_id == department_id,
            HrManpowerSanctionedStrength.designation_id == designation_id,
            HrManpowerSanctionedStrength.effective_from <= on,
            or_(
                HrManpowerSanctionedStrength.effective_to.is_(None),
                HrManpowerSanctionedStrength.effective_to >= on,
            ),
        )
        .order_by(HrManpowerSanctionedStrength.effective_from.desc())
        .limit(1)
    )
    if for_update:
        q = q.with_for_update()
    return (await db.execute(q)).scalar_one_or_none()


async def _present_in_cell(
    db: AsyncSession,
    tenant_id: int,
    department_id: int,
    designation_id: int,
    *,
    exclude_employee_id: int | None,
) -> int:
    q = select(func.count()).select_from(Employee).where(
        Employee.tenant_id == tenant_id,
        Employee.is_active.is_(True),
        Employee.department_id == department_id,
        Employee.designation_id == designation_id,
    )
    if exclude_employee_id is not None:
        q = q.where(Employee.id != exclude_employee_id)
    return int((await db.execute(q)).scalar_one())


async def _active_consumptions_for_exception(
    db: AsyncSession, exc: HrManpowerQuotaException
) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(HrManpowerQuotaExceptionConsumption)
                .join(Employee, Employee.id == HrManpowerQuotaExceptionConsumption.employee_id)
                .where(
                    HrManpowerQuotaExceptionConsumption.exception_id == exc.id,
                    HrManpowerQuotaExceptionConsumption.tenant_id == exc.tenant_id,
                    Employee.is_active.is_(True),
                    Employee.department_id == exc.department_id,
                    Employee.designation_id == exc.designation_id,
                )
            )
        ).scalar_one()
    )


async def _approved_exceptions(
    db: AsyncSession,
    tenant_id: int,
    department_id: int,
    designation_id: int,
    *,
    on: date,
    for_update: bool,
) -> list[HrManpowerQuotaException]:
    q = (
        select(HrManpowerQuotaException)
        .where(
            HrManpowerQuotaException.tenant_id == tenant_id,
            HrManpowerQuotaException.department_id == department_id,
            HrManpowerQuotaException.designation_id == designation_id,
            HrManpowerQuotaException.status == "APPROVED",
            or_(
                HrManpowerQuotaException.expires_on.is_(None),
                HrManpowerQuotaException.expires_on >= on,
            ),
        )
        .order_by(HrManpowerQuotaException.id.asc())
    )
    if for_update:
        q = q.with_for_update()
    return list((await db.execute(q)).scalars().all())


async def _slot_pool(
    db: AsyncSession, exceptions: list[HrManpowerQuotaException]
) -> tuple[list[tuple[HrManpowerQuotaException, int]], int]:
    pool: list[tuple[HrManpowerQuotaException, int]] = []
    total = 0
    for exc in exceptions:
        used = await _active_consumptions_for_exception(db, exc)
        rem = max(0, int(exc.extra_slots) - used)
        if rem > 0:
            pool.append((exc, rem))
            total += rem
    return pool, total


async def assert_within_manpower_quota(
    db: AsyncSession,
    tenant: Tenant,
    *,
    department_id: int | None,
    designation_id: int | None,
    exclude_employee_id: int | None = None,
    as_of: date | None = None,
) -> QuotaCheckResult | None:
    """Return a check result when enforcement is on; ``None`` when the flag is off (no-op)."""
    if not is_manpower_quota_enforcement_v1_enabled(tenant.feature_flags):
        return None

    on = as_of or date.today()
    if department_id is None or designation_id is None:
        if await _settings_allow_unmapped(db, tenant.id):
            return QuotaCheckResult(
                exception_id=None, approved_quota=0, present=0, remaining_exception_slots=0
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_quota_detail(
                "MANPOWER_QUOTA_UNDEFINED",
                message="Department and designation are required while manpower quota enforcement is on.",
            ),
        )

    # Unlocked pre-check so denials never hold row locks (savepoint-friendly).
    sanctioned = await _current_sanctioned(
        db, tenant.id, department_id, designation_id, on=on, for_update=False
    )
    if sanctioned is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_quota_detail(
                "MANPOWER_QUOTA_UNDEFINED",
                message="No sanctioned strength for this department and designation. Seed or set a quota first.",
                department_id=department_id,
                designation_id=designation_id,
            ),
        )

    present = await _present_in_cell(
        db, tenant.id, department_id, designation_id, exclude_employee_id=exclude_employee_id
    )
    exceptions = await _approved_exceptions(
        db, tenant.id, department_id, designation_id, on=on, for_update=False
    )
    pool, total_remaining = await _slot_pool(db, exceptions)
    quota = int(sanctioned.approved_quota)
    if present + 1 > quota + total_remaining:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_quota_detail(
                "MANPOWER_QUOTA_EXCEEDED",
                message="This hire would exceed the sanctioned manpower quota.",
                department_id=department_id,
                designation_id=designation_id,
                approved_quota=quota,
                present=present,
                remaining_exception_slots=total_remaining,
            ),
        )

    # Allow path: lock cell + exceptions (id order) and re-check against races.
    sanctioned = await _current_sanctioned(
        db, tenant.id, department_id, designation_id, on=on, for_update=True
    )
    if sanctioned is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_quota_detail(
                "MANPOWER_QUOTA_UNDEFINED",
                message="No sanctioned strength for this department and designation. Seed or set a quota first.",
                department_id=department_id,
                designation_id=designation_id,
            ),
        )
    exceptions = await _approved_exceptions(
        db, tenant.id, department_id, designation_id, on=on, for_update=True
    )
    present = await _present_in_cell(
        db, tenant.id, department_id, designation_id, exclude_employee_id=exclude_employee_id
    )
    pool, total_remaining = await _slot_pool(db, exceptions)
    quota = int(sanctioned.approved_quota)
    if present + 1 <= quota:
        return QuotaCheckResult(
            exception_id=None,
            approved_quota=quota,
            present=present,
            remaining_exception_slots=total_remaining,
        )
    if present + 1 <= quota + total_remaining and pool:
        return QuotaCheckResult(
            exception_id=pool[0][0].id,
            approved_quota=quota,
            present=present,
            remaining_exception_slots=total_remaining,
        )
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=_quota_detail(
            "MANPOWER_QUOTA_EXCEEDED",
            message="This hire would exceed the sanctioned manpower quota.",
            department_id=department_id,
            designation_id=designation_id,
            approved_quota=quota,
            present=present,
            remaining_exception_slots=total_remaining,
        ),
    )


async def consume_exception_slot(
    db: AsyncSession,
    *,
    tenant_id: int,
    exception_id: int,
    employee_id: int,
    user_id: int | None,
) -> None:
    """Link (or rebind) this employee to the exception used for their current cell.

    Unique on ``(tenant_id, employee_id)``: a cross-cell reassign that needs a different
    approved exception updates the existing row so the old cell's slot frees correctly.
    """
    existing = (
        await db.execute(
            select(HrManpowerQuotaExceptionConsumption).where(
                HrManpowerQuotaExceptionConsumption.tenant_id == tenant_id,
                HrManpowerQuotaExceptionConsumption.employee_id == employee_id,
            )
        )
    ).scalar_one_or_none()
    now = datetime.utcnow()
    if existing is not None:
        if int(existing.exception_id) == int(exception_id):
            return
        existing.exception_id = exception_id
        existing.consumed_at = now
        existing.consumed_by_user_id = user_id
        await db.flush()
        return
    db.add(
        HrManpowerQuotaExceptionConsumption(
            tenant_id=tenant_id,
            exception_id=exception_id,
            employee_id=employee_id,
            consumed_at=now,
            consumed_by_user_id=user_id,
        )
    )
    await db.flush()


async def guard_and_prepare(
    db: AsyncSession,
    tenant: Tenant,
    *,
    department_id: int | None,
    designation_id: int | None,
    exclude_employee_id: int | None = None,
) -> int | None:
    result = await assert_within_manpower_quota(
        db,
        tenant,
        department_id=department_id,
        designation_id=designation_id,
        exclude_employee_id=exclude_employee_id,
    )
    if result is None:
        return None
    return result.exception_id
