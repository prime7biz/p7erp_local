"""Business "today" in inventory / merch / production / GL / portals uses the company timezone.

The clock is frozen at 2026-11-05 20:30 UTC, which is already 2026-11-06 02:30 in Dhaka.
A plain ``date.today()`` on a UTC server would still say 2026-11-05.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.common import business_date

DHAKA_TODAY = date(2026, 11, 6)
UTC_TODAY = date(2026, 11, 5)


class _FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        frozen = datetime(2026, 11, 5, 20, 30, tzinfo=timezone.utc)
        return frozen if tz is None else frozen.astimezone(tz)


@pytest.fixture(autouse=True)
def _frozen_clock(monkeypatch):
    monkeypatch.setattr(business_date, "datetime", _FrozenDatetime)
    monkeypatch.setattr(business_date, "_app_timezone_name", lambda: "Asia/Dhaka")


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeDb:
    """Records every statement; returns the given rows; ``get`` returns the fake tenant."""

    def __init__(self, rows=None, tenant_timezone=None):
        self.rows = rows or []
        self.statements = []
        self.tenant = SimpleNamespace(id=1, timezone=tenant_timezone)

    async def get(self, model, obj_id):
        return self.tenant

    async def execute(self, stmt):
        self.statements.append(stmt)
        return _Result(self.rows)

    async def flush(self):
        return None


def _bound_dates(db: _FakeDb) -> set[date]:
    out: set[date] = set()
    for stmt in db.statements:
        out.update(v for v in stmt.compile().params.values() if isinstance(v, date))
    return out


def test_frozen_clock_is_next_day_in_dhaka():
    assert business_date.today_local() == DHAKA_TODAY


@pytest.mark.asyncio
async def test_merch_followup_overdue_counts_days_from_dhaka_today():
    from app.modules.merch.alert_rules import rule_followup_overdue

    row = SimpleNamespace(id=7, order_id=3, title="Lab dip", due_date=UTC_TODAY, status="OPEN")
    db = _FakeDb(rows=[row])
    out = await rule_followup_overdue(db, 1, None)

    assert DHAKA_TODAY in _bound_dates(db)
    assert out[0]["evidence_json"]["facts"]["days_overdue"] == 1


@pytest.mark.asyncio
async def test_inventory_mark_expired_batches_uses_dhaka_today():
    from app.modules.inventory.stock_batch_service import mark_expired_batches

    db = _FakeDb()
    assert await mark_expired_batches(db, 1) == 0
    assert _bound_dates(db) == {DHAKA_TODAY}


@pytest.mark.asyncio
async def test_production_knitting_rate_lookup_uses_dhaka_today():
    from app.modules.production.knitting_service import resolve_charge_amount

    db = _FakeDb()
    amount = await resolve_charge_amount(
        db,
        tenant_id=1,
        fabric_type_code="SJ",
        unit_basis_hint="per_kg_greige",
        planned_yarn_qty=10,
        planned_greige_qty=10,
    )
    assert amount == 0.0
    assert _bound_dates(db) == {DHAKA_TODAY}


@pytest.mark.asyncio
async def test_tenant_timezone_overrides_default(monkeypatch):
    from app.modules.production.knitting_service import resolve_charge_amount

    db = _FakeDb(tenant_timezone="UTC")
    await resolve_charge_amount(
        db,
        tenant_id=1,
        fabric_type_code="SJ",
        unit_basis_hint="per_kg_greige",
        planned_yarn_qty=1,
        planned_greige_qty=1,
    )
    assert _bound_dates(db) == {UTC_TODAY}


@pytest.mark.asyncio
async def test_physical_count_gl_voucher_defaults_to_dhaka_today(monkeypatch):
    from app.services import inventory_gl_service

    async def _accounts(db, tenant_id, item_id):
        return {"inventory": 10, "adjustment": 20}

    posted: dict = {}

    async def _capture(db, tenant_id, user_id, voucher_date, *args, **kwargs):
        posted["voucher_date"] = voucher_date

    monkeypatch.setattr(inventory_gl_service, "resolve_inventory_accounts", _accounts)
    monkeypatch.setattr(inventory_gl_service, "_post_balanced_voucher", _capture)
    mv = SimpleNamespace(movement_value="100", item_id=5, movement_type="IN")
    db = _FakeDb(rows=[mv])

    await inventory_gl_service.post_physical_inventory_gl(db, 1, None, 9, "PIC-0009", None)

    assert posted["voucher_date"] == DHAKA_TODAY


def test_portal_selectors_today_is_dhaka_date():
    from app.external_access.customer_portal import selectors as customer_sel
    from app.external_access.financier_portal import selectors as financier_sel

    assert customer_sel._today() == DHAKA_TODAY
    assert financier_sel._today() == DHAKA_TODAY
