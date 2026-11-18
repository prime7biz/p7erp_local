"""Sanctioned manpower strength: CRUD, standing counts, seed-from-current."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models.hr import Department, Designation, Employee
from app.models.hr_manpower import (
    DEPARTMENT_GROUP_KEYS,
    HrManpowerDepartmentGroup,
    HrManpowerSanctionedStrength,
    HrManpowerSettings,
)
from app.modules.audit.service import log_action
from app.modules.hr_manpower.schemas import (
    DepartmentGroupOut,
    DepartmentGroupUpsert,
    ManpowerSettingsOut,
    ManpowerSettingsUpdate,
    ManpowerTargetsIn,
    SanctionedRowOut,
    SanctionedUpsert,
    SeedFromCurrentOut,
    StandingSummaryOut,
)

_TARGET_KEYS = (
    "operator_to_helper",
    "sewing_cutting_finishing",
    "staff_to_workers",
    "management_staff_workers",
    "running_machines_per_operator",
)


def _ranges_overlap(a_from: date, a_to: date | None, b_from: date, b_to: date | None) -> bool:
    a_end = a_to or date.max
    b_end = b_to or date.max
    return a_from <= b_end and b_from <= a_end


async def _present_counts(
    db: AsyncSession, tenant_id: int, cells: list[tuple[int, int]]
) -> dict[tuple[int, int], int]:
    if not cells:
        return {}
    dept_ids = {d for d, _ in cells}
    desig_ids = {g for _, g in cells}
    rows = (
        await db.execute(
            select(Employee.department_id, Employee.designation_id, func.count())
            .where(
                Employee.tenant_id == tenant_id,
                Employee.is_active.is_(True),
                Employee.department_id.in_(dept_ids),
                Employee.designation_id.in_(desig_ids),
            )
            .group_by(Employee.department_id, Employee.designation_id)
        )
    ).all()
    wanted = set(cells)
    return {(int(d), int(g)): int(c) for d, g, c in rows if (int(d), int(g)) in wanted}


async def _names(
    db: AsyncSession, tenant_id: int, dept_ids: set[int], desig_ids: set[int]
) -> tuple[dict[int, str], dict[int, str]]:
    dept_map: dict[int, str] = {}
    desig_map: dict[int, str] = {}
    if dept_ids:
        for row in (
            await db.execute(
                select(Department.id, Department.name).where(
                    Department.tenant_id == tenant_id, Department.id.in_(dept_ids)
                )
            )
        ).all():
            dept_map[int(row[0])] = row[1]
    if desig_ids:
        for row in (
            await db.execute(
                select(Designation.id, Designation.title).where(
                    Designation.tenant_id == tenant_id, Designation.id.in_(desig_ids)
                )
            )
        ).all():
            desig_map[int(row[0])] = row[1]
    return dept_map, desig_map


def _row_out(
    row: HrManpowerSanctionedStrength,
    present: int,
    dept_name: str | None,
    desig_title: str | None,
) -> SanctionedRowOut:
    return SanctionedRowOut(
        id=row.id,
        department_id=row.department_id,
        designation_id=row.designation_id,
        department_name=dept_name,
        designation_title=desig_title,
        approved_quota=row.approved_quota,
        present_active=present,
        variance=present - row.approved_quota,
        effective_from=row.effective_from,
        effective_to=row.effective_to,
        notes=row.notes,
        updated_at=row.updated_at,
    )


async def list_sanctioned(
    db: AsyncSession,
    tenant_id: int,
    *,
    department_id: int | None = None,
    designation_id: int | None = None,
    as_of: date | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[SanctionedRowOut]:
    on = as_of or date.today()
    q = select(HrManpowerSanctionedStrength).where(HrManpowerSanctionedStrength.tenant_id == tenant_id)
    if department_id is not None:
        q = q.where(HrManpowerSanctionedStrength.department_id == department_id)
    if designation_id is not None:
        q = q.where(HrManpowerSanctionedStrength.designation_id == designation_id)
    q = (
        q.where(HrManpowerSanctionedStrength.effective_from <= on)
        .where(
            or_(
                HrManpowerSanctionedStrength.effective_to.is_(None),
                HrManpowerSanctionedStrength.effective_to >= on,
            )
        )
        .order_by(
            HrManpowerSanctionedStrength.department_id,
            HrManpowerSanctionedStrength.designation_id,
            HrManpowerSanctionedStrength.effective_from.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    rows = list((await db.execute(q)).scalars().all())
    # One current row per cell (latest effective_from already ordered desc).
    seen: set[tuple[int, int]] = set()
    current: list[HrManpowerSanctionedStrength] = []
    for row in rows:
        key = (row.department_id, row.designation_id)
        if key in seen:
            continue
        seen.add(key)
        current.append(row)

    presents = await _present_counts(db, tenant_id, [(r.department_id, r.designation_id) for r in current])
    dept_map, desig_map = await _names(
        db,
        tenant_id,
        {r.department_id for r in current},
        {r.designation_id for r in current},
    )
    return [
        _row_out(
            r,
            presents.get((r.department_id, r.designation_id), 0),
            dept_map.get(r.department_id),
            desig_map.get(r.designation_id),
        )
        for r in current
    ]


async def standing_summary(
    db: AsyncSession, tenant_id: int, *, as_of: date | None = None
) -> StandingSummaryOut:
    rows = await list_sanctioned(db, tenant_id, as_of=as_of, limit=500, offset=0)
    total_quota = sum(r.approved_quota for r in rows)
    total_present = sum(r.present_active for r in rows)
    over = sum(1 for r in rows if r.variance > 0)
    under = sum(1 for r in rows if r.variance < 0)
    exact = sum(1 for r in rows if r.variance == 0)
    return StandingSummaryOut(
        rows=rows,
        total_quota=total_quota,
        total_present=total_present,
        cells_over=over,
        cells_under=under,
        cells_exact=exact,
    )


async def upsert_sanctioned(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    body: SanctionedUpsert,
) -> SanctionedRowOut:
    dept = await ensure_owned(db, Department, body.department_id, tenant_id, "Department")
    desig = await ensure_owned(db, Designation, body.designation_id, tenant_id, "Designation")
    assert dept is not None and desig is not None

    if desig.department_id is not None and desig.department_id != body.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Designation belongs to a different department",
        )
    if body.effective_to is not None and body.effective_to < body.effective_from:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="effective_to must be on or after effective_from",
        )

    existing = list(
        (
            await db.execute(
                select(HrManpowerSanctionedStrength).where(
                    HrManpowerSanctionedStrength.tenant_id == tenant_id,
                    HrManpowerSanctionedStrength.department_id == body.department_id,
                    HrManpowerSanctionedStrength.designation_id == body.designation_id,
                )
            )
        ).scalars().all()
    )

    same_from = next((r for r in existing if r.effective_from == body.effective_from), None)
    for other in existing:
        if same_from is not None and other.id == same_from.id:
            continue
        if _ranges_overlap(body.effective_from, body.effective_to, other.effective_from, other.effective_to):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Overlaps existing quota row id={other.id} "
                    f"({other.effective_from}–{other.effective_to or 'open'})"
                ),
            )

    now = datetime.utcnow()
    if same_from is not None:
        same_from.approved_quota = body.approved_quota
        same_from.effective_to = body.effective_to
        same_from.notes = body.notes
        same_from.updated_by_user_id = user_id
        same_from.updated_at = now
        row = same_from
        action = "HR_MANPOWER_SANCTIONED_UPDATED"
    else:
        row = HrManpowerSanctionedStrength(
            tenant_id=tenant_id,
            department_id=body.department_id,
            designation_id=body.designation_id,
            approved_quota=body.approved_quota,
            effective_from=body.effective_from,
            effective_to=body.effective_to,
            notes=body.notes,
            created_by_user_id=user_id,
            updated_by_user_id=user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        action = "HR_MANPOWER_SANCTIONED_CREATED"

    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        action=action,
        user_id=user_id,
        resource=f"hr_manpower_sanctioned:{row.id}",
        details=f"dept={body.department_id} desig={body.designation_id} quota={body.approved_quota}",
    )
    await db.commit()
    await db.refresh(row)

    present = (
        await _present_counts(db, tenant_id, [(row.department_id, row.designation_id)])
    ).get((row.department_id, row.designation_id), 0)
    dept_map, desig_map = await _names(db, tenant_id, {row.department_id}, {row.designation_id})
    return _row_out(row, present, dept_map.get(row.department_id), desig_map.get(row.designation_id))


async def seed_from_current(
    db: AsyncSession, tenant_id: int, user_id: int, *, as_of: date | None = None
) -> SeedFromCurrentOut:
    """Create quota rows equal to today's active headcount for cells that have none yet."""
    on = as_of or date.today()
    cells = (
        await db.execute(
            select(Employee.department_id, Employee.designation_id, func.count())
            .where(
                Employee.tenant_id == tenant_id,
                Employee.is_active.is_(True),
                Employee.department_id.is_not(None),
                Employee.designation_id.is_not(None),
            )
            .group_by(Employee.department_id, Employee.designation_id)
        )
    ).all()

    existing = await list_sanctioned(db, tenant_id, as_of=on, limit=2000, offset=0)
    have = {(r.department_id, r.designation_id) for r in existing}

    created = 0
    skipped = 0
    now = datetime.utcnow()
    for dept_id, desig_id, count in cells:
        key = (int(dept_id), int(desig_id))
        if key in have:
            skipped += 1
            continue
        db.add(
            HrManpowerSanctionedStrength(
                tenant_id=tenant_id,
                department_id=key[0],
                designation_id=key[1],
                approved_quota=int(count),
                effective_from=on,
                effective_to=None,
                notes="Seeded from current active headcount",
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
                created_at=now,
                updated_at=now,
            )
        )
        created += 1

    if created:
        await log_action(
            db,
            tenant_id=tenant_id,
            action="HR_MANPOWER_SANCTIONED_SEEDED",
            user_id=user_id,
            resource="hr_manpower_sanctioned",
            details=f"created={created} skipped={skipped} cells={len(cells)}",
        )
    await db.commit()
    return SeedFromCurrentOut(created=created, skipped_existing=skipped, cells_seen=len(cells))


