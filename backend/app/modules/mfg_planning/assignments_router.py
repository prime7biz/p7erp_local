"""Line assignments, route stages and style standard SMV (Manufacturing Intelligence Phase 2, run R4).

Prefix ``/api/v1/mfg-intelligence`` (shared with the Phase 1, allocation and planning routers).

Every endpoint:
1. needs ``production.planning.read`` (router level) plus the endpoint key listed in the table below
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 unless the tenant flags ``manufacturing_intelligence_v1`` AND ``mfg_integrated_planning_v1`` are true
4. checks tenant ownership of every id in the path / body (another tenant's id looks like "not found")

| Endpoint                                                        | Extra permission            |
|-----------------------------------------------------------------|-----------------------------|
| GET  /line-assignments/employees, /line-assignments/machines    | -                           |
| POST /line-assignments/employees, /line-assignments/machines    | production.planning.write   |
| PATCH /line-assignments/{kind}/{id}, POST .../{id}/end, .../{id}/deactivate | production.planning.write |
| GET  /route-stages?order_id=                                    | -                           |
| GET  /styles/{id}/standard-smv                                  | -                           |
| PUT  /styles/{id}/standard-smv                                  | production.planning.approve |

Writes commit once at the end of each handler. Employees are shown by code and name only.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Employee, GarmentStyle, Order, Tenant, User
from app.modules.merch import style_standard_smv_service as smv_svc
from app.modules.mfg_intelligence.flags import require_integrated_enabled
from app.modules.mfg_intelligence.route_stage_service import route_stages_payload
from app.modules.production import line_assignment_service as las

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-assignments"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)

_WRITE = Depends(require_internal_permission("production.planning.write"))
_APPROVE = Depends(require_internal_permission("production.planning.approve"))


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    require_integrated_enabled(tenant)


def _machine_match_guard(user: User, tenant: Tenant) -> None:
    """Read-only machine-match GETs: allow Control Center OR integrated planning parents.

    Requires ``mfg_machine_match_v1`` and either ``prod_control_center_v1`` or the usual
    ``manufacturing_intelligence_v1`` + ``mfg_integrated_planning_v1`` pair. Write routes
    (plan-swap) still use ``_guard``.
    """
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    from app.common.tenant_feature_keys import (
        is_manufacturing_intelligence_v1_enabled,
        is_mfg_machine_match_v1_enabled,
        is_prod_control_center_v1_enabled,
    )
    from app.modules.mfg_intelligence.flags import integrated_planning_on

    if not is_mfg_machine_match_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if is_prod_control_center_v1_enabled(tenant.feature_flags):
        return
    if is_manufacturing_intelligence_v1_enabled(tenant.feature_flags) and integrated_planning_on(tenant):
        return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _employee_out(db: AsyncSession, tenant_id: int, row: Any) -> dict[str, Any]:
    return (await las.employee_assignments_out(db, tenant_id, [row]))[0]


async def _machine_out(db: AsyncSession, tenant_id: int, row: Any) -> dict[str, Any]:
    return (await las.machine_assignments_out(db, tenant_id, [row]))[0]


# ------------------------------------------------------------------ planner pickers (display fields only)

PICKER_LIMIT = 50


@router.get("/planning-people/employees", dependencies=[_WRITE])
async def pick_employees(
    q: str | None = Query(None, max_length=64, description="Code or name contains"),
    limit: int = Query(20, ge=1, le=PICKER_LIMIT),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Active employees of this tenant for the line-assignment picker: id, code and name only (no HR detail).

    Needs production.planning.write, so planners who may assign people can pick them without HR access.
    """
    _guard(user, tenant)
    stmt = select(Employee.id, Employee.employee_code, Employee.first_name, Employee.last_name).where(
        Employee.tenant_id == tenant.id, Employee.is_active.is_(True)
    )
    text = (q or "").strip()
    if text:
        like = f"%{text}%"
        stmt = stmt.where(
            or_(Employee.employee_code.ilike(like), Employee.first_name.ilike(like), Employee.last_name.ilike(like))
        )
    rows = (await db.execute(stmt.order_by(Employee.employee_code, Employee.id).limit(limit))).all()
    return {
        "items": [
            {
                "id": int(eid),
                "employee_code": code,
                "employee_name": " ".join(x for x in (first, last) if x).strip() or code,
            }
            for eid, code, first, last in rows
        ]
    }


