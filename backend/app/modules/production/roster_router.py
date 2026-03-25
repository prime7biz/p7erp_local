"""Weekly crew roster, line crew sheet workflow, daily generation."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AttendanceEntry,
    CrewRosterWeekly,
    Employee,
    IeOperationsLibrary,
    LineCrewDaily,
    LineCrewSheetHeader,
    ProductionCrewRole,
    ProductionShift,
    SewingLine,
    Tenant,
    User,
    WorkerSkill,
)
from app.modules.production.schemas import (
    CrewGenerateDailyRequest,
    CrewRosterCellResponse,
    CrewRosterCellUpsert,
    LineCrewSheetStatusResponse,
    LineCrewSheetStatusUpdate,
)

router = APIRouter(prefix="/production", tags=["production-roster"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/roster-weekly", response_model=list[CrewRosterCellResponse])
async def list_roster_weekly(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    week_start_date: str = Query(...),
    sewing_line_id: int | None = Query(None),
    shift_id: int | None = Query(None),
):
    _ensure(user, tenant)
    ws = date.fromisoformat(week_start_date)
    q = (
        select(CrewRosterWeekly, ProductionCrewRole)
        .join(ProductionCrewRole, ProductionCrewRole.id == CrewRosterWeekly.crew_role_id)
        .where(CrewRosterWeekly.tenant_id == tenant.id, CrewRosterWeekly.week_start_date == ws)
    )
    if sewing_line_id is not None:
        q = q.where(CrewRosterWeekly.sewing_line_id == sewing_line_id)
    if shift_id is not None:
        q = q.where(CrewRosterWeekly.shift_id == shift_id)
    rows = list((await db.execute(q)).all())
    return [
        CrewRosterCellResponse(
            id=r.id,
            week_start_date=r.week_start_date.isoformat(),
            sewing_line_id=r.sewing_line_id,
            shift_id=r.shift_id,
            crew_role_id=r.crew_role_id,
            role_name=role.role_name,
            day_of_week=r.day_of_week,
            employee_id=r.employee_id,
            planned_count=r.planned_count,
            notes=r.notes,
        )
        for r, role in rows
    ]


@router.put("/roster-weekly/cell", response_model=CrewRosterCellResponse)
async def upsert_roster_cell(
    body: CrewRosterCellUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    if body.day_of_week < 0 or body.day_of_week > 6:
        raise HTTPException(400, "day_of_week must be 0-6")
    line = await db.get(SewingLine, body.sewing_line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(404, "Line not found")
    sh = await db.get(ProductionShift, body.shift_id)
    if not sh or sh.tenant_id != tenant.id:
        raise HTTPException(404, "Shift not found")
    role = await db.get(ProductionCrewRole, body.crew_role_id)
    if not role or role.tenant_id != tenant.id or role.department_type != "sewing":
        raise HTTPException(400, "Invalid crew role")
    ws = date.fromisoformat(body.week_start_date)
    r = (
        await db.execute(
            select(CrewRosterWeekly).where(
                CrewRosterWeekly.tenant_id == tenant.id,
                CrewRosterWeekly.week_start_date == ws,
                CrewRosterWeekly.sewing_line_id == body.sewing_line_id,
                CrewRosterWeekly.shift_id == body.shift_id,
                CrewRosterWeekly.crew_role_id == body.crew_role_id,
                CrewRosterWeekly.day_of_week == body.day_of_week,
            )
        )
    ).scalar_one_or_none()
    if r:
        r.employee_id = body.employee_id
        r.planned_count = max(0, int(body.planned_count or 0))
        r.notes = body.notes
    else:
        r = CrewRosterWeekly(
            tenant_id=tenant.id,
            week_start_date=ws,
            sewing_line_id=body.sewing_line_id,
            shift_id=body.shift_id,
            crew_role_id=body.crew_role_id,
            day_of_week=body.day_of_week,
            employee_id=body.employee_id,
            planned_count=max(0, int(body.planned_count or 0)),
            notes=body.notes,
        )
        db.add(r)
    await db.commit()
    await db.refresh(r)
    return CrewRosterCellResponse(
        id=r.id,
        week_start_date=r.week_start_date.isoformat(),
        sewing_line_id=r.sewing_line_id,
        shift_id=r.shift_id,
        crew_role_id=r.crew_role_id,
        role_name=role.role_name,
        day_of_week=r.day_of_week,
        employee_id=r.employee_id,
        planned_count=r.planned_count,
        notes=r.notes,
    )


@router.post("/roster-weekly/generate-daily", status_code=204)
async def generate_daily_from_roster(
    body: CrewGenerateDailyRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Copy roster cells for the weekday of target_date into line_crew_daily (merge)."""
    _ensure(user, tenant)
    ws = date.fromisoformat(body.week_start_date)
    target = date.fromisoformat(body.target_date)
    if _week_start(target) != ws:
        raise HTTPException(400, "target_date must fall in the same ISO week as week_start_date")
    dow = target.weekday()
    cells = list(
        (
            await db.execute(
                select(CrewRosterWeekly).where(
                    CrewRosterWeekly.tenant_id == tenant.id,
                    CrewRosterWeekly.week_start_date == ws,
                    CrewRosterWeekly.sewing_line_id == body.sewing_line_id,
                    CrewRosterWeekly.shift_id == body.shift_id,
                    CrewRosterWeekly.day_of_week == dow,
                )
            )
        )
        .scalars()
        .all()
    )
    for c in cells:
        ex = (
            await db.execute(
                select(LineCrewDaily).where(
                    LineCrewDaily.tenant_id == tenant.id,
                    LineCrewDaily.sewing_line_id == body.sewing_line_id,
                    LineCrewDaily.shift_id == body.shift_id,
                    LineCrewDaily.production_date == target,
                    LineCrewDaily.crew_role_id == c.crew_role_id,
                )
            )
        ).scalar_one_or_none()
        role = await db.get(ProductionCrewRole, c.crew_role_id)
        if not role:
            continue
        planned = max(0, int(c.planned_count or 0))
        if role.is_named:
            planned = 1 if c.employee_id else 0
        if ex:
            ex.planned_count = planned
            ex.employee_id = c.employee_id
        else:
            db.add(
                LineCrewDaily(
                    tenant_id=tenant.id,
                    sewing_line_id=body.sewing_line_id,
                    shift_id=body.shift_id,
                    production_date=target,
                    crew_role_id=c.crew_role_id,
                    planned_count=planned,
                    employee_id=c.employee_id,
                )
            )
    await db.commit()


