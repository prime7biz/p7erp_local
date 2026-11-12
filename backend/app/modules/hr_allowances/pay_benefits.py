"""Per-employee overtime and bill switches (``hr_employee_pay_benefits``, migration 290).

No row for a code means "enabled at the company rate", so employees created before this table
keep their old behaviour. OVERTIME is priced from salary and never has an amount. Nothing here
commits; the caller owns the transaction.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr_allowance import HrEmployeePayBenefit

BENEFIT_CODES = ("OVERTIME", "FRIDAY", "TIFFIN", "LUNCH", "DINNER", "NIGHT")
BILL_CODES = ("FRIDAY", "TIFFIN", "LUNCH", "DINNER", "NIGHT")
BENEFIT_LABELS = {
    "OVERTIME": "Overtime",
    "FRIDAY": "Friday allowance",
    "TIFFIN": "Tiffin bill",
    "LUNCH": "Lunch bill",
    "DINNER": "Dinner bill",
    "NIGHT": "Night bill",
}
MAX_BILL_AMOUNT = Decimal("100000")
OVERTIME_OFF_DETAIL = "Overtime is not activated for this employee"


def parse_bill_amount(value: str | Decimal | None, label: str) -> Decimal | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} amount must be a decimal number") from None
    if not amount.is_finite() or amount < 0:
        raise HTTPException(status_code=400, detail=f"{label} amount must be zero or more")
    if amount > MAX_BILL_AMOUNT:
        raise HTTPException(status_code=400, detail=f"{label} amount is too large")
    return amount.quantize(Decimal("0.01"))


async def benefits_by_employee(
    db: AsyncSession, tenant_id: int, employee_ids: Iterable[int]
) -> dict[int, dict[str, HrEmployeePayBenefit]]:
    ids = sorted({int(i) for i in employee_ids})
    if not ids:
        return {}
    out: dict[int, dict[str, HrEmployeePayBenefit]] = {}
    for start in range(0, len(ids), 1000):
        rows = (
            await db.execute(
                select(HrEmployeePayBenefit).where(
                    HrEmployeePayBenefit.tenant_id == tenant_id,
                    HrEmployeePayBenefit.employee_id.in_(ids[start : start + 1000]),
                )
            )
        ).scalars().all()
        for row in rows:
            out.setdefault(row.employee_id, {})[row.benefit_code] = row
    return out


async def is_employee_overtime_enabled(db: AsyncSession, tenant_id: int, employee_id: int) -> bool:
    enabled = (
        await db.execute(
            select(HrEmployeePayBenefit.enabled).where(
                HrEmployeePayBenefit.tenant_id == tenant_id,
                HrEmployeePayBenefit.employee_id == employee_id,
                HrEmployeePayBenefit.benefit_code == "OVERTIME",
            )
        )
    ).scalar_one_or_none()
    return enabled is not False


def benefits_view(rows: dict[str, HrEmployeePayBenefit]) -> list[dict]:
    """All six codes, with the no-row default filled in."""
    out = []
    for code in BENEFIT_CODES:
        row = rows.get(code)
        out.append(
            {
                "benefit_code": code,
                "label": BENEFIT_LABELS[code],
                "enabled": True if row is None else bool(row.enabled),
                "amount_override": (
                    f"{Decimal(row.amount_override):.2f}" if row is not None and row.amount_override is not None else None
                ),
                "is_default": row is None,
            }
        )
    return out


async def upsert_pay_benefits(
    db: AsyncSession, *, tenant_id: int, employee_id: int, items: Iterable, actor_id: int | None
) -> list[str]:
    """Write the given switches (idempotent: same input, same rows). Returns the codes switched off.

    ``items`` are objects with ``benefit_code``, ``enabled`` and ``amount_override``. The caller must
    have checked the employee belongs to the tenant (and should hold the employee row lock).
    """
    seen: set[str] = set()
    values = []
    for item in items:
        code = str(item.benefit_code).strip().upper()
        if code not in BENEFIT_CODES:
            raise HTTPException(status_code=400, detail=f"Unknown benefit {code}")
        if code in seen:
            raise HTTPException(status_code=400, detail=f"{BENEFIT_LABELS[code]} is listed twice")
        seen.add(code)
        amount = parse_bill_amount(item.amount_override, BENEFIT_LABELS[code])
        if code == "OVERTIME" and amount is not None:
            raise HTTPException(
                status_code=400, detail="Overtime is calculated from the salary; it cannot have a fixed amount"
            )
        values.append(
            {
                "tenant_id": tenant_id,
                "employee_id": employee_id,
                "benefit_code": code,
                "enabled": bool(item.enabled),
                "amount_override": amount,
                "updated_by": actor_id,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        )
    if not values:
        return []
    stmt = pg_insert(HrEmployeePayBenefit).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_hr_employee_pay_benefit",
        set_={
            "enabled": stmt.excluded.enabled,
            "amount_override": stmt.excluded.amount_override,
            "updated_by": stmt.excluded.updated_by,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    await db.execute(stmt)
    return sorted(v["benefit_code"] for v in values if not v["enabled"])