async def get_settings(db: AsyncSession, tenant_id: int) -> ManpowerSettingsOut:
    row = (
        await db.execute(select(HrManpowerSettings).where(HrManpowerSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if row is None:
        return ManpowerSettingsOut(targets={}, allow_unmapped_hire=False, updated_at=None)
    targets = row.targets if isinstance(row.targets, dict) else {}
    return ManpowerSettingsOut(
        targets={k: targets.get(k) for k in _TARGET_KEYS},
        allow_unmapped_hire=bool(row.allow_unmapped_hire),
        updated_at=row.updated_at,
    )


async def put_settings(
    db: AsyncSession, tenant_id: int, user_id: int, body: ManpowerSettingsUpdate
) -> ManpowerSettingsOut:
    row = (
        await db.execute(select(HrManpowerSettings).where(HrManpowerSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    now = datetime.utcnow()
    if row is None:
        row = HrManpowerSettings(
            tenant_id=tenant_id,
            targets={},
            allow_unmapped_hire=False,
            created_at=now,
            updated_at=now,
        )
        db.add(row)

    if body.targets is not None:
        payload = body.targets.model_dump() if isinstance(body.targets, ManpowerTargetsIn) else dict(body.targets)
        cleaned = {k: payload.get(k) for k in _TARGET_KEYS}
        row.targets = cleaned
    if body.allow_unmapped_hire is not None:
        row.allow_unmapped_hire = bool(body.allow_unmapped_hire)
    row.updated_by_user_id = user_id
    row.updated_at = now
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        action="HR_MANPOWER_SETTINGS_UPDATED",
        user_id=user_id,
        resource="hr_manpower_settings",
        details=None,
    )
    await db.commit()
    await db.refresh(row)
    return await get_settings(db, tenant_id)


async def list_department_groups(db: AsyncSession, tenant_id: int) -> list[DepartmentGroupOut]:
    rows = list(
        (
            await db.execute(
                select(HrManpowerDepartmentGroup)
                .where(HrManpowerDepartmentGroup.tenant_id == tenant_id)
                .order_by(HrManpowerDepartmentGroup.department_id)
            )
        ).scalars().all()
    )
    dept_map, _ = await _names(db, tenant_id, {r.department_id for r in rows}, set())
    return [
        DepartmentGroupOut(
            id=r.id,
            department_id=r.department_id,
            department_name=dept_map.get(r.department_id),
            group_key=r.group_key,  # type: ignore[arg-type]
        )
        for r in rows
    ]


async def upsert_department_group(
    db: AsyncSession, tenant_id: int, user_id: int, body: DepartmentGroupUpsert
) -> DepartmentGroupOut:
    if body.group_key not in DEPARTMENT_GROUP_KEYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid group_key")
    await ensure_owned(db, Department, body.department_id, tenant_id, "Department")
    row = (
        await db.execute(
            select(HrManpowerDepartmentGroup).where(
                HrManpowerDepartmentGroup.tenant_id == tenant_id,
                HrManpowerDepartmentGroup.department_id == body.department_id,
            )
        )
    ).scalar_one_or_none()
    now = datetime.utcnow()
    if row is None:
        row = HrManpowerDepartmentGroup(
            tenant_id=tenant_id,
            department_id=body.department_id,
            group_key=body.group_key,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row.group_key = body.group_key
        row.updated_at = now
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        action="HR_MANPOWER_DEPT_GROUP_UPSERT",
        user_id=user_id,
        resource=f"hr_manpower_department_groups:{row.id}",
        details=f"dept={body.department_id} group={body.group_key}",
    )
    await db.commit()
    await db.refresh(row)
    dept_map, _ = await _names(db, tenant_id, {row.department_id}, set())
    return DepartmentGroupOut(
        id=row.id,
        department_id=row.department_id,
        department_name=dept_map.get(row.department_id),
        group_key=row.group_key,  # type: ignore[arg-type]
    )
