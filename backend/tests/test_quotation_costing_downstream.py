"""Dozen-first quotations feed the rest of the ERP (order snapshot, commission, quotation helpers).

Run:
    docker compose exec backend pytest tests/test_quotation_costing_downstream.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models import Quotation
from app.models.commission import CommissionShipment
from app.modules.commission.service import (
    DIRECTION_RECEIVABLE,
    build_entries,
    calculate_amounts,
    is_per_order_fixed,
)
from app.modules.orders.commercial_snapshot_service import quotation_commercial_header_dict
from app.modules.quotations.quotation_basis import cost_for_quantity, is_dozen_first, unit_price
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


def _quote(**over) -> Quotation:
    base = dict(
        tenant_id=1,
        customer_id=1,
        quotation_code="Q-X",
        status="DRAFT",
        version_no=1,
        currency="USD",
        projected_quantity=1200,
        quoted_price=Decimal("2645.0000"),
        total_amount=Decimal("2645.0000"),
        total_cost=Decimal("2300.0000"),
    )
    base.update(over)
    return Quotation(**base)


def _dozen_first() -> Quotation:
    return _quote(
        costing_basis="PER_DOZEN",
        margin_method="MARGIN_ON_FOB",
        fixed_commission_basis="PER_ORDER",
        quoted_price_per_piece=Decimal("2.2042"),
        quoted_price_per_dozen=Decimal("26.4500"),
        total_cost_per_dozen=Decimal("23.0000"),
    )


# ---------- helpers ----------
def test_legacy_quotation_keeps_order_total_semantics():
    q = _quote()
    assert not is_dozen_first(q)
    assert unit_price(q) == Decimal("2645.0000")  # legacy: quoted_price (an order total) is returned as-is
    assert cost_for_quantity(q, 500) == Decimal("2300.0000")


def test_dozen_first_unit_price_is_per_piece_and_cost_scales_by_quantity():
    q = _dozen_first()
    assert is_dozen_first(q)
    assert unit_price(q) == Decimal("2.2042")
    assert cost_for_quantity(q, 1200) == Decimal("2300.0000")
    assert cost_for_quantity(q, 12) == Decimal("23.0000")
    assert cost_for_quantity(q, 0) == Decimal("0")


# ---------- order snapshot ----------
def test_snapshot_freezes_per_piece_price_for_dozen_first():
    snap = quotation_commercial_header_dict(_dozen_first())
    assert snap["quoted_price"] == "2.2042"  # readers treat quoted_price as a unit price
    assert snap["total_amount"] == "2645.0000"
    assert snap["costing_basis"] == "PER_DOZEN"
    assert snap["fixed_commission_basis"] == "PER_ORDER"
    assert snap["quoted_price_per_dozen"] == "26.4500"
    assert snap["total_cost_per_dozen"] == "23.0000"


def test_snapshot_of_legacy_quotation_has_no_dozen_first_keys():
    snap = quotation_commercial_header_dict(_quote())
    assert snap["quoted_price"] == "2645.0000"
    for key in ("costing_basis", "fixed_commission_basis", "quoted_price_per_piece"):
        assert key not in snap


# ---------- customer portal + benchmark ----------
def test_portal_price_for_dozen_first_needs_no_quantity():
    from app.external_access.customer_portal.quotations import _quoted_total_amount, _quoted_unit_price

    q = _dozen_first()
    q.projected_quantity = 0
    q.total_amount = Decimal("0")
    assert _quoted_unit_price(q) == "2.2042"  # buyer still sees the per-piece price
    assert _quoted_total_amount(q) is None  # but no invented order total
    q.projected_quantity = 1200
    q.total_amount = Decimal("2645.0000")
    assert _quoted_total_amount(q) == "2645.0000"


def test_portal_price_for_legacy_quotation_is_total_divided_by_quantity():
    from app.external_access.customer_portal.quotations import _quoted_unit_price

    assert _quoted_unit_price(_quote(total_amount=Decimal("2400"), projected_quantity=1200)) == "2.0000"
    assert _quoted_unit_price(_quote(total_amount=Decimal("2400"), projected_quantity=0)) is None


def test_benchmark_metrics_use_per_dozen_basis_and_markup_equivalent_margin():
    from app.modules.quotations.quotation_cost_benchmark_service import _metrics_for_quotation

    q = _dozen_first()
    q.material_cost_per_dozen = Decimal("14")
    q.manufacturing_cost_per_dozen = Decimal("7.2")
    q.other_cost_per_dozen = Decimal("1.8")
    q.projected_quantity = 0  # per-dozen basis must still work without a quantity
    q.profit_percentage = Decimal("20")  # margin on FOB 20% == markup on cost 25%
    m = _metrics_for_quotation(q)
    assert round(m["cost_per_piece"], 4) == round(23 / 12, 4)
    assert round(m["margin_pct"], 4) == 25.0
    assert round(m["material_ratio"], 4) == round(14 / 23, 4)


# ---------- commission ----------
def test_per_order_fixed_flag_comes_only_from_the_snapshot():
    class _Order:
        def __init__(self, snap):
            self.commercial_snapshot_json = snap

    assert is_per_order_fixed(_Order({"fixed_commission_basis": "PER_ORDER"}))
    assert not is_per_order_fixed(_Order({}))
    assert not is_per_order_fixed(_Order(None))


def test_calculate_amounts_uses_allocated_fixed_gross_instead_of_pieces_times_rate():
    kwargs = dict(
        shipped_value=Decimal("1000"),
        shipped_qty=400,
        rate_type="FIXED",
        rate=Decimal("600"),
        tds_rate_pct=Decimal("0"),
        vds_rate_pct=Decimal("0"),
    )
    legacy = calculate_amounts(**kwargs)  # pieces x rate: 400 x 600
    assert legacy is not None and legacy.gross == Decimal("240000.0000")
    allocated = calculate_amounts(**kwargs, fixed_gross=Decimal("200.0000"))
    assert allocated is not None and allocated.gross == Decimal("200.0000")


async def _ship(db, tenant, order, qty: int, ref: str) -> CommissionShipment:
    s = CommissionShipment(
        tenant_id=tenant.id,
        order_id=order.id,
        shipment_ref=ref,
        shipment_date=date(2026, 11, 25),
        shipped_qty=qty,
        shipped_value=Decimal("1000"),
        currency="USD",
    )
    db.add(s)
    await db.flush()
    return s


async def _receivable_gross(db, tenant, order, shipment) -> Decimal | None:
    entries = await build_entries(db, tenant.id, order, shipment)
    rec = [e for e in entries if e.direction == DIRECTION_RECEIVABLE]
    if not rec:
        return None
    for e in rec:
        db.add(e)
    await db.flush()
    return rec[0].gross_amount


@pytest.mark.asyncio
async def test_fixed_commission_is_recognised_proportionally_and_adds_up_to_the_order_amount(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    order.quantity = 1000
    order.commission_type = "FIXED"
    order.commission_value = Decimal("600")
    order.commercial_snapshot_json = {"fixed_commission_basis": "PER_ORDER"}
    await db.flush()

    first = await _receivable_gross(db, tenant, order, await _ship(db, tenant, order, 333, f"S1-{uuid.uuid4().hex[:4]}"))
    second = await _receivable_gross(db, tenant, order, await _ship(db, tenant, order, 333, f"S2-{uuid.uuid4().hex[:4]}"))
    final = await _receivable_gross(db, tenant, order, await _ship(db, tenant, order, 334, f"S3-{uuid.uuid4().hex[:4]}"))

    assert first == Decimal("199.8000") and second == Decimal("199.8000")
    assert final == Decimal("200.4000")  # the last shipment takes the rounding remainder
    assert first + second + final == Decimal("600.0000")

    # Nothing is left to recognise after the order quantity has shipped.
    extra = await build_entries(db, tenant.id, order, await _ship(db, tenant, order, 10, f"S4-{uuid.uuid4().hex[:4]}"))
    assert [e for e in extra if e.direction == DIRECTION_RECEIVABLE] == []


@pytest.mark.asyncio
async def test_per_order_fixed_commission_never_exceeds_the_order_amount_across_factories(db_session_integration):
    from app.models.inventory import Vendor  # noqa: PLC0415 - only this test needs vendors

    db = db_session_integration
    tenant, _user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    order.quantity = 1000
    order.commission_type = "FIXED"
    order.commission_value = Decimal("600")
    order.commercial_snapshot_json = {"fixed_commission_basis": "PER_ORDER"}
    vendors = []
    for n in (1, 2):
        v = Vendor(tenant_id=tenant.id, vendor_code=f"V{n}-{uuid.uuid4().hex[:5]}", name=f"Factory {n}")
        db.add(v)
        vendors.append(v)
    await db.flush()

    total = Decimal("0")
    for v, ref in zip(vendors, ("F1", "F2")):
        s = await _ship(db, tenant, order, 500, f"{ref}-{uuid.uuid4().hex[:4]}")
        s.vendor_id = v.id  # a different payer each time
        await db.flush()
        total += await _receivable_gross(db, tenant, order, s) or Decimal("0")
    assert total == Decimal("600.0000")


@pytest.mark.asyncio
async def test_legacy_fixed_commission_stays_pieces_times_rate(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    order.quantity = 1000
    order.commission_type = "FIXED"
    order.commission_value = Decimal("0.5")
    await db.flush()  # no snapshot flag: per piece, as before

    gross = await _receivable_gross(db, tenant, order, await _ship(db, tenant, order, 400, f"L1-{uuid.uuid4().hex[:4]}"))
    assert gross == Decimal("200.0000")