# ------------------------------------------------------------------ employee line assignments


@router.get("/line-assignments/employees")
async def list_employee_assignments(
    line_id: int | None = Query(None, ge=1),
    employee_id: int | None = Query(None, ge=1),
    active_on: date | None = Query(None, description="Only assignments active on this date"),
    include_inactive: bool = Query(False),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    return await las.list_assignments(
        db, tenant.id, kind="employee", sewing_line_id=line_id, owner_id=employee_id, active_on=active_on,
        include_inactive=include_inactive, limit=limit, offset=offset,
    )


@router.post("/line-assignments/employees", status_code=201, dependencies=[_WRITE])
async def create_employee_assignment(
    body: las.EmployeeAssignmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """409 when the employee already has an active assignment overlapping these dates."""
    _guard(user, tenant)
    row = await las.create_employee_assignment(db, tenant=tenant, user=user, data=body)
    await db.commit()
    return await _employee_out(db, tenant.id, row)


@router.patch("/line-assignments/employees/{assignment_id}", dependencies=[_WRITE])
async def update_employee_assignment(
    assignment_id: int,
    body: las.EmployeeAssignmentUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row = await las.update_employee_assignment(db, tenant=tenant, user=user, assignment_id=assignment_id, data=body)
    await db.commit()
    return await _employee_out(db, tenant.id, row)


@router.post("/line-assignments/employees/{assignment_id}/end", dependencies=[_WRITE])
async def end_employee_assignment(
    assignment_id: int,
    body: las.AssignmentEndIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row, changed = await las.end_employee_assignment(db, tenant=tenant, user=user, assignment_id=assignment_id, data=body)
    if changed:
        await db.commit()
    out = await _employee_out(db, tenant.id, row)
    out["changed"] = changed
    return out


@router.post("/line-assignments/employees/{assignment_id}/deactivate", dependencies=[_WRITE])
async def deactivate_employee_assignment(
    assignment_id: int,
    body: las.AssignmentDeactivateIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row, changed = await las.deactivate_employee_assignment(
        db, tenant=tenant, user=user, assignment_id=assignment_id, data=body
    )
    if changed:
        await db.commit()
    out = await _employee_out(db, tenant.id, row)
    out["changed"] = changed
    return out


# ------------------------------------------------------------------ machine line assignments


@router.get("/line-assignments/machines")
async def list_machine_assignments(
    line_id: int | None = Query(None, ge=1),
    machine_id: int | None = Query(None, ge=1),
    active_on: date | None = Query(None, description="Only assignments active on this date"),
    include_inactive: bool = Query(False),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    return await las.list_assignments(
        db, tenant.id, kind="machine", sewing_line_id=line_id, owner_id=machine_id, active_on=active_on,
        include_inactive=include_inactive, limit=limit, offset=offset,
    )


@router.post("/line-assignments/machines", status_code=201, dependencies=[_WRITE])
async def create_machine_assignment(
    body: las.MachineAssignmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """409 when the machine already has an active assignment overlapping these dates."""
    _guard(user, tenant)
    row = await las.create_machine_assignment(db, tenant=tenant, user=user, data=body)
    await db.commit()
    return await _machine_out(db, tenant.id, row)


@router.patch("/line-assignments/machines/{assignment_id}", dependencies=[_WRITE])
async def update_machine_assignment(
    assignment_id: int,
    body: las.MachineAssignmentUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row = await las.update_machine_assignment(db, tenant=tenant, user=user, assignment_id=assignment_id, data=body)
    await db.commit()
    return await _machine_out(db, tenant.id, row)


@router.post("/line-assignments/machines/{assignment_id}/end", dependencies=[_WRITE])
async def end_machine_assignment(
    assignment_id: int,
    body: las.AssignmentEndIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row, changed = await las.end_machine_assignment(db, tenant=tenant, user=user, assignment_id=assignment_id, data=body)
    if changed:
        await db.commit()
    out = await _machine_out(db, tenant.id, row)
    out["changed"] = changed
    return out


@router.post("/line-assignments/machines/{assignment_id}/deactivate", dependencies=[_WRITE])
async def deactivate_machine_assignment(
    assignment_id: int,
    body: las.AssignmentDeactivateIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    row, changed = await las.deactivate_machine_assignment(
        db, tenant=tenant, user=user, assignment_id=assignment_id, data=body
    )
    if changed:
        await db.commit()
    out = await _machine_out(db, tenant.id, row)
    out["changed"] = changed
    return out


# ------------------------------------------------------------------ route stages


@router.get("/route-stages")
async def get_route_stages(
    order_id: int = Query(..., ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """External PRE / POST sewing (and subcontract sewing) stages of the order with their lead times."""
    _guard(user, tenant)
    order = (
        await db.execute(select(Order).where(Order.tenant_id == tenant.id, Order.id == order_id))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return await route_stages_payload(db, tenant.id, order)


# ------------------------------------------------------------------ style standard SMV


@router.get("/styles/{style_id}/standard-smv")
async def get_style_standard_smv(
    style_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    style = (
        await db.execute(select(GarmentStyle).where(GarmentStyle.tenant_id == tenant.id, GarmentStyle.id == style_id))
    ).scalar_one_or_none()
    if style is None:
        raise HTTPException(status_code=404, detail="Style not found")
    return await _smv_out_with_name(db, tenant.id, style)


async def _smv_out_with_name(db: AsyncSession, tenant_id: int, style: GarmentStyle) -> dict[str, Any]:
    out = smv_svc.standard_smv_out(style)
    name = None
    if style.standard_smv_approved_by:
        row = (
            await db.execute(
                select(User.first_name, User.last_name, User.username).where(
                    User.tenant_id == tenant_id, User.id == style.standard_smv_approved_by
                )
            )
        ).first()
        if row is not None:
            name = " ".join(x for x in (row[0], row[1]) if x).strip() or row[2]
    out["standard_smv_approved_by_name"] = name
    return out


@router.put("/styles/{style_id}/standard-smv", dependencies=[_APPROVE])
async def put_style_standard_smv(
    style_id: int,
    body: smv_svc.StandardSmvIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve the style's standard SMV (audited). Sending the same values again changes nothing."""
    _guard(user, tenant)
    style, changed = await smv_svc.set_standard_smv(db, tenant=tenant, user=user, style_id=style_id, data=body)
    if changed:
        await db.commit()
    out = await _smv_out_with_name(db, tenant.id, style)
    out["changed"] = changed
    return out


# ------------------------------------------------------------------ machine match / plan-swap (flag mfg_machine_match_v1)


@router.get("/machine-match/lines")
async def machine_match_rank_lines(
    order_id: int = Query(..., ge=1),
    on_date: date | None = Query(None),
    factory_unit: str | None = Query(None, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rank active sewing lines by OB machine-content similarity for an order (read-only)."""
    _machine_match_guard(user, tenant)
    from app.common.business_date import today_local
    from app.modules.mfg_intelligence import machine_match_service as mms

    d = on_date or today_local(tenant)
    items = await mms.rank_lines_for_order(
        db, tenant=tenant, order_id=order_id, on_date=d, factory_unit=factory_unit
    )
    return {"order_id": order_id, "on_date": d.isoformat(), "items": items}


@router.get("/lines/{line_id}/machine-gap")
async def machine_gap(
    line_id: int,
    order_id: int = Query(..., ge=1),
    on_date: date | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _machine_match_guard(user, tenant)
    from app.common.business_date import today_local
    from app.modules.mfg_intelligence import machine_match_service as mms

    d = on_date or today_local(tenant)
    return await mms.machine_gap_for_line(
        db, tenant=tenant, line_id=line_id, order_id=order_id, on_date=d
    )


@router.post("/machine-assignments/plan-swap", dependencies=[_WRITE], status_code=201)
async def machine_plan_swap(
    body: dict[str, Any],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Move machines onto a target line (idempotent request_id)."""
    _guard(user, tenant)
    from app.common.tenant_feature_keys import is_mfg_machine_match_v1_enabled
    from app.modules.production.machine_swap_service import MachineSwapPlanIn, plan_swap

    if not is_mfg_machine_match_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")
    parsed = MachineSwapPlanIn.model_validate(body)
    out = await plan_swap(db, tenant=tenant, user=user, body=parsed)
    await db.commit()
    status_code = 200 if out.get("replay") else 201
    # FastAPI status_code is fixed; return replay flag for clients.
    return out
