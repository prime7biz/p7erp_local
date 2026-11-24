"""Read-only leave / payroll impact preview for HR class requests."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models import Tenant, User
from app.models.hr import Employee
from app.modules.hr_change_requests import service as change_svc
from app.modules.hr_class_requests import apply_service
from app.modules.hr_leave.leave_days import validate_leave_request
from app.modules.hr_leave import request_core as leave_core


async def preview(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    kind: str,
    employee_id: int | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    kind = (kind or "").upper()
    if kind == "LEAVE":
        if employee_id is None:
            raise HTTPException(status_code=400, detail="employee_id required")
        await ensure_owned(db, Employee, employee_id, tenant.id, "Employee", status_code=404)
        days = await validate_leave_request(
            db,
            tenant=tenant,
            employee_id=employee_id,
            from_date=apply_service._parse_date(payload["from_date"]),
            to_date=apply_service._parse_date(payload["to_date"]),
            requested_days=payload.get("days_requested"),
        )
        lt = await leave_core.leave_type_or_404(db, tenant.id, int(payload["leave_type_id"]))
        bal = await leave_core.get_or_create_balance(
            db, tenant.id, employee_id, lt.id, apply_service._parse_date(payload["from_date"]).year
        )
        return {
            "kind": "LEAVE",
            "days_requested": str(days),
            "leave_type": {"id": lt.id, "code": lt.code, "name": lt.name, "is_paid": lt.is_paid},
            "balance": {
                "allocated_days": bal.allocated_days,
                "used_days": bal.used_days,
                "pending_days": bal.pending_days,
                "closing_balance_days": bal.closing_balance_days,
            },
        }
    if kind in {"INCREMENT", "PROMOTION", "CORRECTION"}:
        if employee_id is None:
            raise HTTPException(status_code=400, detail="employee_id required")
        emp = await ensure_owned(db, Employee, employee_id, tenant.id, "Employee", status_code=404)
        assert emp is not None
        parts = apply_service._parts_from_payload(kind, payload or {})
        out_parts = []
        for part_kind, body in parts:
            before = await change_svc.current_values(db, tenant.id, emp, part_kind, body)
            after = change_svc.jsonable(body.model_dump(exclude_unset=True) if part_kind == "INFO" else body.model_dump())
            out_parts.append({"part": part_kind, "before": before, "after": after})
        return {"kind": kind, "employee_id": employee_id, "parts": out_parts}
    raise HTTPException(status_code=400, detail="Preview supports LEAVE, INCREMENT, PROMOTION, CORRECTION only")
