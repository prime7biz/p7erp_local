"""Loan recovery outlook: explainable coverage ratio and band per financed order."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal.contract_command.otd_engine import score_order_otd
from app.external_access.financier_portal.visibility_service import (
    build_order_finance_for_order,
    build_production_row_for_order,
)
from app.models import Customer, Order


def _band_from_coverage(coverage: float | None) -> str:
    if coverage is None:
        return "watch"
    if coverage >= 1.5:
        return "strong"
    if coverage >= 1.0:
        return "adequate"
    if coverage >= 0.7:
        return "watch"
    return "at_risk"


def _score_from_signals(
    *,
    coverage: float | None,
    rm_pct: float,
    sewing_pct: float,
    blockers: list[str],
    emi_overdue: bool,
) -> float:
    base = 50.0
    if coverage is not None:
        base += min(30.0, max(-25.0, (coverage - 1.0) * 40.0))
    base += min(15.0, rm_pct * 0.15)
    base += min(15.0, sewing_pct * 0.12)
    base -= len(blockers) * 5.0
    if emi_overdue:
        base -= 15.0
    return round(max(0.0, min(100.0, base)), 1)


async def build_recovery_outlook_for_order(
    db: AsyncSession,
    *,
    tenant_id: int,
    party_id: int,
    order_id: int,
    order_btbs: dict[int, set[int]] | None = None,
    as_of: date | None = None,
) -> dict[str, Any] | None:
    """Single-order recovery DTO."""
    as_of = as_of or date.today()
    if order_btbs is None:
        btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
        order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if order_id not in order_btbs:
        return None
    o = await db.get(Order, order_id)
    if not o or o.tenant_id != tenant_id:
        return None
    cust = await db.get(Customer, o.customer_id)
    buyer = cust.name if cust else None
    finance = await build_order_finance_for_order(
        db, tenant_id=tenant_id, party_id=party_id, order_id=order_id, order_btbs=order_btbs
    )
    production = await build_production_row_for_order(db, tenant_id=tenant_id, order=o, buyer_name=buyer)
    otd = await score_order_otd(db, tenant_id, o)
    outstanding = float((finance or {}).get("outstanding_finance_amount") or 0)
    fob = float((finance or {}).get("fob_value") or 0)
    qty = float(o.quantity or 0)
    sewing_pct = float(production.get("sewing_pct") or 0)
    shipped = bool(o.shipped_at)
    progress_pct = 100.0 if shipped else sewing_pct
    proceeds_proxy = round(fob * qty * progress_pct / 100.0, 2) if fob > 0 and qty > 0 else None
    coverage = round(proceeds_proxy / outstanding, 2) if proceeds_proxy and outstanding > 0 else None
    rm_pct = float(o.rm_received_pct or 0)
    blockers = list(otd.get("blockers") or [])
    drivers: list[str] = []
    if rm_pct >= 95:
        drivers.append("rm_fully_received")
    elif rm_pct < 50:
        drivers.append("rm_incomplete")
    if sewing_pct < 50 and o.delivery_date and (o.delivery_date - as_of).days <= 30:
        drivers.append("sewing_behind_etd")
    for b in blockers:
        if b not in drivers:
            drivers.append(b)
    if coverage is not None and coverage < 1.0:
        drivers.append("coverage_below_principal")
    band = _band_from_coverage(coverage)
    score = _score_from_signals(
        coverage=coverage,
        rm_pct=rm_pct,
        sewing_pct=sewing_pct,
        blockers=blockers,
        emi_overdue=False,
    )
    return {
        "order_id": order_id,
        "order_code": o.order_code,
        "buyer_name": buyer,
        "outstanding_principal": round(outstanding, 2) if outstanding else None,
        "proceeds_proxy": proceeds_proxy,
        "coverage_ratio": coverage,
        "recovery_score": score,
        "recovery_band": band,
        "drivers": drivers[:6],
        "finance_currency": (finance or {}).get("finance_currency"),
        "as_of": as_of.isoformat(),
    }


async def build_recovery_outlook_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int, as_of: date | None = None
) -> tuple[list[dict[str, Any]], str | None]:
    """All financed orders recovery outlook."""
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if not order_btbs:
        return [], "No financed orders in scope."
    items: list[dict[str, Any]] = []
    for oid in sorted(order_btbs.keys()):
        row = await build_recovery_outlook_for_order(
            db, tenant_id=tenant_id, party_id=party_id, order_id=oid, order_btbs=order_btbs, as_of=as_of
        )
        if row:
            items.append(row)
    return items, None


async def build_recovery_dashboard_glance(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> dict[str, Any]:
    """Dashboard rollup for recovery strip."""
    rows, _ = await build_recovery_outlook_rows(db, tenant_id=tenant_id, party_id=party_id)
    if not rows:
        return {
            "financed_orders_count": 0,
            "at_risk_orders_count": 0,
            "total_outstanding_principal": None,
            "outstanding_currency": None,
            "avg_coverage_ratio": None,
        }
    at_risk = sum(1 for r in rows if r.get("recovery_band") in ("watch", "at_risk"))
    total_out = sum(float(r.get("outstanding_principal") or 0) for r in rows)
    coverages = [float(r["coverage_ratio"]) for r in rows if r.get("coverage_ratio") is not None]
    avg_cov = round(sum(coverages) / len(coverages), 2) if coverages else None
    ccy = next((r.get("finance_currency") for r in rows if r.get("finance_currency")), None)
    return {
        "financed_orders_count": len(rows),
        "at_risk_orders_count": at_risk,
        "total_outstanding_principal": round(total_out, 2) if total_out else None,
        "outstanding_currency": ccy,
        "avg_coverage_ratio": avg_cov,
    }


async def count_production_risk_orders(
    db: AsyncSession, *, tenant_id: int, party_id: int, sewing_threshold: float = 50.0, days_ahead: int = 30
) -> int:
    """Orders with sewing below threshold and delivery within N days."""
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if not order_btbs:
        return 0
    today = date.today()
    cutoff = today + timedelta(days=days_ahead)
    count = 0
    for oid in order_btbs:
        o = await db.get(Order, oid)
        if not o or o.tenant_id != tenant_id or o.shipped_at:
            continue
        if not o.delivery_date or o.delivery_date > cutoff:
            continue
        prod = await build_production_row_for_order(db, tenant_id=tenant_id, order=o)
        if float(prod.get("sewing_pct") or 0) < sewing_threshold:
            count += 1
    return count
