"""Tentative inquiry / quotation demand and planning settings (Manufacturing Intelligence Phase 2, run R3).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_tentative_demand.py -q -p no:warnings"
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import AuditLog, Inquiry, Order, Quotation, SewingLineStyleConfig, TenantProductionSettings
from app.models.mfg_planning import MfgTentativeLineBooking
from app.modules.inventory.open_po_supply_service import load_open_po_lines
from app.modules.production import tentative_booking_service as tbs
from tests.mfg_alloc_fixtures import ALLOC_FLAGS, add_po, add_vendor, seed_alloc
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)

pytestmark = pytest.mark.asyncio

FLAGS = {**FLAGS_ON, "mfg_integrated_planning_v1": True}
FRIDAY = MONDAY + timedelta(days=4)
WINDOW = {"date_from": "2030-03-04", "date_to": "2030-03-15"}


async def _factory(db, flags=None):
    tenant, user, _ = await new_tenant(db, flags=flags if flags is not None else FLAGS)
    fx = await seed_basic_factory(db, tenant)
    return tenant, user, fx


async def _inquiry(db, tenant, fx, *, style=True) -> Inquiry:
    row = Inquiry(
        tenant_id=tenant.id, customer_id=fx.customer.id, inquiry_code=f"INQ-{uuid.uuid4().hex[:8]}",
        style_id=fx.style.id if style else None, status="OPEN",
    )
    db.add(row)
    await db.flush()
    return row


async def _quotation(db, tenant, fx, inquiry=None, *, superseded=False) -> Quotation:
    row = Quotation(
        tenant_id=tenant.id, customer_id=fx.customer.id, inquiry_id=inquiry.id if inquiry else None,
        quotation_code=f"Q-{uuid.uuid4().hex[:8]}", style_id=fx.style.id, status="NEW",
        superseded_at=datetime.utcnow() if superseded else None,
    )
    db.add(row)
    await db.flush()
    return row


async def _order_for(db, tenant, fx, quotation) -> Order:
    row = Order(
        tenant_id=tenant.id, customer_id=fx.customer.id, quotation_id=quotation.id, style_id=fx.style.id,
        order_code=f"O-{uuid.uuid4().hex[:8]}", status="NEW", quantity=100,
    )
    db.add(row)
    await db.flush()
    return row


def _book(db, tenant, line, *, inquiry=None, quotation=None, qty="500", conf="40", expires_days=30,
          start=MONDAY, end=FRIDAY, status="ACTIVE", smv="12.5", fx=None) -> MfgTentativeLineBooking:
    row = MfgTentativeLineBooking(
        tenant_id=tenant.id, line_id=line.id, inquiry_id=inquiry.id if inquiry else None,
        quotation_id=quotation.id if quotation else None, style_id=fx.style.id if fx else None,
        ob_id=fx.ob.id if fx else None, start_date=start, planned_end_date=end, planned_qty=Decimal(qty),
        smv_per_piece=Decimal(smv), confidence_pct=Decimal(conf),
        expires_at=datetime.utcnow() + timedelta(days=expires_days), status=status,
    )
    db.add(row)
    return row


def _payload(**kw):
    base = {"line_id": None, "start_date": "2030-03-04", "planned_end_date": "2030-03-08", "planned_qty": "1000",
            "confidence_pct": "40"}
    base.update(kw)
    return base


# ------------------------------------------------------------------ create / update / cancel


async def test_create_resolves_smv_and_reports_weighted_minutes(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{API}/tentative-bookings", json=_payload(line_id=fx.line.id, inquiry_id=inq.id))
        assert r.status_code == 201, r.text
        out = r.json()
        assert out["inquiry_id"] == inq.id and out["quotation_id"] is None and out["status"] == "ACTIVE"
        assert out["smv_per_piece"] == "12.5000" and out["smv_source"] == "STYLE_APPROVED_OB"
        assert out["total_smv_minutes"] == "12500.00"
        assert out["confidence_pct"] == "40.00" and out["weighted_smv_minutes"] == "5000.00"
        assert out["counted"] is True and out["not_counted_reason"] is None
        assert out["style_id"] == fx.style.id  # defaulted from the inquiry
        listing = (await c.get(f"{API}/tentative-demand")).json()
        assert listing["total"] == 1 and listing["counted_count"] == 1
        assert listing["counted_weighted_smv_minutes"] == "5000.00"
    audit = (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id, AuditLog.action.like("mfg_tentative%")))).scalars().all()
    assert audit == ["mfg_tentative_booking.create"]


async def test_create_validation(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    quo = await _quotation(db, tenant, fx)
    await db.commit()
    ok = _payload(line_id=fx.line.id, inquiry_id=inq.id)
    soon = (datetime.utcnow() + timedelta(days=10)).isoformat()
    cases = {
        "both demands": {**ok, "quotation_id": quo.id},
        "no demand": {k: v for k, v in ok.items() if k != "inquiry_id"},
        "no confidence and no default": {k: v for k, v in ok.items() if k != "confidence_pct"},
        "confidence over 100": {**ok, "confidence_pct": "101"},
        "confidence negative": {**ok, "confidence_pct": "-1"},
        "zero qty": {**ok, "planned_qty": "0"},
        "end before start": {**ok, "start_date": "2030-03-10", "planned_end_date": "2030-03-04"},
        "expiry in the past": {**ok, "expires_at": (datetime.utcnow() - timedelta(days=1)).isoformat()},
        "expiry beyond 180 days": {**ok, "expires_at": (datetime.utcnow() + timedelta(days=181)).isoformat()},
        "unknown field": {**ok, "bogus": 1},
    }
    async with client_for(db, tenant, user) as c:
        for name, body in cases.items():
            r = await c.post(f"{API}/tentative-bookings", json=body)
            assert r.status_code == 422, (name, r.status_code, r.text)
        assert (await c.post(f"{API}/tentative-bookings", json={**ok, "expires_at": soon})).status_code == 201


async def test_default_probability_and_expiry_come_from_settings(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    quo = await _quotation(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = _payload(line_id=fx.line.id, quotation_id=quo.id)
        del body["confidence_pct"]
        assert (await c.post(f"{API}/tentative-bookings", json=body)).status_code == 422
        put = await c.put(
            f"{API}/planning-settings",
            json={"stage_probability": {"QUOTATION": "65.5"}, "tentative_default_expiry_days": 10},
        )
        assert put.status_code == 200, put.text
        r = await c.post(f"{API}/tentative-bookings", json=body)
        assert r.status_code == 201, r.text
        assert r.json()["confidence_pct"] == "65.50"
        exp = datetime.fromisoformat(r.json()["expires_at"])
        assert timedelta(days=9) < exp - datetime.utcnow() <= timedelta(days=10, minutes=1)


async def test_cross_tenant_ids_are_404(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    t2, u2, fx2 = await _factory(db)
    inq2 = await _inquiry(db, t2, fx2)
    quo2 = await _quotation(db, t2, fx2)
    inq = await _inquiry(db, tenant, fx)
    foreign_booking = _book(db, t2, fx2.line, inquiry=inq2, fx=fx2)
    await db.commit()
    ok = _payload(line_id=fx.line.id, inquiry_id=inq.id)
    bad = [
        {**ok, "inquiry_id": inq2.id},
        {k: v for k, v in {**ok, "quotation_id": quo2.id}.items() if k != "inquiry_id"},
        {**ok, "line_id": fx2.line.id},
        {**ok, "style_id": fx2.style.id},
        {**ok, "ob_id": fx2.ob.id},
        {**ok, "shift_id": fx2.shift.id},
    ]
    async with client_for(db, tenant, user) as c:
        for body in bad:
            r = await c.post(f"{API}/tentative-bookings", json=body)
            assert r.status_code == 404, (body, r.status_code, r.text)
        assert (await c.patch(f"{API}/tentative-bookings/{foreign_booking.id}", json={"notes": "x"})).status_code == 404
        assert (await c.post(f"{API}/tentative-bookings/{foreign_booking.id}/cancel")).status_code == 404
        assert (await c.get(f"{API}/tentative-demand")).json()["total"] == 0


async def test_update_cancel_and_stale_version(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        created = (await c.post(f"{API}/tentative-bookings", json=_payload(line_id=fx.line.id, inquiry_id=inq.id))).json()
        bid = created["id"]
        r = await c.patch(f"{API}/tentative-bookings/{bid}", json={"confidence_pct": "70", "expected_lock_version": 0})
        assert r.status_code == 200 and r.json()["confidence_pct"] == "70.00" and r.json()["lock_version"] == 1
        assert r.json()["weighted_smv_minutes"] == "8750.00"
        stale = await c.patch(f"{API}/tentative-bookings/{bid}", json={"confidence_pct": "10", "expected_lock_version": 0})
        assert stale.status_code == 409
        assert (await c.patch(f"{API}/tentative-bookings/{bid}", json={})).status_code == 422
        assert (await c.patch(f"{API}/tentative-bookings/{bid}", json={"line_id": None})).status_code == 422
        first = await c.post(f"{API}/tentative-bookings/{bid}/cancel")
        assert first.status_code == 200 and first.json()["status"] == "CANCELLED" and first.json()["changed"] is True
        again = await c.post(f"{API}/tentative-bookings/{bid}/cancel")
        assert again.status_code == 200 and again.json()["changed"] is False
        assert (await c.patch(f"{API}/tentative-bookings/{bid}", json={"notes": "x"})).status_code == 409
        listing = (await c.get(f"{API}/tentative-demand")).json()
        assert listing["counted_count"] == 0 and listing["items"][0]["counted"] is False


# ------------------------------------------------------------------ dedupe / convert / expire


async def test_demand_is_never_counted_twice(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    quo_old = await _quotation(db, tenant, fx, inq, superseded=True)
    quo_cur = await _quotation(db, tenant, fx, inq)
    b_inq = _book(db, tenant, fx.line, inquiry=inq, fx=fx)
    b_old = _book(db, tenant, fx.line, quotation=quo_old, fx=fx)
    b_cur = _book(db, tenant, fx.line, quotation=quo_cur, fx=fx)
    lone_inq = await _inquiry(db, tenant, fx)
    b_lone = _book(db, tenant, fx.line, inquiry=lone_inq, fx=fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        items = {i["id"]: i for i in (await c.get(f"{API}/tentative-demand")).json()["items"]}
        assert items[b_cur.id]["counted"] is True
        assert items[b_inq.id]["not_counted_reason"] == "QUOTATION_BOOKING_EXISTS"
        assert items[b_old.id]["not_counted_reason"] == "SUPERSEDED_QUOTATION"
        assert items[b_lone.id]["counted"] is True
        total = (await c.get(f"{API}/tentative-demand")).json()
        assert total["counted_count"] == 2
        # an order now exists for the current quotation: everything of that chain stops counting
        order = await _order_for(db, tenant, fx, quo_cur)
        await db.commit()
        items = {i["id"]: i for i in (await c.get(f"{API}/tentative-demand")).json()["items"]}
        assert items[b_cur.id]["not_counted_reason"] == "CONVERTED" and items[b_cur.id]["converted_order_id"] == order.id
        assert items[b_inq.id]["not_counted_reason"] == "CONVERTED"
        assert items[b_old.id]["not_counted_reason"] == "CONVERTED"
        assert items[b_lone.id]["counted"] is True
        # the status is made explicit by the conversion helper
        changed = await tbs.convert_ordered_bookings(db, tenant.id)
        await db.commit()
        assert changed == 3
        for b in (b_inq, b_old, b_cur):
            await db.refresh(b)
            assert b.status == "CONVERTED" and b.converted_order_id == order.id
        await db.refresh(b_lone)
        assert b_lone.status == "ACTIVE"
        # a new booking for the ordered quotation is refused
        r = await c.post(f"{API}/tentative-bookings", json=_payload(line_id=fx.line.id, quotation_id=quo_cur.id))
        assert r.status_code == 409


async def test_expired_bookings_are_not_counted_and_the_job_helper_marks_them(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    inq2 = await _inquiry(db, tenant, fx)
    old = _book(db, tenant, fx.line, inquiry=inq, expires_days=-2, fx=fx)
    live = _book(db, tenant, fx.line, inquiry=inq2, expires_days=5, fx=fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        items = {i["id"]: i for i in (await c.get(f"{API}/tentative-demand")).json()["items"]}
        assert items[old.id]["not_counted_reason"] == "EXPIRED" and items[old.id]["counted"] is False
        assert items[live.id]["counted"] is True
        cap = (await c.get(f"{API}/line-loading", params=WINDOW)).json()
        soft = {d["date"]: Decimal(d["soft_smv_minutes"]) for d in cap["line_days"] if d["line_id"] == fx.line.id}
        assert soft[str(MONDAY)] == Decimal("1250.00")  # only the live booking (6,250 minutes / 5 days)
    assert await tbs.expire_due_bookings(db, tenant.id) == 1
    await db.refresh(old)
    await db.refresh(live)
    assert old.status == "EXPIRED" and live.status == "ACTIVE"


# ------------------------------------------------------------------ Phase 1 readers


async def _phase1_snapshot(c):
    out = {}
    for name in ("capacity", "line-loading", "summary"):
        r = await c.get(f"{API}/{name}", params=WINDOW)
        assert r.status_code == 200, (name, r.text)
        out[name] = r.json()
    return out


async def _seed_firm_plan(db, tenant, fx):
    order = await add_order(db, tenant, fx.customer, fx.style, status="CONFIRMED", qty=1000, delivery=date(2030, 4, 30))
    await add_plan(db, tenant, fx.line, start=MONDAY, end=FRIDAY, qty="1000", order=order, style=fx.style, ob=fx.ob,
                   shift=fx.shift, rs="FIRM_BOOKED")
    return order


async def test_flag_off_phase1_output_is_identical_with_tentative_rows_present(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db, flags=dict(FLAGS_ON))  # integrated flag OFF
    order = await _seed_firm_plan(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        before = await _phase1_snapshot(c)
        pred_before = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    inq = await _inquiry(db, tenant, fx)
    _book(db, tenant, fx.line, inquiry=inq, qty="3000", conf="90", fx=fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        after = await _phase1_snapshot(c)
        pred_after = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    assert after == before
    assert pred_after == pred_before


async def test_flag_off_legacy_line_booking_readers_do_not_see_tentative_rows(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db, flags=dict(FLAGS_ON))
    await _seed_firm_plan(db, tenant, fx)
    await db.commit()
    count_before = (await db.execute(select(func.count()).select_from(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant.id))).scalar_one()
    async with client_for(db, tenant, user) as c:
        board_before = await c.get("/api/v1/production/plan-board", params={"from_date": "2030-03-04", "to_date": "2030-03-15"})
        assert board_before.status_code == 200, board_before.text
    inq = await _inquiry(db, tenant, fx)
    _book(db, tenant, fx.line, inquiry=inq, qty="3000", conf="90", fx=fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        board_after = await c.get("/api/v1/production/plan-board", params={"from_date": "2030-03-04", "to_date": "2030-03-15"})
    assert board_after.status_code == 200
    assert board_after.json() == board_before.json()
    count_after = (await db.execute(select(func.count()).select_from(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant.id))).scalar_one()
    assert count_after == count_before  # tentative demand never lands in sewing_line_style_configs


async def test_flag_on_adds_soft_load_only_and_firm_availability_is_unchanged(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    order = await _seed_firm_plan(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        before = await _phase1_snapshot(c)
        pred_before = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    inq = await _inquiry(db, tenant, fx)
    _book(db, tenant, fx.line, inquiry=inq, qty="500", conf="40", fx=fx)  # 6,250 minutes over 5 working days
    await db.commit()
    async with client_for(db, tenant, user) as c:
        after = await _phase1_snapshot(c)
        pred_after = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()

    def days(snap):
        return {d["date"]: d for lc in snap["capacity"]["lines"] for d in lc["days"]}

    b_days, a_days = days(before), days(after)
    for day, b in b_days.items():
        a = a_days[day]
        assert a["firm_smv_minutes"] == b["firm_smv_minutes"], day
        assert a["practical_smv_minutes"] == b["practical_smv_minutes"], day
        assert a["status"] == b["status"], day
    assert Decimal(a_days["2030-03-04"]["soft_smv_minutes"]) - Decimal(b_days["2030-03-04"]["soft_smv_minutes"]) == Decimal("1250.00")
    assert a_days["2030-03-09"]["soft_smv_minutes"] == b_days["2030-03-09"]["soft_smv_minutes"]  # weekend
    # the line-loading line-days carry the added soft load too, and tentative rows are never listed as plan rows
    ll_a = {d["date"]: d for d in after["line-loading"]["line_days"]}
    ll_b = {d["date"]: d for d in before["line-loading"]["line_days"]}
    assert Decimal(ll_a["2030-03-05"]["soft_smv_minutes"]) - Decimal(ll_b["2030-03-05"]["soft_smv_minutes"]) == Decimal("1250.00")
    assert ll_a["2030-03-05"]["firm_smv_minutes"] == ll_b["2030-03-05"]["firm_smv_minutes"]
    assert after["line-loading"]["rows"] == before["line-loading"]["rows"]
    assert pred_after == pred_before  # delivery uses firm availability only


# ------------------------------------------------------------------ planning settings


async def test_get_planning_settings_never_inserts_and_returns_defaults(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=dict(FLAGS))  # no production settings row at all
    await db.commit()
    count = select(func.count()).select_from(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant.id)
    assert (await db.execute(count)).scalar_one() == 0
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/planning-settings")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "stage_probability": {"INQUIRY": None, "QUOTATION": None},
        "tentative_default_expiry_days": 30,
        "receipt_buffer_days": 0,
        "is_default": True,
    }
    assert (await db.execute(count)).scalar_one() == 0
    assert not db.new


async def test_put_planning_settings_validates_merges_and_audits(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=dict(FLAGS))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for body in (
            {"stage_probability": {"INQUIRY": "101"}},
            {"stage_probability": {"INQUIRY": "-1"}},
            {"stage_probability": {"OTHER": "5"}},
            {"tentative_default_expiry_days": 0},
            {"tentative_default_expiry_days": 181},
            {"receipt_buffer_days": -1},
            {"receipt_buffer_days": 61},
            {"unknown": 1},
        ):
            r = await c.put(f"{API}/planning-settings", json=body)
            assert r.status_code == 422, (body, r.status_code, r.text)
        first = await c.put(f"{API}/planning-settings", json={"stage_probability": {"INQUIRY": "25"}, "receipt_buffer_days": 4})
        assert first.status_code == 200, first.text
        second = await c.put(f"{API}/planning-settings", json={"stage_probability": {"QUOTATION": "60"}, "tentative_default_expiry_days": 45})
        assert second.status_code == 200
        got = (await c.get(f"{API}/planning-settings")).json()
    assert got == {
        "stage_probability": {"INQUIRY": "25.00", "QUOTATION": "60.00"},
        "tentative_default_expiry_days": 45,
        "receipt_buffer_days": 4,
        "is_default": False,
    }
    audit = (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "mfg_planning_settings.update"))).scalars().all()
    assert len(audit) == 2


async def test_receipt_buffer_days_shifts_open_po_eta(db_session_integration):
    db = db_session_integration
    ns = await seed_alloc(db, flags={**ALLOC_FLAGS, "mfg_integrated_planning_v1": True}, stock="0", qty=10)
    vendor = await add_vendor(db, ns.tenant)
    _po, _line = await add_po(db, ns.tenant, vendor, ns.fab, "500", expected_date=date(2030, 5, 1))
    await db.commit()
    lines = await load_open_po_lines(db, ns.tenant.id, [ns.fab.id])
    assert lines[0].expected_date == date(2030, 5, 1)
    async with client_for(db, ns.tenant, ns.user) as c:
        assert (await c.put(f"{API}/planning-settings", json={"receipt_buffer_days": 3})).status_code == 200
    lines = await load_open_po_lines(db, ns.tenant.id, [ns.fab.id])
    assert lines[0].expected_date == date(2030, 5, 4)
    # an explicit argument still wins over the setting
    lines = await load_open_po_lines(db, ns.tenant.id, [ns.fab.id], receipt_buffer_days=0)
    assert lines[0].expected_date == date(2030, 5, 1)


async def test_tentative_and_settings_permissions_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    from tests.mfg_alloc_fixtures import add_user_with_role

    tenant, user, fx = await _factory(db, flags={**FLAGS, "rbac_enforcement": "enforce"})
    inq = await _inquiry(db, tenant, fx)
    reader = await add_user_with_role(db, tenant, "reader", {"production.planning.read": True})
    writer = await add_user_with_role(
        db, tenant, "writer", {"production.planning.read": True, "production.planning.write": True}
    )
    await db.commit()
    body = _payload(line_id=fx.line.id, inquiry_id=inq.id)
    async with client_for(db, tenant, reader) as c:
        assert (await c.get(f"{API}/tentative-demand")).status_code == 200
        assert (await c.get(f"{API}/planning-settings")).status_code == 200
        assert (await c.post(f"{API}/tentative-bookings", json=body)).status_code == 403
        assert (await c.patch(f"{API}/tentative-bookings/1", json={"notes": "x"})).status_code == 403
        assert (await c.post(f"{API}/tentative-bookings/1/cancel")).status_code == 403
    async with client_for(db, tenant, writer) as c:
        assert (await c.post(f"{API}/tentative-bookings", json=body)).status_code == 201
        assert (await c.put(f"{API}/planning-settings", json={"receipt_buffer_days": 1})).status_code == 403


async def test_flag_off_hides_tentative_endpoints(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db, flags=dict(FLAGS_ON))
    inq = await _inquiry(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.post(f"{API}/tentative-bookings", json=_payload(line_id=fx.line.id, inquiry_id=inq.id))).status_code == 404
        assert (await c.patch(f"{API}/tentative-bookings/1", json={"notes": "x"})).status_code == 404
        assert (await c.post(f"{API}/tentative-bookings/1/cancel")).status_code == 404
        assert (await c.put(f"{API}/planning-settings", json={"receipt_buffer_days": 1})).status_code == 404


# ------------------------------------------------------------------ security review round 1


async def test_delete_guards_block_lines_inquiries_and_quotations_with_tentative_bookings(db_session_integration):
    from fastapi import HTTPException

    from app.common.delete_guards import (
        ensure_inquiry_deletable,
        ensure_quotation_deletable,
        ensure_sewing_line_deletable,
    )

    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    quo = await _quotation(db, tenant, fx)
    _book(db, tenant, fx.line, inquiry=inq, fx=fx, status="CANCELLED")
    _book(db, tenant, fx.line, quotation=quo, fx=fx, status="EXPIRED")
    await db.flush()
    for guard, rid in (
        (ensure_sewing_line_deletable, fx.line.id),
        (ensure_inquiry_deletable, inq.id),
        (ensure_quotation_deletable, quo.id),
    ):
        with pytest.raises(HTTPException) as exc:
            await guard(db, tenant.id, rid)
        assert exc.value.status_code == 409
        assert "tentative line bookings" in exc.value.detail
    # another tenant's bookings never block this tenant's delete
    t2, _u2, fx2 = await _factory(db)
    await ensure_sewing_line_deletable(db, t2.id, fx2.line.id)


async def test_timezone_aware_expiry_is_accepted(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await _factory(db)
    inq = await _inquiry(db, tenant, fx)
    await db.commit()
    expires = (datetime.utcnow() + timedelta(days=10)).replace(microsecond=0).isoformat() + "Z"
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{API}/tentative-bookings", json=_payload(line_id=fx.line.id, inquiry_id=inq.id, expires_at=expires))
        assert r.status_code == 201, r.text
        bid = r.json()["id"]
        r = await c.patch(f"{API}/tentative-bookings/{bid}", json={"expires_at": expires})
        assert r.status_code == 200, r.text


async def test_first_settings_save_keeps_the_default_weekend(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.put(f"{API}/planning-settings", json={"receipt_buffer_days": 2})).status_code == 200
    row = (
        await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant.id))
    ).scalar_one()
    assert row.weekend_days == ["saturday", "sunday"]


async def test_receipt_buffer_is_ignored_when_the_integrated_flag_is_off(db_session_integration):
    from app.modules.production.planning_settings_service import get_receipt_buffer_days

    db = db_session_integration
    tenant, user, fx = await _factory(db)
    async with client_for(db, tenant, user) as c:
        assert (await c.put(f"{API}/planning-settings", json={"receipt_buffer_days": 5})).status_code == 200
    assert await get_receipt_buffer_days(db, tenant.id) == 5
    tenant.feature_flags = {**tenant.feature_flags, "mfg_integrated_planning_v1": False}
    await db.flush()
    assert await get_receipt_buffer_days(db, tenant.id) == 0
