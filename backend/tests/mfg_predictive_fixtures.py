"""Shared seeds for the Manufacturing Intelligence Phase 4 (predictive) tests. Built inside tests only.

Calendar: weekend Saturday + Sunday. TODAY (frozen tenant business date) = 2030-03-04, a Monday.
Capacity of the standard line: one 08:00-17:00 shift with a 60 minute break = 480 net minutes x 30 operators =
14,400 operator-minutes per working day. With SMV 12.5 an output of G good pieces is efficiency 12.5 x G / 14,400
(576 pieces = 50 %, 691.2 pieces = 60 %).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_predictive_*.py -q"
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from app.models import HourlyProductionEntry, ItemCategory, ItemUnit
from app.modules.mfg_intelligence import predictive_router
from tests.mfg_alloc_fixtures import add_grn_line, add_item, add_po, add_vendor, add_warehouse
from tests.mfg_intel_fixtures import add_plan, new_tenant, seed_basic_factory

TODAY = date(2030, 3, 4)
API = "/api/v1/mfg-intelligence"
PRED = f"{API}/predictive"
P4_FLAG = "mfg_predictive_intelligence_v1"
FLAGS_P4 = {
    "manufacturing_intelligence_v1": True,
    "planning_math_v2": True,
    P4_FLAG: True,
}
OPERATOR_MINUTES = Decimal("14400")


def freeze_today(monkeypatch, day: date = TODAY) -> None:
    """Freeze the tenant business date used by every Phase 4 route (and the Phase 1 routes)."""
    from app.modules.mfg_intelligence import finance_router, router
    from app.modules.mfg_planning import predictive_router as write_router

    for module in (predictive_router, router, finance_router, write_router):
        monkeypatch.setattr(module, "today_local", lambda _tenant, _d=day: _d)


def working_days_before(day: date, n: int) -> list[date]:
    """The n Monday-Friday dates before `day`, oldest first."""
    out: list[date] = []
    cur = day - timedelta(days=1)
    while len(out) < n:
        if cur.weekday() < 5:
            out.append(cur)
        cur -= timedelta(days=1)
    return list(reversed(out))


def pieces_for(efficiency: Decimal, smv: Decimal = Decimal("12.5")) -> Decimal:
    return (efficiency * OPERATOR_MINUTES / smv).quantize(Decimal("0.001"))


async def add_hourly(db, tenant, line, day: date, good, *, reject="0", cfg=None, style=None, slot=1, dept="sewing"):
    row = HourlyProductionEntry(
        tenant_id=tenant.id,
        department_type=dept,
        line_id=line.id,
        line_style_config_id=cfg.id if cfg is not None else None,
        style_id=style.id if style is not None else None,
        production_date=day,
        hour_slot=slot,
        good_qty=Decimal(str(good)),
        reject_qty=Decimal(str(reject)),
    )
    db.add(row)
    await db.flush()
    return row


async def seed_history(db, tenant, fx, efficiencies: list[Decimal], *, line=None, end: date = TODAY, style=None, ob=None):
    """One COMPLETED plan row covering the history and one hourly row per working day with the given efficiency."""
    line = line or fx.line
    days = working_days_before(end, len(efficiencies))
    cfg = await add_plan(
        db, tenant, line, start=days[0], end=days[-1], qty="100000", done="0", style=style or fx.style,
        ob=ob or fx.ob, rs="COMPLETED",
    )
    for day, e in zip(days, efficiencies):
        await add_hourly(db, tenant, line, day, pieces_for(Decimal(e)), cfg=cfg, style=style or fx.style)
    return cfg, days


async def new_predictive_tenant(db, *, flags: dict | None = None, permissions: dict | None = None):
    tenant, user, role = await new_tenant(db, flags=FLAGS_P4 if flags is None else flags, permissions=permissions)
    fx = await seed_basic_factory(db, tenant)
    return tenant, user, fx


async def add_supply_basics(db, tenant):
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{uuid.uuid4().hex[:6]}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{uuid.uuid4().hex[:6]}"[:8], name="Mtr")
    db.add_all([cat, unit])
    await db.flush()
    store = await add_warehouse(db, tenant)
    item = await add_item(db, tenant, cat, unit, "FAB", lead_time_days=10)
    vendor = await add_vendor(db, tenant)
    return SimpleNamespace(cat=cat, unit=unit, store=store, item=item, vendor=vendor)


def built_finding(
    kind: str,
    key: str,
    *,
    severity: str = "high",
    priority: str = "3",
    department: str = "Production Planning",
    order_id: int | None = None,
    line_id: int | None = None,
    deadline: date | None = None,
    payload: dict | None = None,
) -> dict:
    """A finding as `bottleneck_service.build_findings` returns it (for writer / alert tests)."""
    return {
        "finding_key": key,
        "kind": kind,
        "severity": severity,
        "priority": Decimal(priority),
        "department": department,
        "order_id": order_id,
        "line_id": line_id,
        "deadline_date": deadline,
        "payload": payload
        or {
            "kind": kind,
            "facts": [{"id": "days", "label": "days affected", "value": "3", "unit": "days"}],
            "dates": {},
            "affected_dates": [TODAY.isoformat()],
            "days_affected": 3,
            "reason_codes": ["TEST"],
            "recommendation": {"action": "Do it", "screen": {"href": "/app/production/line-plan", "label": "Line plan"}},
        },
    }


async def add_late_history(db, tenant, sb, lateness_days: list[int], *, today: date = TODAY, vendor=None, item=None):
    """Fully received PO lines whose receipt was `lateness` days after the promise (promise 30 days ago)."""
    vendor = vendor or sb.vendor
    item = item or sb.item
    promise = today - timedelta(days=30)
    lines = []
    for late in lateness_days:
        po, line = await add_po(db, tenant, vendor, item, "100", status="FULLY_RECEIVED", expected_date=promise)
        grn_line = await add_grn_line(db, tenant, po, line, sb.store, received="100", accepted="100")
        from app.models.inventory import GoodsReceiving

        grn = await db.get(GoodsReceiving, grn_line.goods_receiving_id)
        grn.received_date = promise + timedelta(days=late)
        await db.flush()
        lines.append(line)
    return lines
