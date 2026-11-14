"""Management Performance API: flag, fail-closed money gate, owner scope, cross-tenant 404, budget 409, exception and
revision workflows (four-eyes, replay), reads never write, accounting profit = Profit & Loss, finished goods.

Run: docker compose exec -T backend sh -c "pytest tests/test_mgmt_performance_api.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.common.business_date import today_local
from app.models import AuditLog, BudgetLine
from app.models.mgmt_performance import BudgetException, BudgetExceptionAction, BudgetLineRevision
from tests.mgmt_performance_fixtures import (
    API,
    FLAG,
    VIEW,
    add_manager,
    add_user,
    budget,
    cash_account,
    client_for,
    cost_center,
    expense_account,
    mp_tenant,
    spend,
)

D = Decimal
READS = ["/summary", "/budget-forecast", "/fg-contribution", "/targets", "/setup/category-map", "/setup/thresholds",
         "/setup/targets", "/setup/cost-center-owners", "/exceptions", "/revisions", "/access"]


async def _company(db, *, flags=None):
    """Tenant with: utilities spend 900 of a 1000 budget this month on an owned cost centre, payroll budget too."""
    tenant, plain, _ = await mp_tenant(db, flags=flags)
    today = today_local(tenant)
    owner = await add_user(db, tenant, {})
    manager = await add_manager(db, tenant)
    cash = await cash_account(db, tenant)
    util = await expense_account(db, tenant, "UTILITIES")
    pay = await expense_account(db, tenant, "PAYROLL")
    cc = await cost_center(db, tenant, owner=owner)
    other_cc = await cost_center(db, tenant)
    month = f"{today.year:04d}-{today.month:02d}"
    b, lines = await budget(db, tenant, [(cc, util, month, "1000"), (cc, pay, month, "5000"), (other_cc, util, month, "10")],
                            fiscal_year=str(today.year))
    await spend(db, tenant, util, cash, today.replace(day=1), "1100", cc=cc)  # FAILED: actual > budget
    await spend(db, tenant, pay, cash, today.replace(day=1), "100", cc=cc)
    await db.commit()
    return dict(tenant=tenant, plain=plain, owner=owner, manager=manager, cc=cc, other_cc=other_cc, util=util,
                budget=b, lines=lines, month=month, today=today)


async def test_every_endpoint_is_404_with_flag_off(db_session_integration):
    db = db_session_integration
    for flags in ({}, {FLAG: "true"}, {FLAG: 1}):
        s = await _company(db, flags=flags)
        async with client_for(db, s["tenant"], s["manager"]) as c:
            for path in READS + ["/cash"]:
                assert (await c.get(API + path)).status_code == 404, path
            assert (await c.post(API + "/exceptions/scan")).status_code == 404


async def test_money_is_fail_closed_and_owner_sees_only_own_rows(db_session_integration):
    db = db_session_integration
    s = await _company(db)
    async with client_for(db, s["tenant"], s["plain"]) as c:  # no key, owns nothing
        for path in ["/summary", "/budget-forecast", "/fg-contribution", "/targets", "/cash", "/setup/category-map"]:
            assert (await c.get(API + path)).status_code == 403, path
        assert (await c.get(API + "/access")).json()["allowed"] is False
    viewer = await add_user(db, s["tenant"], VIEW)
    await db.commit()
    async with client_for(db, s["tenant"], viewer) as c:
        r = await c.get(API + "/budget-forecast")
        assert r.status_code == 200
        assert {row["cost_center_id"] for row in r.json()["rows"]} == {s["cc"].id, s["other_cc"].id}
        assert (await c.put(API + "/setup/thresholds", json={"items": []})).status_code == 403  # view is not setup
    async with client_for(db, s["tenant"], s["owner"]) as c:
        assert (await c.get(API + "/summary")).status_code == 403
        body = (await c.get(API + "/budget-forecast")).json()
        assert body["scope"] == "own_cost_centres"
        assert {row["cost_center_id"] for row in body["rows"]} == {s["cc"].id}
        payroll = [row for row in body["rows"] if row["category"] == "PAYROLL"][0]
        assert payroll["restricted"] is True and payroll["actual"] is None  # no hr.payroll.manage
        assert body["payroll"] is None and body["unmapped"] == []
        open_rows = [row for row in body["rows"] if not row["restricted"]]
        assert D(body["totals"]["actual"]) == sum(D(row["actual"]) for row in open_rows)  # payroll not recoverable
        assert D(body["totals"]["budget"]) == D("1000")
        exceptions = (await c.get(API + "/exceptions")).json()
        assert all(i["cost_center_id"] == s["cc"].id for i in exceptions["items"])
        r = await c.post(API + "/revisions", json={"request_id": "own-pay-01", "kind": "CHANGE", "budget_line_id": s["lines"][1].id,
                                                   "new_amount": "9999", "reason": "More staff"})
        assert r.status_code == 201 and r.json()["restricted"] is True and r.json()["old_amount"] is None
        listed = (await c.get(API + "/revisions")).json()["items"]
        assert listed and all(i["new_amount"] is None for i in listed if i["budget_line_id"] == s["lines"][1].id)


async def test_reads_never_write_and_profit_matches_profit_and_loss(db_session_integration):
    from app.modules.finance.statements.profit_loss_service import build_profit_loss

    db = db_session_integration
    s = await _company(db)
    before = [await db.scalar(select(func.count()).select_from(m)) for m in (BudgetException, BudgetLineRevision, AuditLog)]
    async with client_for(db, s["tenant"], s["manager"]) as c:
        for path in READS:
            assert (await c.get(API + path)).status_code == 200, path
        summary = (await c.get(API + "/summary")).json()
    after = [await db.scalar(select(func.count()).select_from(m)) for m in (BudgetException, BudgetLineRevision, AuditLog)]
    assert before == after
    start = s["today"].replace(day=1)
    pl = await build_profit_loss(db, s["tenant"], from_date=start, to_date=date.fromisoformat(summary["period"]["end"]))
    signed = pl.profit_and_loss.nett_result.amount * (1 if pl.profit_and_loss.nett_result.kind == "profit" else -1)
    assert D(summary["accounting_profit"]["nett_result"]) == D(signed).quantize(D("0.0001"))
    assert summary["accounting_profit"]["value_class"] == "ACTUAL"
    assert isinstance(summary["opex"]["actual"], str)  # money is a decimal string


async def test_final_budget_put_and_delete_are_blocked_only_with_flag_on(db_session_integration):
    db = db_session_integration
    s = await _company(db)
    payload = {"budget_name": "x", "fiscal_year": str(s["today"].year), "status": "FINAL", "lines": []}
    async with client_for(db, s["tenant"], s["manager"]) as c:
        assert (await c.put(f"/api/v1/finance/budgets/{s['budget'].id}", json=payload)).status_code == 409
        assert (await c.delete(f"/api/v1/finance/budgets/{s['budget'].id}")).status_code == 409
        draft = (await c.post("/api/v1/finance/budgets", json={**payload, "status": "DRAFT"})).json()
        assert (await c.put(f"/api/v1/finance/budgets/{draft['id']}", json=payload)).status_code == 200  # DRAFT -> FINAL
    off = await _company(db, flags={})
    async with client_for(db, off["tenant"], off["manager"]) as c:
        assert (await c.put(f"/api/v1/finance/budgets/{off['budget'].id}", json=payload)).status_code == 200


async def test_exception_workflow_four_eyes_and_replay(db_session_integration):
    db = db_session_integration
    s = await _company(db)
    finance = await add_user(db, s["tenant"], {"finance.budget.exception.review": True})
    director = await add_user(db, s["tenant"], {"finance.budget.exception.approve": True})
    await db.commit()
    async with client_for(db, s["tenant"], s["owner"]) as c:
        assert (await c.post(API + "/exceptions/scan")).status_code == 403
    async with client_for(db, s["tenant"], s["manager"]) as c:
        first = (await c.post(API + "/exceptions/scan")).json()
        again = (await c.post(API + "/exceptions/scan")).json()
    assert first["created"] >= 1 and again["created"] == 0
    exc = (await db.execute(select(BudgetException).where(
        BudgetException.tenant_id == s["tenant"].id, BudgetException.cost_center_id == s["cc"].id,
        BudgetException.category == "UTILITIES"))).scalar_one()
    assert exc.severity == "FAILED" and exc.status == "OPEN"
    url = f"{API}/exceptions/{exc.id}"
    answer = {"request_id": "resp-0001", "reason": "Generator diesel", "corrective_action": "Fix the grid line", "revised_forecast": "1200"}
    async with client_for(db, s["tenant"], finance) as c:
        assert (await c.post(url + "/respond", json={**answer, "request_id": "resp-x001"})).status_code == 403  # not the owner
    async with client_for(db, s["tenant"], s["owner"]) as c:
        r1 = (await c.post(url + "/respond", json=answer)).json()
        r2 = (await c.post(url + "/respond", json=answer)).json()
        assert r1["status"] == "RESPONDED" and r1["replay"] is False and r2["replay"] is True
        assert (await c.post(url + "/review", json={"request_id": "rev-own01"})).status_code == 403
    async with client_for(db, s["tenant"], finance) as c:
        assert (await c.post(url + "/review", json={"request_id": "rev-00001", "note": "ok"})).json()["status"] == "REVIEWED"
        assert (await c.post(url + "/approve", json={"request_id": "apr-fin01"})).status_code == 403  # reviewer cannot decide
    async with client_for(db, s["tenant"], director) as c:
        assert (await c.post(url + "/approve", json={"request_id": "apr-00001"})).json()["status"] == "APPROVED"
    actions = await db.scalar(select(func.count()).select_from(BudgetExceptionAction).where(BudgetExceptionAction.exception_id == exc.id))
    assert actions == 3
    audit = await db.scalar(select(func.count()).select_from(AuditLog).where(
        AuditLog.tenant_id == s["tenant"].id, AuditLog.action.like("MGMT_BUDGET_EXCEPTION_%")))
    assert audit == 3
    async with client_for(db, s["tenant"], s["manager"]) as c:
        await c.post(API + "/exceptions/scan")
    await db.refresh(exc)
    assert exc.status == "APPROVED"  # same severity never re-opens or duplicates
    async with client_for(db, s["tenant"], finance) as c:  # another user reusing someone's request id
        assert (await c.post(url + "/respond", json=answer)).status_code == 409


async def test_higher_severity_reopens_an_answered_exception(db_session_integration):
    from datetime import datetime

    from app.modules.finance.mgmt_performance.exception_service import _upsert

    db = db_session_integration
    s = await _company(db)
    now = datetime.utcnow()
    kw = dict(month="2030-03", cc=s["cc"].id, category="UTILITIES", account_id=None, family="BUDGET",
              budget=D("1"), actual=D("1"), forecast=D("1"), now=now)
    assert await _upsert(db, s["tenant"].id, severity="WARNING", **kw) == "created"
    row = (await db.execute(select(BudgetException).where(BudgetException.tenant_id == s["tenant"].id,
                                                          BudgetException.period_month == "2030-03"))).scalar_one()
    row.status = "APPROVED"
    await db.flush()
    assert await _upsert(db, s["tenant"].id, severity="WARNING", **kw) == "updated"
    assert row.status == "APPROVED"
    assert await _upsert(db, s["tenant"].id, severity="FAILED", **kw) == "escalated"
    assert row.status == "OPEN" and row.severity == "FAILED" and row.escalated_at is not None
    n = await db.scalar(select(func.count()).select_from(BudgetException).where(BudgetException.period_month == "2030-03",
                                                                               BudgetException.tenant_id == s["tenant"].id))
    assert n == 1


async def test_cross_tenant_ids_look_not_found(db_session_integration):
    db = db_session_integration
    a = await _company(db)
    b = await _company(db)
    async with client_for(db, a["tenant"], a["manager"]) as c:
        await c.post(API + "/exceptions/scan")
    exc_a = (await db.execute(select(BudgetException).where(BudgetException.tenant_id == a["tenant"].id))).scalars().first()
    async with client_for(db, b["tenant"], b["manager"]) as c:
        r = await c.post(f"{API}/exceptions/{exc_a.id}/respond", json={"request_id": "xt-000001", "reason": "abc", "corrective_action": "abc"})
        assert r.status_code == 404
        r = await c.post(API + "/revisions", json={"request_id": "xt-000002", "kind": "CHANGE", "budget_line_id": a["lines"][0].id,
                                                   "new_amount": "5", "reason": "abcd"})
        assert r.status_code == 404
        r = await c.put(API + "/setup/cost-center-owners", json={"cost_center_id": a["cc"].id, "owner_user_id": None})
        assert r.status_code == 404
        r = await c.put(API + "/setup/category-map", json={"items": [{"account_id": a["util"].id, "category": "ADMIN"}]})
        assert r.status_code == 404
        r = await c.put(API + "/setup/cost-center-owners", json={"cost_center_id": b["cc"].id, "owner_user_id": a["owner"].id})
        assert r.status_code == 404


async def test_budget_revision_four_eyes_applies_once(db_session_integration):
    db = db_session_integration
    s = await _company(db)
    line = s["lines"][0]
    body = {"request_id": "rev-req-01", "kind": "CHANGE", "budget_line_id": line.id, "new_amount": "1500", "reason": "Summer tariff"}
    async with client_for(db, s["tenant"], s["plain"]) as c:
        assert (await c.post(API + "/revisions", json={**body, "request_id": "rev-req-x1"})).status_code == 403
    async with client_for(db, s["tenant"], s["owner"]) as c:
        first = await c.post(API + "/revisions", json=body)
        second = await c.post(API + "/revisions", json=body)
    assert first.status_code == 201 and second.json()["replay"] is True and first.json()["id"] == second.json()["id"]
    rid = first.json()["id"]
    approver = await add_user(db, s["tenant"], {"finance.budget.revision.approve": True})
    await db.commit()
    async with client_for(db, s["tenant"], s["owner"]) as c:
        assert (await c.post(f"{API}/revisions/{rid}/approve", json={})).status_code == 403
    async with client_for(db, s["tenant"], approver) as c:
        ok = (await c.post(f"{API}/revisions/{rid}/approve", json={})).json()
        replay = (await c.post(f"{API}/revisions/{rid}/approve", json={})).json()
        assert (await c.post(f"{API}/revisions/{rid}/reject", json={"note": "late"})).status_code == 409
    assert ok["status"] == "APPROVED" and ok["revision_no"] == 1 and ok["old_amount"] == "1000.0000" and replay["replay"] is True
    await db.refresh(line)
    assert line.amount == D("1500")
    add = {"request_id": "rev-add-01", "kind": "ADD_LINE", "budget_id": s["budget"].id, "cost_center_id": s["other_cc"].id,
           "account_id": s["util"].id, "period_month": "1999-01", "new_amount": "10", "reason": "New line"}
    async with client_for(db, s["tenant"], s["manager"]) as c:
        assert (await c.post(API + "/revisions", json=add)).status_code == 422  # outside the financial year
        created = await c.post(API + "/revisions", json={**add, "period_month": s["month"]})
        assert created.status_code == 201
    total = await db.scalar(select(func.count()).select_from(BudgetLine).where(BudgetLine.budget_id == s["budget"].id))
    assert total == 3  # the ADD_LINE request alone adds nothing until approved
    async with client_for(db, s["tenant"], approver) as c:
        ok = (await c.post(f"{API}/revisions/{created.json()['id']}/approve", json={})).json()
        await c.post(f"{API}/revisions/{created.json()['id']}/approve", json={})  # replay adds nothing
    assert ok["status"] == "APPROVED" and ok["budget_line_id"] is not None and ok["revision_no"] == 1
    total = await db.scalar(select(func.count()).select_from(BudgetLine).where(BudgetLine.budget_id == s["budget"].id))
    assert total == 4


async def test_revision_is_refused_when_the_line_changed_after_the_request(db_session_integration):
    db = db_session_integration
    s = await _company(db)
    line = s["lines"][0]
    async with client_for(db, s["tenant"], s["owner"]) as c:
        rid = (await c.post(API + "/revisions", json={"request_id": "chg-race-1", "kind": "CHANGE", "budget_line_id": line.id,
                                                      "new_amount": "1200", "reason": "Tariff"})).json()["id"]
    line.amount = D("1111")  # changed by someone else in between
    await db.commit()
    async with client_for(db, s["tenant"], s["manager"]) as c:
        r = await c.post(f"{API}/revisions/{rid}/approve", json={})
    assert r.status_code == 409
    await db.refresh(line)
    assert line.amount == D("1111")


@pytest.mark.parametrize("permissions", [{"finance.mgmt_performance.view": False}, {"finance.access": True}])
async def test_missing_or_false_view_key_is_403(db_session_integration, permissions):
    db = db_session_integration
    s = await _company(db)
    user = await add_user(db, s["tenant"], permissions)
    await db.commit()
    async with client_for(db, s["tenant"], user) as c:
        assert (await c.get(API + "/targets")).status_code == 403


async def test_finished_goods_contribution_caps_and_filters(db_session_integration):
    from app.models.costing import Item
    from app.models.inventory import StockGroup, StockMovement, Warehouse
    from app.modules.finance.mgmt_performance.contribution_service import compute_contribution
    from app.modules.finance.mgmt_performance.periods import parse_period
    from tests.mfg_finance_fixtures import add_item_simple, add_quotation, add_quoted_order, p3_tenant

    db = db_session_integration
    tenant, _user, _role, fx = await p3_tenant(db, flags={FLAG: True})
    q = await add_quotation(db, tenant, fx.customer)  # 10000 USD / 1000 pcs, material 6000, other 500, rate 110
    order = await add_quoted_order(db, tenant, fx, q, qty=500, delivery=date(2030, 3, 25))
    grp = StockGroup(tenant_id=tenant.id, group_code="FG", name="Finished goods", stock_nature="FINISHED_GOODS")
    store = Warehouse(tenant_id=tenant.id, warehouse_code="FGS", name="FG store")
    quarantine = Warehouse(tenant_id=tenant.id, warehouse_code="QRN", name="Quarantine", is_quarantine=True)
    db.add_all([grp, store, quarantine])
    await db.flush()
    item = await add_item_simple(db, tenant, "TEE")
    (await db.get(Item, item.id)).stock_group_id = grp.id

    def mv(qty, day, **kw):
        base = dict(tenant_id=tenant.id, item_id=item.id, warehouse_id=store.id, movement_type="IN", quantity=D(qty),
                    movement_date=day, order_id=order.id, reference_type="PRODUCTION")
        base.update(kw)
        return StockMovement(**base)

    db.add_all([
        mv("400", date(2030, 2, 10)),  # before the period
        mv("200", date(2030, 3, 5)),  # in the period, but only 100 left to count
        mv("999", date(2030, 3, 6), reference_type="WAREHOUSE_TRANSFER", movement_kind="WAREHOUSE_TRANSFER_IN"),
        mv("999", date(2030, 3, 7), warehouse_id=quarantine.id),
        mv("50", date(2030, 3, 8), order_id=None),
    ])
    await db.flush()
    c = await compute_contribution(db, tenant, parse_period("2030-03", tenant, today=date(2030, 3, 16)))
    assert len(c.orders) == 1
    o = c.orders[0]
    assert o.received_in_period == D("200") and o.counted_qty == D("100")
    assert o.unit_price == D("1100.0000")  # 5000 USD x 110 / 500
    assert o.cost_per_piece == D("715.0000")  # (330000 material + 27500 other) / 500
    assert c.contribution == D("38500.0000") and c.contribution_pct == D("35.0000")
    assert o.cost_status == "ESTIMATED" and "IN_HOUSE_PROCESSING_FROM_BUDGET" in o.reason_codes
    assert c.receipts_without_order_rows == 1 and "FG_RECEIPT_WITHOUT_ORDER" in c.reason_codes
    assert c.pipeline_orders == 1 and c.pipeline_contribution == D("0.0000")  # 600 received >= 500 ordered
