"""Phase 5 finance-constrained scenario (doc 16 D28-D30, 4.6, 15.14, 15.15).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_finance_constrained.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models import ProformaInvoice, ProformaInvoiceOrder
from app.models.commercial import MasterContract
from app.modules.mfg_intelligence import finance_constrained_service as fcs
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_finance_fixtures import add_quotation, set_planning_config
from tests.mfg_forward_fixtures import (
    ADV,
    ADV_FLAGS,
    CASH,
    FP,
    INTEGRATED,
    MI,
    TODAY,
    add_booking,
    add_inquiry,
    add_order,
    adv_tenant,
    base_row,
    dec,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import client_for

URL = f"{FP}/finance-constrained"
FIN_FLAGS = {**ADV_FLAGS, CASH: True, INTEGRATED: True}
PLAN_READ = {"production.planning.read": True}
# quotation: material 6,000 + other 500 USD x 110 for 1,000 pcs -> 100 pcs booking needs 71,500 BDT
CASH_PER_BOOKING = Decimal("71500")


def fake_phase3(closing: str, headroom: str = "0", calls: dict | None = None):
    async def _build(db, tenant, *, date_from, horizon_days, today, planning_math_v2, integrated_planning):
        if calls is not None:
            calls["n"] = calls.get("n", 0) + 1
        n = (horizon_days - 1) // 7 + 1
        return {
            "weeks": [{"week_index": i, "closing": closing} for i in range(n)],
            "facility_headroom": {"amount": headroom, "facilities": 1, "unknown_by_currency": {}},
            "settings": {"btb_usance_days": 120}, "forecast_complete": True, "reason_codes": [], "financing_gap": None,
        }

    return _build


async def _admin(db, tenant):
    return await add_user_with_role(db, tenant, "admin", {})


async def _two_bookings(db, tenant, fx, *, projected: int | None = 1000):
    q1 = await add_quotation(db, tenant, fx.customer, projected=projected)
    q2 = await add_quotation(db, tenant, fx.customer, projected=projected)
    start, end = TODAY + timedelta(days=7), TODAY + timedelta(days=9)
    low = await add_booking(db, tenant, fx, start=start, end=end, qty="100", conf="30", quotation=q1)
    high = await add_booking(db, tenant, fx, start=start, end=end, qty="100", conf="70", quotation=q2)
    return low, high


async def _get(db, tenant, user, **params):
    async with client_for(db, tenant, user) as c:
        r = await c.get(URL, params={"horizon_days": 90, **params})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize(
    "flags",
    [{MI: True, CASH: True}, {MI: True, ADV: True}, {ADV: True, CASH: True}, {MI: True, ADV: "true", CASH: True}],
)
async def test_404_unless_every_flag_is_on(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _role, _fx = await adv_tenant(db, flags=flags)
    admin = await _admin(db, tenant)
    await db.commit()
    async with client_for(db, tenant, admin) as c:
        r = await c.get(URL)
    assert r.status_code == 404 and r.json()["detail"] == "Not found"


@pytest.mark.parametrize("mode", ["off", "shadow", "enforce"])
async def test_finance_gate_denies_planner_in_every_rbac_mode(db_session_integration, monkeypatch, mode):
    monkeypatch.setattr(fcs, "build_cash_requirement", fake_phase3("1000000"))
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags={**FIN_FLAGS, "rbac_enforcement": mode})
    await base_row(db, tenant, fx)
    planner = await add_user_with_role(db, tenant, "planner", dict(PLAN_READ))
    fin_clerk = await add_user_with_role(db, tenant, "fin_clerk", {**PLAN_READ, "finance.access": True})
    analyst = await add_user_with_role(db, tenant, "analyst", {**PLAN_READ, "finance.access": True, "finance.mis_report.view": True})
    admin = await _admin(db, tenant)
    await db.commit()
    for user, expected in ((planner, 403), (fin_clerk, 403), (analyst, 200), (admin, 200)):
        async with client_for(db, tenant, user) as c:
            r = await c.get(URL)
            assert r.status_code == expected, (mode, user.username, r.text)
            # the planner still sees the quantity-only forward plan
            assert (await c.get(FP)).status_code == 200


async def test_real_cash_builder_is_called_exactly_once(db_session_integration, monkeypatch):
    calls = {"n": 0}
    real = fcs.build_cash_requirement

    async def counting(*a, **k):
        calls["n"] += 1
        return await real(*a, **k)

    monkeypatch.setattr(fcs, "build_cash_requirement", counting)
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags=FIN_FLAGS)
    await base_row(db, tenant, fx)
    await _two_bookings(db, tenant, fx)
    admin = await _admin(db, tenant)
    await db.commit()
    body = await _get(db, tenant, admin)
    assert calls["n"] == 1
    assert len(body["weeks"]) == 13 and body["base_currency"] == "BDT"
    for w in body["weeks"]:
        assert w["phase3_closing"].count(".") == 1 and len(w["phase3_closing"].split(".")[1]) == 4


async def test_lowest_confidence_cut_first_and_money_strings(db_session_integration, monkeypatch):
    monkeypatch.setattr(fcs, "build_cash_requirement", fake_phase3("100000"))
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags=FIN_FLAGS)
    await base_row(db, tenant, fx)
    low, high = await _two_bookings(db, tenant, fx)
    await set_planning_config(db, tenant, cpm_override="5")  # a known CPM must not add conversion cash
    admin = await _admin(db, tenant)
    await db.commit()
    body = await _get(db, tenant, admin)
    assert [k["booking_id"] for k in body["kept"]] == [high.id]
    assert [k["booking_id"] for k in body["cut"]] == [low.id]
    assert "FINANCE_CUT" in body["cut"][0]["reason_codes"]
    kept = body["kept"][0]
    assert kept["cash_need"] == "71500.0000" and dec(kept["cash_need"]) == CASH_PER_BOOKING
    assert "CONVERSION_IN_PAYROLL" in kept["reason_codes"] and kept["week_index"] == 1
    week1 = body["weeks"][1]
    assert week1["phase3_closing"] == "100000.0000" and week1["after_kept_tentative"] == "28500.0000"
    assert all(not w["below_zero"] for w in body["weeks"]) and body["confirmed_financing_gap"] is None


async def test_headroom_counts_as_financing(db_session_integration, monkeypatch):
    monkeypatch.setattr(fcs, "build_cash_requirement", fake_phase3("100000", headroom="50000"))
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags=FIN_FLAGS)
    await base_row(db, tenant, fx)
    await _two_bookings(db, tenant, fx)
    admin = await _admin(db, tenant)
    await db.commit()
    body = await _get(db, tenant, admin)
    assert len(body["kept"]) == 2 and body["cut"] == []
    assert body["weeks"][1]["position_with_headroom"] == "7000.0000"
    assert body["facility_headroom"]["amount"] == "50000.0000"


async def test_unknown_cash_need_is_cut(db_session_integration, monkeypatch):
    monkeypatch.setattr(fcs, "build_cash_requirement", fake_phase3("100000000"))
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags=FIN_FLAGS)
    await base_row(db, tenant, fx)
    inq = await add_inquiry(db, tenant, fx.customer)
    only_inquiry = await add_booking(db, tenant, fx, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=8), inquiry=inq)
    q = await add_quotation(db, tenant, fx.customer, projected=None)
    no_projected = await add_booking(db, tenant, fx, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=8), quotation=q)
    admin = await _admin(db, tenant)
    await db.commit()
    body = await _get(db, tenant, admin)
    cut = {c["booking_id"]: c for c in body["cut"]}
    assert set(cut) == {only_inquiry.id, no_projected.id} and body["kept"] == []
    for c in cut.values():
        assert "CASH_NEED_UNKNOWN" in c["reason_codes"] and c["cash_need"] is None
    assert "INQUIRY_ONLY_BOOKING" in cut[only_inquiry.id]["reason_codes"]


def _months_back(day: date, k: int) -> date:
    idx = day.year * 12 + day.month - 1 - k
    return date(idx // 12, idx % 12 + 1, 10)


async def test_confirmed_never_cut_gap_reported_and_forecast_never_funded(db_session_integration, monkeypatch):
    monkeypatch.setattr(fcs, "build_cash_requirement", fake_phase3("100000"))
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags=FIN_FLAGS)
    await base_row(db, tenant, fx)
    for k in range(1, 15):  # 14 months of history -> forecast available
        await add_order(db, tenant, fx.customer, fx.style, status="COMPLETED", qty=400, delivery=_months_back(TODAY, k))
    q = await add_quotation(db, tenant, fx.customer)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=TODAY + timedelta(days=20))
    order.quotation_id = q.id  # material budget 6,000 x 110 x 500 / 1,000 = 330,000 not yet ordered
    await _two_bookings(db, tenant, fx)
    admin = await _admin(db, tenant)
    await db.commit()
    body = await _get(db, tenant, admin)
    item = next(i for i in body["confirmed_material"]["items"] if i["order_id"] == order.id)
    assert item["amount"] == "330000.0000" and item["value_class"] == "ESTIMATED" and "BTB_DEFERRED" not in item["reason_codes"]
    assert body["confirmed_material"]["total"] == "330000.0000"
    assert body["kept"] == [] and len(body["cut"]) == 2  # tentative cut, confirmed kept
    gap = body["confirmed_financing_gap"]
    assert gap is not None and "CONFIRMED_FINANCING_GAP" in body["reason_codes"]
    assert gap["shortfall"] == "230000.0000"
    assert body["forecast_cut"] and all(f["reason_codes"] == ["FORECAST_NOT_FUNDED"] for f in body["forecast_cut"])


@pytest.mark.parametrize(
    "status,expiry_days,deferred",
    [("OPENED", None, True), ("ADVISED", 400, True), ("ACTIVE", None, True), ("APPLIED", None, False),
     ("DRAFT", None, False), ("OPENED", 5, False)],
)
async def test_lc_status_allowlist_and_expiry_decide_btb_deferral(db_session_integration, monkeypatch, status, expiry_days, deferred):
    monkeypatch.setattr(fcs, "build_cash_requirement", fake_phase3("1000000"))
    db = db_session_integration
    tenant, _user, _role, fx = await adv_tenant(db, flags=FIN_FLAGS)
    await base_row(db, tenant, fx)
    q = await add_quotation(db, tenant, fx.customer)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=500, delivery=TODAY + timedelta(days=20))
    order.quotation_id = q.id
    mc = MasterContract(tenant_id=tenant.id, reference=f"MC-{order.id}", status=status, contract_type="EXPORT_LC",
                        amount=Decimal("5000"), btb_utilized_amount=Decimal("1000"), currency="USD",
                        expiry_date=TODAY + timedelta(days=expiry_days) if expiry_days is not None else None)
    db.add(mc)
    await db.flush()
    pi = ProformaInvoice(tenant_id=tenant.id, direction="EXPORT", reference=f"PI-{order.id}", status="ISSUED",
                         master_contract_id=mc.id)
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id))
    admin = await _admin(db, tenant)
    await db.commit()
    body = await _get(db, tenant, admin)
    item = next(i for i in body["confirmed_material"]["items"] if i["order_id"] == order.id)
    # BTB room (5,000 - 1,000) USD x quotation rate 110 = 440,000 BDT covers the 330,000 item
    assert ("BTB_DEFERRED" in item["reason_codes"]) is deferred, item
    if deferred:
        assert item["master_contract_id"] == mc.id and item["due_date"] == (TODAY + timedelta(days=20 + 120)).isoformat()
        assert item["week_index"] is None  # moved beyond the 90-day horizon
    else:
        assert item["week_index"] == 2


def test_lc_opened_on_rule():
    from types import SimpleNamespace

    day = date(2030, 5, 1)
    assert fcs.lc_opened_on(SimpleNamespace(status="opened", expiry_date=None), day)
    assert fcs.lc_opened_on(SimpleNamespace(status="AMENDMENT", expiry_date=day), day)
    assert not fcs.lc_opened_on(SimpleNamespace(status="OPENED", expiry_date=day - timedelta(days=1)), day)
    for bad in ("APPLIED", "DRAFT", "EXPIRED", "CLOSED", None):
        assert not fcs.lc_opened_on(SimpleNamespace(status=bad, expiry_date=None), day), bad