@router.get("/line-crew-sheet/status", response_model=LineCrewSheetStatusResponse)
async def get_line_crew_sheet_status(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    production_date: str = Query(...),
    shift_id: int = Query(...),
    line_id: int = Query(...),
):
    _ensure(user, tenant)
    d = date.fromisoformat(production_date)
    row = (
        await db.execute(
            select(LineCrewSheetHeader).where(
                LineCrewSheetHeader.tenant_id == tenant.id,
                LineCrewSheetHeader.sewing_line_id == line_id,
                LineCrewSheetHeader.shift_id == shift_id,
                LineCrewSheetHeader.production_date == d,
            )
        )
    ).scalar_one_or_none()
    if not row:
        return LineCrewSheetStatusResponse(
            id=None,
            sewing_line_id=line_id,
            shift_id=shift_id,
            production_date=d.isoformat(),
            status="draft",
        )
    return LineCrewSheetStatusResponse(
        id=row.id,
        sewing_line_id=row.sewing_line_id,
        shift_id=row.shift_id,
        production_date=row.production_date.isoformat(),
        status=row.status,
        submitted_at=row.submitted_at.isoformat() if row.submitted_at else None,
        approved_at=row.approved_at.isoformat() if row.approved_at else None,
        locked_at=row.locked_at.isoformat() if row.locked_at else None,
    )


