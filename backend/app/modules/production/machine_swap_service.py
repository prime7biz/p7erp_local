"""Transactional machine plan-swap onto a target sewing line (flag ``mfg_machine_match_v1``).

Ends overlapping assignments (valid_to = day before) then creates new assignments.
Idempotent via ``production_machine_swap_requests.request_id``.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_mfg_machine_match_v1_enabled
from app.models import DepartmentMachine, Order, ProductionMachineSwapRequest, SewingLine, Tenant, User
from app.models.mfg_planning import ProductionMachineLineAssignment
from app.modules.audit.service import log_action
from app.modules.production import line_assignment_service as las


class MachineSwapItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    machine_id: int = Field(..., ge=1)
    source_line_id: int | None = Field(None, ge=1)  # None = from idle pool


class MachineSwapPlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(..., min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    target_line_id: int = Field(..., ge=1)
    order_id: int | None = Field(None, ge=1)
    valid_from: date
    machines: list[MachineSwapItem] = Field(..., min_length=1, max_length=100)
    notes: str | None = Field(None, max_length=2000)


async def plan_swap(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    body: MachineSwapPlanIn,
) -> dict[str, Any]:
    if not is_mfg_machine_match_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")

    existing = (
        await db.execute(
            select(ProductionMachineSwapRequest).where(
                ProductionMachineSwapRequest.tenant_id == tenant.id,
                ProductionMachineSwapRequest.request_id == body.request_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return {"replay": True, "request_id": body.request_id, "result": existing.result_json or {}}

    await ensure_owned(db, SewingLine, body.target_line_id, tenant.id, "Sewing line")
    if body.order_id:
        await ensure_owned(db, Order, body.order_id, tenant.id, "Order")

    moved: list[dict[str, Any]] = []
    for item in body.machines:
        machine = await ensure_owned(db, DepartmentMachine, item.machine_id, tenant.id, "Machine")
        if not machine.is_active:
            raise HTTPException(status_code=422, detail=f"Machine {item.machine_id} is inactive")

        # Lock machine row then close any active assignment overlapping valid_from.
        await db.execute(
            select(DepartmentMachine)
            .where(DepartmentMachine.id == machine.id, DepartmentMachine.tenant_id == tenant.id)
            .with_for_update()
        )
        open_assigns = (
            await db.execute(
                select(ProductionMachineLineAssignment)
                .where(
                    ProductionMachineLineAssignment.tenant_id == tenant.id,
                    ProductionMachineLineAssignment.machine_id == machine.id,
                    ProductionMachineLineAssignment.is_active.is_(True),
                )
                .with_for_update()
            )
        ).scalars().all()
        for a in open_assigns:
            if a.valid_to is None or a.valid_to >= body.valid_from:
                if a.sewing_line_id == body.target_line_id and (
                    a.valid_to is None or a.valid_to >= body.valid_from
                ):
                    # Already on target — leave as-is.
                    continue
                a.valid_to = body.valid_from - timedelta(days=1)
                if a.valid_to < a.valid_from:
                    a.is_active = False
                    a.valid_to = a.valid_from

        create = las.MachineAssignmentCreate(
            machine_id=machine.id,
            sewing_line_id=body.target_line_id,
            valid_from=body.valid_from,
            valid_to=None,
            notes=body.notes,
        )
        row = await las.create_machine_assignment(db, tenant=tenant, user=user, data=create)
        moved.append({"machine_id": machine.id, "assignment_id": row.id, "line_id": body.target_line_id})

    result = {"moved": moved, "target_line_id": body.target_line_id, "valid_from": body.valid_from.isoformat()}
    db.add(
        ProductionMachineSwapRequest(
            tenant_id=tenant.id,
            request_id=body.request_id,
            target_line_id=body.target_line_id,
            order_id=body.order_id,
            valid_from=body.valid_from,
            payload_json=body.model_dump(mode="json"),
            result_json=result,
            status="APPLIED",
            created_by_user_id=user.id,
        )
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        action="MACHINE_PLAN_SWAP",
        user_id=user.id,
        resource=f"sewing_line:{body.target_line_id}",
        details=f"request_id={body.request_id} moved={len(moved)}",
    )
    return {"replay": False, "request_id": body.request_id, "result": result}
