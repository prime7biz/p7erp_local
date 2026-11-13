"""Shared seeds for the Manufacturing Intelligence Phase 5 tests (forward plan, scenarios, finance-constrained).

Built inside the test transaction only. The tenant business date is pinned to TODAY (a Monday) so horizons and buckets
are deterministic. Reference factory (mfg_intel_fixtures): one 480-minute shift, 30 operators, efficiency 60 %,
SMV 12.5 -> practical 8,640 SMV minutes per working day.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_forward_plan*.py tests/test_mfg_finance_constrained.py tests/test_mfg_advanced_flag_off.py -q"
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import Inquiry
from app.models.mfg_planning import MfgTentativeLineBooking
from tests.mfg_intel_fixtures import API, MONDAY, add_order, add_plan, new_tenant, seed_basic_factory

TODAY = MONDAY  # 2030-03-04
FP = f"{API}/forward-plan"
MI = "manufacturing_intelligence_v1"
ADV = "mfg_advanced_planning_v1"
INTEGRATED = "mfg_integrated_planning_v1"
PREDICTIVE = "mfg_predictive_intelligence_v1"
CASH = "mfg_financial_readiness_v1"
ADV_FLAGS = {MI: True, "planning_math_v2": True, ADV: True}
PRACTICAL = Decimal("8640")


@pytest.fixture(autouse=True)
def pinned_today(monkeypatch):
    """Tenant business date = TODAY in the Phase 5 router; heavy rate-limit buckets cleared per test."""
    from app.modules.ai_tool import guardrails
    from app.modules.mfg_intelligence import advanced_planning_router
    from app.modules.mfg_planning import scheduler_convert
    from app.modules.production import plan_revision_service

    for module in (advanced_planning_router, scheduler_convert, plan_revision_service):
        monkeypatch.setattr(module, "today_local", lambda _tenant: TODAY)
    guardrails._rate_buckets.clear()
    yield
    guardrails._rate_buckets.clear()


async def adv_tenant(db, *, flags: dict | None = None, permissions: dict | None = None):
    tenant, user, role = await new_tenant(db, flags=ADV_FLAGS if flags is None else flags, permissions=permissions)
    tenant.base_currency = "BDT"
    fx = await seed_basic_factory(db, tenant)
    return tenant, user, role, fx


async def base_row(db, tenant, fx, *, days: int = 200, **kw):
    """A long unlinked FIRM row so every working day has a known efficiency (60 %) and operators (30)."""
    return await add_plan(db, tenant, fx.line, start=TODAY - timedelta(days=1), end=TODAY + timedelta(days=days),
                          qty=kw.pop("qty", "0"), ob=fx.ob, style=fx.style, **kw)


async def add_inquiry(db, tenant, customer) -> Inquiry:
    inq = Inquiry(tenant_id=tenant.id, customer_id=customer.id, inquiry_code=f"INQ-{uuid.uuid4().hex[:8]}", status="OPEN")
    db.add(inq)
    await db.flush()
    return inq


async def add_booking(
    db, tenant, fx, *, start: date, end: date, qty="100", conf="50", inquiry=None, quotation=None, line=None,
    status="ACTIVE",
) -> MfgTentativeLineBooking:
    b = MfgTentativeLineBooking(
        tenant_id=tenant.id, line_id=(line or fx.line).id, inquiry_id=inquiry.id if inquiry else None,
        quotation_id=quotation.id if quotation else None, style_id=fx.style.id, ob_id=fx.ob.id, start_date=start,
        planned_end_date=end, planned_qty=Decimal(qty), smv_per_piece=Decimal("12.5"), confidence_pct=Decimal(conf),
        expires_at=datetime.utcnow() + timedelta(days=3650), status=status,
    )
    db.add(b)
    await db.flush()
    return b


def dec(value) -> Decimal:
    return Decimal(value) if value is not None else Decimal("0")


def layer_total(payload: dict, layer: str) -> Decimal:
    return sum((dec(b["layers"][layer]) for b in payload["buckets"]), Decimal("0"))


__all__ = [
    "ADV", "ADV_FLAGS", "CASH", "FP", "INTEGRATED", "MI", "PRACTICAL", "PREDICTIVE", "TODAY",
    "add_booking", "add_inquiry", "add_order", "add_plan", "adv_tenant", "base_row", "dec", "layer_total", "pinned_today",
]
