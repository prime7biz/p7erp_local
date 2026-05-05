"""Helpers for knitting charge lookups."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession


def safe_float_money(s: str | None, default: float = 0.0) -> float:
    try:
        return float(str(s or "").replace(",", "").strip() or default)
    except ValueError:
        return default


async def resolve_charge_amount(
    db: AsyncSession,
    *,
    tenant_id: int,
    fabric_type_code: str | None,
    unit_basis_hint: str,
    planned_yarn_qty: float,
    planned_greige_qty: float,
    as_of: date | None = None,
) -> float:
    """Return suggested processing charge amount from knitting_charge_rates."""
    from app.models import KnittingChargeRate

    ft = (fabric_type_code or "").strip()
    if not ft:
        return 0.0
    d = as_of or date.today()
    stmt = (
        select(KnittingChargeRate)
        .where(
            KnittingChargeRate.tenant_id == tenant_id,
            KnittingChargeRate.fabric_type_code == ft,
            KnittingChargeRate.is_active.is_(True),
            KnittingChargeRate.effective_from <= d,
            or_(KnittingChargeRate.effective_to.is_(None), KnittingChargeRate.effective_to >= d),
        )
        .order_by(KnittingChargeRate.effective_from.desc())
        .limit(1)
    )
    r = await db.execute(stmt)
    row = r.scalars().first()
    if not row:
        return 0.0
    basis = (row.unit_basis or unit_basis_hint or "per_kg_greige").strip().lower()
    rate = float(row.rate_per_unit or 0)
    qty = planned_greige_qty if basis in {"per_kg_greige", "per_kg_fg", "per_kg_output"} else planned_yarn_qty
    return round(max(rate * qty, 0), 4)
