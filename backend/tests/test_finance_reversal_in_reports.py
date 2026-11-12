"""Phase 0b: a reversed voucher nets to ZERO in every classic report (and the new statements).

Reversing a voucher flips the original to REVERSED (with reversed_by_voucher_id) and posts an opposite POSTED
voucher. The classic reports used to count only `status == "POSTED"`, so they dropped the original and kept the
reversal: the reversed voucher showed as MINUS its amount. They now use
`voucher_counts_in_books_status_clause()` (POSTED, or REVERSED with a reversal link).

Method: take a snapshot of every report, post an expense voucher (with a cost centre, inside a FINAL budget period),
reverse it through the real endpoint, take a second snapshot, and compare. A REVERSED voucher WITHOUT a reversal link
(legacy bare flip) and another tenant's vouchers must never change a number.

Run in Docker:
    docker compose exec -T backend pytest tests/test_finance_reversal_in_reports.py -q
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest

from app.common.business_date import today_local
from app.models.finance import AccountingPeriod, Budget, BudgetLine, CostCenter, Voucher, VoucherLine
from tests.benchmark_fixtures import api_client
from tests.finance_statement_fixtures import D, post, seed_world

FIN = "/api/v1/finance"
AMOUNT = D("12345.67")


async def _setup(db):
    tenant, user, w = await seed_world(db, flags={"fiscal_year_start_month": 1})
    cc = CostCenter(tenant_id=tenant.id, center_code=f"CC{uuid.uuid4().hex[:6]}", name="Sewing")
    db.add(cc)
    await db.flush()
    today = today_local(tenant)
    db.add(  # the reverse endpoint needs an open period for today
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"P{uuid.uuid4().hex[:4]}",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_closed=False,
        )
    )
    budget = Budget(tenant_id=tenant.id, budget_name="FY", fiscal_year=str(today.year), status="FINAL")
    db.add(budget)
    await db.flush()
    db.add(
        BudgetLine(
            tenant_id=tenant.id,
            budget_id=budget.id,
            cost_center_id=cc.id,
            account_id=w["ledgers"]["rent"].id,
            period_month=today.strftime("%Y-%m"),
            amount=D("50000"),
        )
    )
    await db.flush()
    return tenant, user, w, cc, budget, today


async def _post_expense(db, tenant, w, cc, vdate, amount=AMOUNT, status="POSTED") -> Voucher:
    """Rent (debit, with cost centre) against Cash in Hand (credit)."""
    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"RV-{uuid.uuid4().hex[:10]}",
        voucher_type="JOURNAL",
        voucher_date=vdate,
        status=status,
        books_applied=True,
    )
    db.add(voucher)
    await db.flush()
    for account, entry, cost_center in ((w["ledgers"]["rent"], "DEBIT", cc), (w["ledgers"]["cash"], "CREDIT", None)):
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=voucher.id,
                account_id=account.id,
                cost_center_id=cost_center.id if cost_center else None,
                entry_type=entry,
                amount=amount,
                base_amount=amount,
            )
        )
    await db.flush()
    return voucher


async def _reverse(ac, voucher_id: int):
    return await ac.post(f"{FIN}/vouchers/{voucher_id}/reverse", json={"reason": "test reversal"})


async def _snapshot(ac, tenant, w, cc, budget, today) -> dict:
    """Every classic report that counts voucher movement, as plain JSON, plus the new statements trial balance."""
    later_from, later_to = today + timedelta(days=1), today + timedelta(days=30)
    as_of = later_to.isoformat()
    year = {"from_date": f"{today.year}-01-01", "to_date": f"{today.year}-12-31"}
    rent, cash = w["ledgers"]["rent"], w["ledgers"]["cash"]

    async def get(path: str, **params):
        r = await ac.get(path if path.startswith("/") else f"{FIN}/{path}", params=params)
        assert r.status_code == 200, (path, params, r.text[:300])
        return r.json()

    snapshot = {
        "tb_cumulative": await get("reports/trial-balance", as_of_date=as_of, basis="cumulative"),
        "tb_fy": await get("reports/trial-balance", as_of_date=as_of, basis="fy"),
        "fs_cumulative": await get("reports/financial-statements", as_of_date=as_of, basis="cumulative"),
        "fs_fy": await get("reports/financial-statements", as_of_date=as_of, basis="fy"),
        "ledger_later": await get(
            "reports/ledger-activity", account_id=rent.id, from_date=later_from.isoformat(), to_date=later_to.isoformat()
        ),
        "ledger_day": await get(
            "reports/ledger-activity", account_id=rent.id, from_date=today.isoformat(), to_date=today.isoformat()
        ),
        "cash_ledger_later": await get(
            "reports/ledger-activity", account_id=cash.id, from_date=later_from.isoformat(), to_date=later_to.isoformat()
        ),
        "cash_flow_later": await get(
            "reports/cash-flow-statement", from_date=later_from.isoformat(), to_date=later_to.isoformat()
        ),
        "cash_flow_day": await get(
            "reports/cash-flow-statement", from_date=today.isoformat(), to_date=today.isoformat()
        ),
        "cost_centers": await get("cost-centers/dashboard", from_date=today.isoformat(), to_date=today.isoformat()),
        "budget": await get(f"budgets/{budget.id}/vs-actual"),
        "ratios": await get("/api/v1/finance/reports/ratio-analysis", as_of_date=as_of),
        "fund_flow": await get("/api/v1/finance/reports/fund-flow", from_date=f"{today.year}-01-01", to_date=as_of),
        "statements_tb": await get("statements/trial-balance", **year),
    }
    snapshot["statements_tb"].pop("data_as_of", None)  # a timestamp, not a number
    return snapshot


def _rows_by_account(tb: dict) -> dict:
    return {r["account_id"]: (r["debit"], r["credit"]) for r in tb["rows"]}


# Parts of a snapshot that legitimately gain rows or gross amounts after a reversal (two vouchers now exist), so they
# are checked by their net figures below instead of by whole-document equality.
GROSS_PARTS = {"ledger_day", "cash_flow_day", "cost_centers", "budget", "statements_tb"}


def _order_free(value):
    """Reports such as the classic trial balance do not sort their rows, so compare row lists as sets."""
    if isinstance(value, dict):
        return {k: _order_free(v) for k, v in value.items()}
    if isinstance(value, list) and all(isinstance(v, dict) for v in value):
        return sorted((_order_free(v) for v in value), key=repr)
    return value


def _assert_nets_to_zero(before: dict, after: dict, w: dict, cc, today) -> None:
    for key in before:
        if key in GROSS_PARTS:
            continue
        assert _order_free(after[key]) == _order_free(before[key]), f"{key} changed after post + reverse"

    # Ledger activity (rent): two rows today (original debit, reversal credit), running balance back to the opening.
    day = after["ledger_day"]
    assert [r["entry_type"] for r in day["rows"]] == ["DEBIT", "CREDIT"]
    assert day["opening_balance"] == before["ledger_day"]["opening_balance"]
    assert day["closing_balance"] == day["opening_balance"]
    assert all(r["amount"] == float(AMOUNT) for r in day["rows"])
    # Opening of a LATER period includes both vouchers: unchanged from the snapshot taken before posting.
    assert after["ledger_later"]["opening_balance"] == before["ledger_later"]["opening_balance"]

    # Cash flow: opening of the later period unchanged; net cash flow for the day is zero (out and back in).
    assert after["cash_flow_later"]["opening_cash_balance"] == before["cash_flow_later"]["opening_cash_balance"]
    day_cf = after["cash_flow_day"]
    assert day_cf["totals"]["net_cash_flow"] == 0.0
    assert day_cf["closing_cash_balance"] == day_cf["opening_cash_balance"]

    # Cost-centre dashboard: both sides counted, net zero.
    row = next(r for r in after["cost_centers"] if r["cost_center_id"] == cc.id)
    assert (row["debit_total"], row["credit_total"], row["net"]) == (float(AMOUNT), float(AMOUNT), 0.0)

    # Budget vs actual: spend is zero (debit and credit both counted), not minus the amount.
    line = after["budget"]["rows"][0]
    assert line["actual_amount"] == 0.0 and line["actual_debit"] == line["actual_credit"] == float(AMOUNT)
    assert after["budget"]["total_actual"] == 0.0

    # New statements trial balance: period Dr / Cr are gross (both vouchers), every closing balance is unchanged.
    def closing(tb: dict) -> list:
        return [(r["name"], r["closing_debit"], r["closing_credit"]) for r in tb["rows"]]

    assert closing(after["statements_tb"]) == closing(before["statements_tb"])
    for field in ("closing_debit", "closing_credit"):
        assert after["statements_tb"]["totals"][field] == before["statements_tb"]["totals"][field]
    rent_row = next(r for r in after["statements_tb"]["rows"] if r["name"] == "Rent")
    before_rent = next(r for r in before["statements_tb"]["rows"] if r["name"] == "Rent")
    assert D(rent_row["period_debit"]) == D(before_rent["period_debit"]) + AMOUNT  # gross: original debit counted
    assert D(rent_row["period_credit"]) == D(before_rent["period_credit"]) + AMOUNT  # and the reversal credit

    # Trial balance: rent and cash rows are exactly what they were before the voucher existed.
    rent_id, cash_id = w["ledgers"]["rent"].id, w["ledgers"]["cash"].id
    for key in ("tb_cumulative", "tb_fy"):
        a, b = _rows_by_account(after[key]), _rows_by_account(before[key])
        assert a[rent_id] == b[rent_id] and a[cash_id] == b[cash_id], key
        assert after[key]["total_debit"] == after[key]["total_credit"]


@pytest.mark.asyncio
async def test_reversed_voucher_nets_to_zero_in_every_report(db_session_integration):
    db = db_session_integration
    tenant, user, w, cc, budget, today = await _setup(db)
    async with api_client(db, tenant, user) as ac:
        before = await _snapshot(ac, tenant, w, cc, budget, today)
        original = await _post_expense(db, tenant, w, cc, today)
        # Sanity: before reversing, the expense really shows (the snapshot machinery is sensitive).
        mid = await _snapshot(ac, tenant, w, cc, budget, today)
        assert mid["budget"]["rows"][0]["actual_amount"] == float(AMOUNT)
        assert mid["ledger_day"]["closing_balance"] == before["ledger_day"]["closing_balance"] + float(AMOUNT)

        r = await _reverse(ac, original.id)
        assert r.status_code == 200, r.text
        await db.refresh(original)
        assert original.status == "REVERSED" and original.reversed_by_voucher_id is not None

        after = await _snapshot(ac, tenant, w, cc, budget, today)
    _assert_nets_to_zero(before, after, w, cc, today)


@pytest.mark.asyncio
async def test_helper_matches_statements_rule_and_excludes_bare_reversed(db_session_integration):
    """The shared helper is the single rule: POSTED, or REVERSED with a link. Bare REVERSED never counts."""
    from sqlalchemy import select

    from app.modules.finance.advanced_voucher_service import voucher_counts_in_books_status_clause

    db = db_session_integration
    tenant, _user, w, cc, _budget, today = await _setup(db)
    posted = await _post_expense(db, tenant, w, cc, today)
    linked = await _post_expense(db, tenant, w, cc, today, status="REVERSED")
    reversal = await _post_expense(db, tenant, w, cc, today)
    linked.reversed_by_voucher_id = reversal.id
    bare = await _post_expense(db, tenant, w, cc, today, status="REVERSED")
    draft = await _post_expense(db, tenant, w, cc, today, status="DRAFT")
    await db.flush()
    ids = (
        await db.execute(
            select(Voucher.id).where(Voucher.tenant_id == tenant.id, voucher_counts_in_books_status_clause())
        )
    ).scalars().all()
    counted = set(ids)
    assert {posted.id, linked.id, reversal.id} <= counted
    assert bare.id not in counted and draft.id not in counted


@pytest.mark.asyncio
async def test_legacy_bare_reversed_voucher_is_excluded_everywhere(db_session_integration):
    db = db_session_integration
    tenant, user, w, cc, budget, today = await _setup(db)
    async with api_client(db, tenant, user) as ac:
        before = await _snapshot(ac, tenant, w, cc, budget, today)
        # status REVERSED, no reversed_by link, no reversal voucher: an old bare flip.
        await _post_expense(db, tenant, w, cc, today, amount=D("999999"), status="REVERSED")
        after = await _snapshot(ac, tenant, w, cc, budget, today)
    assert after == before


@pytest.mark.asyncio
async def test_other_tenants_reversal_and_postings_never_affect_totals(db_session_integration):
    db = db_session_integration
    tenant, user, w, cc, budget, today = await _setup(db)
    async with api_client(db, tenant, user) as ac:
        before = await _snapshot(ac, tenant, w, cc, budget, today)

    tenant2, user2, w2, cc2, _b2, today2 = await _setup(db)
    kept = await _post_expense(db, tenant2, w2, cc2, today2, amount=D("5000000"))  # stays posted
    gone = await _post_expense(db, tenant2, w2, cc2, today2, amount=D("777777"))
    async with api_client(db, tenant2, user2) as ac2:
        assert (await _reverse(ac2, gone.id)).status_code == 200
    assert kept.status == "POSTED"

    async with api_client(db, tenant, user) as ac:
        after = await _snapshot(ac, tenant, w, cc, budget, today)
    assert after == before


@pytest.mark.asyncio
async def test_budget_enforcement_v2_counts_reversed_pair_as_zero_used(db_session_integration):
    """Budget enforcement v2 uses the same numbers as Budget vs Actual: a reversed voucher uses none of the budget."""
    from app.modules.finance.budget_enforcement_service import evaluate_voucher_budget

    db = db_session_integration
    tenant, user, w, cc, _budget, today = await _setup(db)
    original = await _post_expense(db, tenant, w, cc, today)
    async with api_client(db, tenant, user) as ac:
        assert (await _reverse(ac, original.id)).status_code == 200

    from sqlalchemy import select

    proposed = await _post_expense(db, tenant, w, cc, today, amount=D("100"), status="APPROVED")
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == proposed.id))).scalars().all())
    result = await evaluate_voucher_budget(
        db,
        tenant_id=tenant.id,
        feature_flags={**(tenant.feature_flags or {}), "budget_enforcement_mode": "warn"},
        voucher=proposed,
        lines=lines,
    )
    assert result.has_budget
    assert result.used_amount == 0.0  # original (+X) and reversal (-X) cancel out
    assert result.projected == 100.0


# ---------------------------------------------------------------------------------------------------------------
# GST returns: tax lines live in voucher_tax_lines, which the reverse endpoint does not copy. A reversed pair is
# left out on BOTH sides (original by status, reversal voucher by reverses_voucher_id), so it nets to zero.
# ---------------------------------------------------------------------------------------------------------------


async def _add_tax_lines(db, tenant_id: int, voucher: Voucher, ledgers: dict, base: str, tax_each: str) -> None:
    from app.models.gst_tax import VoucherTaxLine

    for tax_type in ("CGST", "SGST"):
        db.add(
            VoucherTaxLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                tax_ledger_id=ledgers[tax_type].id,
                taxable_amount=D(base),
                tax_amount=D(tax_each),
                tax_rate_applied=D("9"),
                hsn_code="6109",
                direction="OUTWARD",
            )
        )
    await db.flush()


@pytest.mark.asyncio
async def test_gst_returns_leave_out_a_reversed_pair(db_session_integration):
    from app.modules.finance.gst_return_service import generate_gstr1, generate_gstr3b
    from tests.test_gst_tax_system import _tax_ledgers

    db = db_session_integration
    tenant, user, w, cc, _budget, today = await _setup(db)
    ledgers = await _tax_ledgers(db, tenant.id)
    kept = await _post_expense(db, tenant, w, cc, today, amount=D("1180"))
    await _add_tax_lines(db, tenant.id, kept, ledgers, "1000", "90")
    gone = await _post_expense(db, tenant, w, cc, today, amount=D("590"))
    await _add_tax_lines(db, tenant.id, gone, ledgers, "500", "45")
    span = (today - timedelta(days=1), today + timedelta(days=1))

    before = await generate_gstr1(db, tenant.id, *span)
    assert before["summary"]["line_count"] == 4
    assert D(before["summary"]["tax_total"]) == D("270")

    async with api_client(db, tenant, user) as ac:
        r = await _reverse(ac, gone.id)
        assert r.status_code == 200, r.text
    reversal_id = r.json()["id"]
    reversal = await db.get(Voucher, reversal_id)
    # Even if a reversal voucher ever carried tax lines, it is left out together with its original.
    await _add_tax_lines(db, tenant.id, reversal, ledgers, "500", "45")

    after = await generate_gstr1(db, tenant.id, *span)
    assert {s["voucher_id"] for s in after["supplies"]} == {kept.id}
    assert D(after["summary"]["taxable_total"]) == D("1000")
    assert D(after["summary"]["tax_total"]) == D("180")
    assert D((await generate_gstr3b(db, tenant.id, *span))["outward_tax"]) == D("180")

    # Another tenant's posted tax lines never appear.
    tenant2, _u2, w2, cc2, _b2, today2 = await _setup(db)
    ledgers2 = await _tax_ledgers(db, tenant2.id)
    foreign = await _post_expense(db, tenant2, w2, cc2, today2, amount=D("11800"))
    await _add_tax_lines(db, tenant2.id, foreign, ledgers2, "10000", "900")
    assert D((await generate_gstr1(db, tenant.id, *span))["summary"]["tax_total"]) == D("180")


# ---------------------------------------------------------------------------------------------------------------
# Old order costing variance (/profitability/variance/{order_id}): vouchers matched by reference == order code.
# A reversal's reference is the original's voucher number, so it is followed through reverses_voucher_id.
# ---------------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_order_costing_variance_nets_reversed_pair_to_zero(db_session_integration):
    from tests.finance_control_fixtures import make_customer, make_order, make_quotation

    db = db_session_integration
    tenant, user, w, cc, _budget, today = await _setup(db)
    customer = await make_customer(db, tenant.id, "Buyer")
    quotation = await make_quotation(db, tenant.id, customer, total_cost=D("1000"))
    order = await make_order(db, tenant.id, customer, quotation_id=quotation.id)

    async def tagged(amount: str, status: str = "POSTED", tenant_=tenant, w_=w, cc_=cc) -> Voucher:
        v = await _post_expense(db, tenant_, w_, cc_, today, amount=D(amount), status=status)
        v.reference = order.order_code
        await db.flush()
        return v

    await tagged("300")
    gone = await tagged("700")
    await tagged("50000", status="REVERSED")  # legacy bare flip: never counted
    await tagged("40000", status="DRAFT")
    tenant2, _u2, w2, cc2, _b2, _t2 = await _setup(db)
    await tagged("90000", tenant_=tenant2, w_=w2, cc_=cc2)  # same reference text, other tenant

    url = f"{FIN}/profitability/variance/{order.id}"
    async with api_client(db, tenant, user) as ac:
        body = (await ac.get(url)).json()
        assert set(body) == {"order_id", "order_code", "planned_cost", "actual_cost", "variance", "variance_pct"}
        assert body["actual_cost"] == 1000.0 and body["variance"] == 0.0

        r = await _reverse(ac, gone.id)
        assert r.status_code == 200, r.text
        body = (await ac.get(url)).json()
        assert body["actual_cost"] == 300.0  # 300 + 700 - 700
        assert body["variance"] == -700.0

        # Reversing the reversal brings the original's cost back.
        r2 = await _reverse(ac, r.json()["id"])
        assert r2.status_code == 200, r2.text
        assert (await ac.get(url)).json()["actual_cost"] == 1000.0