@router.post("/line-crew-sheet/status", response_model=LineCrewSheetStatusResponse)
async def update_line_crew_sheet_status(
    body: LineCrewSheetStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    production_date: str = Query(...),
    shift_id: int = Query(...),
    line_id: int = Query(...),
):
    _ensure(user, tenant)
    d = date.fromisoformat(production_date)
    row = (
        await db.execute(
            select(LineCrewSheetHeader).where(
                LineCrewSheetHeader.tenant_id == tenant.id,
                LineCrewSheetHeader.sewing_line_id == line_id,
                LineCrewSheetHeader.shift_id == shift_id,
                LineCrewSheetHeader.production_date == d,
            )
        )
    ).scalar_one_or_none()
    if not row:
        row = LineCrewSheetHeader(
            tenant_id=tenant.id,
            sewing_line_id=line_id,
            shift_id=shift_id,
            production_date=d,
            status="draft",
        )
        db.add(row)
        await db.flush()
    act = body.action.strip().lower()
    now = datetime.utcnow()
    if act == "submit":
        row.status = "submitted"
        row.submitted_by_user_id = user.id
        row.submitted_at = now
    elif act == "approve":
        row.status = "approved"
        row.approved_by_user_id = user.id
        row.approved_at = now
    elif act == "lock":
        row.status = "locked"
        row.locked_at = now
    elif act == "reopen":
        row.status = "draft"
        row.locked_at = None
    else:
        raise HTTPException(400, "Invalid action")
    await db.commit()
    await db.refresh(row)
    return LineCrewSheetStatusResponse(
        id=row.id,
        sewing_line_id=row.sewing_line_id,
        shift_id=row.shift_id,
        production_date=row.production_date.isoformat(),
        status=row.status,
        submitted_at=row.submitted_at.isoformat() if row.submitted_at else None,
        approved_at=row.approved_at.isoformat() if row.approved_at else None,
        locked_at=row.locked_at.isoformat() if row.locked_at else None,
    )


@router.get("/employees/{employee_id}/production-profile")
async def employee_production_profile(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit_days: int = Query(30, ge=1, le=365),
):
    _ensure(user, tenant)
    emp = await db.get(Employee, employee_id)
    if not emp or emp.tenant_id != tenant.id:
        raise HTTPException(404, "Employee not found")
    from app.models import AttendanceEntry, WorkerSkill, IeOperationsLibrary, HourlyProductionEntry
    from sqlalchemy import func, desc

    latest_line = (
        await db.execute(
            select(LineCrewDaily.sewing_line_id, SewingLine.line_code, LineCrewDaily.production_date)
            .join(SewingLine, SewingLine.id == LineCrewDaily.sewing_line_id)
            .where(LineCrewDaily.tenant_id == tenant.id, LineCrewDaily.employee_id == employee_id)
            .order_by(desc(LineCrewDaily.production_date))
            .limit(1)
        )
    ).first()
    line_info = None
    if latest_line:
        line_info = {"line_id": latest_line[0], "line_code": latest_line[1], "last_date": latest_line[2].isoformat()}

    skills_q = await db.execute(
        select(WorkerSkill, IeOperationsLibrary)
        .join(IeOperationsLibrary, IeOperationsLibrary.id == WorkerSkill.ie_operation_id)
        .where(WorkerSkill.tenant_id == tenant.id, WorkerSkill.employee_id == employee_id, WorkerSkill.is_active.is_(True))
    )
    skills = [
        {"operation_code": op.operation_code, "name": op.name, "skill_level": ws.skill_level}
        for ws, op in skills_q.all()
    ]

    since = date.today() - timedelta(days=limit_days)
    att_rows = (
        await db.execute(
            select(AttendanceEntry.attendance_date, AttendanceEntry.status)
            .where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.employee_id == employee_id,
                AttendanceEntry.attendance_date >= since,
            )
            .order_by(AttendanceEntry.attendance_date)
        )
    ).all()
    attendance_trend = [{"date": r[0].isoformat(), "status": r[1]} for r in att_rows]

    return {
        "employee_id": employee_id,
        "line_assignment": line_info,
        "skills": skills,
        "attendance_trend": attendance_trend,
        "hourly_good_qty_total_period": 0.0,
    }
