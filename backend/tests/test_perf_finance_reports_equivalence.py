"""Finance report endpoints: SQL-aggregated output must equal the previous Python algorithms.

Each ``_old_*`` function is a frozen copy of the pre-optimisation logic. The seed mixes voucher types,
statuses, memorandum / optional / post-dated flags, FX lines (amount != base_amount), cost centres,
several preparers and a second tenant.

Run in Docker: docker compose exec backend pytest tests/test_perf_finance_reports_equivalence.py -q
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select

from app.common.business_date import today_local
from app.models.finance import (
    AccountGroup,
    Budget,
    BudgetLine,
    ChartOfAccount,
    CostCenter,
    Voucher,
    VoucherLine,
)
from app.models.user import User
from app.modules.finance.advanced_voucher_service import voucher_in_books_clause, voucher_visible_in_day_book
from app.modules.finance.enhanced_cash_flow_service import _avg_monthly_cashflow
from app.modules.finance.mis_coa_helpers import _d, _money
from app.modules.finance.ratio_analysis_service import calculate_ratios, ratio_trend
from tests.benchmark_fixtures import api_client, seed_tenant_admin
from tests.test_perf_inventory_reports_equivalence import QueryCounter

TODAY = today_local()  # same business date the endpoints default to


def _to_float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------


async def _account(db, tenant_id: int, name: str, nature: str, normal: str) -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant_id,
        name=f"G-{name}-{slug}",
        code=f"G{slug}"[:12],
        nature=nature,
        default_normal_balance=normal,
        allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"A-{slug}",
        name=name,
        group_id=grp.id,
        normal_balance=normal,
        balance=Decimal("0"),
        opening_balance=Decimal("1000.5000") if nature == "Asset" else Decimal("0"),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def _voucher(db, tenant_id, vtype, vdate, status, lines, *, created_by=None, **flags) -> Voucher:
    v = Voucher(
        tenant_id=tenant_id,
        voucher_number=f"{vtype[:3]}-{uuid.uuid4().hex[:8]}",
        voucher_type=vtype,
        voucher_date=vdate,
        status=status,
        description=flags.pop("description", f"{vtype} for party Alpha" if len(lines) % 2 else f"{vtype} misc"),
        reference=flags.pop("reference", None),
        created_by=created_by,
        **flags,
    )
    db.add(v)
    await db.flush()
    for account, entry, amount, base, cc in lines:
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=v.id,
                account_id=account.id,
                entry_type=entry,
                amount=Decimal(amount),
                base_amount=Decimal(base),
                cost_center_id=cc.id if cc is not None else None,
            )
        )
    await db.flush()
    return v


async def _seed_finance(db, tenant_id: int, user_ids: list[int]) -> dict:
    cash = await _account(db, tenant_id, "Cash in hand", "Asset", "debit")
    bank = await _account(db, tenant_id, "Bank current", "Asset", "debit")
    ar = await _account(db, tenant_id, "Trade receivable", "Asset", "debit")
    stock = await _account(db, tenant_id, "Inventory stock", "Asset", "debit")
    ap = await _account(db, tenant_id, "Trade payable", "Liability", "credit")
    loan = await _account(db, tenant_id, "Bank loan", "Liability", "credit")
    sales = await _account(db, tenant_id, "Sales", "Income", "credit")
    cogs = await _account(db, tenant_id, "Cost of goods sold", "Expense", "debit")
    interest = await _account(db, tenant_id, "Interest expense", "Expense", "debit")
    equity = await _account(db, tenant_id, "Capital", "Equity", "credit")
    cc1 = CostCenter(tenant_id=tenant_id, center_code=f"CC1-{uuid.uuid4().hex[:4]}", name="Cutting")
    cc2 = CostCenter(tenant_id=tenant_id, center_code=f"CC2-{uuid.uuid4().hex[:4]}", name="Sewing")
    db.add_all([cc1, cc2])
    await db.flush()

    u1, u2 = user_ids
    plan = []
    # 70 posted vouchers spread over ~14 months, dates increasing with insertion order.
    for k in range(70):
        vdate = TODAY - timedelta(days=420 - k * 6)
        amt = f"{100 + k * 7}.{k % 10}5"
        if k % 4 == 0:
            plan.append(("RECEIPT", vdate, "POSTED", [(cash, "DEBIT", amt, amt, None), (sales, "CREDIT", amt, amt, cc1)], u1, {}))
        elif k % 4 == 1:
            plan.append(("PAYMENT", vdate, "POSTED", [(cogs, "DEBIT", amt, amt, cc2), (bank, "CREDIT", amt, amt, None)], u2, {}))
        elif k % 4 == 2:
            base = str(Decimal(amt) * Decimal("110.5"))
            plan.append(
                ("JOURNAL", vdate, "POSTED", [(ar, "DEBIT", amt, base, cc1), (sales, "CREDIT", amt, base, None)], u1,
                 {"currency": "USD", "exchange_rate": Decimal("110.5")})
            )
        else:
            plan.append(("JOURNAL", vdate, "POSTED", [(interest, "DEBIT", "12.3456", "12.3456", cc2), (loan, "CREDIT", "12.3456", "12.3456", None)], None, {}))
    # Non-book / non-posted vouchers in the current month.
    m0 = TODAY.replace(day=1)
    plan += [
        ("JOURNAL", m0, "DRAFT", [(stock, "DEBIT", "50", "50", None), (ap, "CREDIT", "50", "50", None)], u2, {}),
        ("JOURNAL", m0, "APPROVED", [(stock, "DEBIT", "75.5", "75.5", cc1), (ap, "CREDIT", "75.5", "75.5", None)], u1, {}),
        ("MEMORANDUM", m0, "POSTED", [(cash, "DEBIT", "999", "999", None), (sales, "CREDIT", "999", "999", None)], u1, {"is_memorandum": True}),
        ("STOCK_TRANSFER", m0, "POSTED", [(stock, "DEBIT", "40", "40", None), (stock, "CREDIT", "40", "40", None)], u2, {}),
        ("OPTIONAL", m0, "POSTED", [(cash, "DEBIT", "30", "30", None), (sales, "CREDIT", "30", "30", None)], u2, {"is_optional": True}),
        ("OPTIONAL", m0, "POSTED", [(cash, "DEBIT", "31", "31", None), (sales, "CREDIT", "31", "31", None)], u2, {"is_optional": True, "include_in_books": True}),
        ("PAYMENT", TODAY + timedelta(days=20), "POSTED", [(ap, "DEBIT", "500", "500", None), (bank, "CREDIT", "500", "500", None)], u1, {"is_post_dated": True}),
        ("PAYMENT", TODAY - timedelta(days=1), "POSTED", [(ap, "DEBIT", "60", "60", None), (bank, "CREDIT", "60", "60", None)], u1, {"is_post_dated": True}),
        ("RECEIPT", TODAY + timedelta(days=5), "APPROVED", [(bank, "DEBIT", "1.11", "1.11", None), (ar, "CREDIT", "1.11", "1.11", None)], u2, {"is_post_dated": True, "reference": "PDC alpha"}),
        ("RECEIPT", m0, "POSTED", [(cash, "DEBIT", "20", "20", None), (cash, "DEBIT", "5.25", "5.25", cc2), (equity, "CREDIT", "25.25", "25.25", None)], u2, {"books_applied": True}),
    ]
    vouchers = []
    for vtype, vdate, status, lines, created_by, flags in plan:
        vouchers.append(await _voucher(db, tenant_id, vtype, vdate, status, lines, created_by=created_by, **flags))
    await db.flush()
    return {
        "accounts": {"cash": cash, "bank": bank, "ar": ar, "stock": stock, "ap": ap, "sales": sales, "cogs": cogs, "loan": loan},
        "cost_centers": [cc1, cc2],
        "vouchers": vouchers,
    }


async def _seed(db):
    tenant, user = await seed_tenant_admin(db)
    user2 = User(
        tenant_id=tenant.id,
        role_id=user.role_id,
        username=f"u2{uuid.uuid4().hex[:8]}",
        email=f"u2{uuid.uuid4().hex[:8]}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user2)
    await db.flush()
    other, other_user = await seed_tenant_admin(db)
    seed = await _seed_finance(db, tenant.id, [user.id, user2.id])
    await _seed_finance(db, other.id, [other_user.id, other_user.id])
    return tenant, user, seed


# ---------------------------------------------------------------------------
# Reference implementations (frozen copies of the old logic)
# ---------------------------------------------------------------------------


async def _old_budget_vs_actual(db, tenant, budget) -> dict:
    """Row-by-row reference (since 2026-11): each line counts only its own period (month / quarter /
    financial year), sums base_amount, and nets by account nature (Expense/Asset Dr-Cr, Income/Liability/
    Equity Cr-Dr; an "any account" line signs each voucher line by its own account)."""
    from app.modules.finance.budget_vs_actual_service import budget_line_period, net_rule
    from app.modules.finance.fiscal_year import fiscal_year_bounds_from_label, fy_start_month
    from app.modules.finance.posting_core import line_base_amount

    start_month = fy_start_month(tenant.feature_flags)
    fy_bounds = fiscal_year_bounds_from_label(budget.fiscal_year, start_month)
    lines = list(
        (await db.execute(select(BudgetLine).where(BudgetLine.budget_id == budget.id).order_by(BudgetLine.id)))
        .scalars()
        .all()
    )
    posted_rows = list(
        (
            await db.execute(
                select(VoucherLine, Voucher)
                .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                .where(VoucherLine.tenant_id == tenant.id, Voucher.status == "POSTED", voucher_in_books_clause())
            )
        ).all()
    )
    accounts = {
        acct.id: (group.nature, net_rule(group.nature, acct.normal_balance))
        for acct, group in (
            await db.execute(
                select(ChartOfAccount, AccountGroup)
                .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
                .where(ChartOfAccount.tenant_id == tenant.id)
            )
        ).all()
    }
    rows = []
    total_budget = Decimal("0")
    total_actual = Decimal("0")
    for line in lines:
        period_type, start, end = budget_line_period(line.period_month, fy_bounds, start_month)
        debit = credit = actual = Decimal("0")
        for voucher_line, voucher in posted_rows:
            if line.account_id is not None and voucher_line.account_id != line.account_id:
                continue
            if line.cost_center_id is not None and voucher_line.cost_center_id != line.cost_center_id:
                continue
            if start is not None and not (start <= voucher.voucher_date <= end):
                continue
            amount = line_base_amount(voucher_line)
            debit_side = (voucher_line.entry_type or "").upper() == "DEBIT"
            if debit_side:
                debit += amount
            else:
                credit += amount
            credit_nature = accounts[voucher_line.account_id][1] == "credit_minus_debit"
            actual += amount if debit_side != credit_nature else -amount
        if line.account_id is not None:
            nature, rule = accounts[line.account_id]
        else:
            nature, rule = None, "per_account"
        budget_amount = Decimal(str(line.amount))
        total_budget += budget_amount
        total_actual += actual
        budget_f, actual_f = float(budget_amount), float(actual)
        rows.append(
            {
                "line_id": line.id,
                "period_month": line.period_month,
                "account_id": line.account_id,
                "cost_center_id": line.cost_center_id,
                "budget_amount": round(budget_f, 2),
                "actual_amount": round(actual_f, 2),
                "variance": round(actual_f - budget_f, 2),
                "variance_pct": round(((actual_f - budget_f) / budget_f * 100) if budget_f > 0 else 0, 2),
                "period_type": period_type,
                "period_start": start.isoformat() if start else None,
                "period_end": end.isoformat() if end else None,
                "nature": nature,
                "net_rule": rule,
                "actual_debit": round(float(debit), 2),
                "actual_credit": round(float(credit), 2),
            }
        )
    return {
        "budget_id": budget.id,
        "budget_name": budget.budget_name,
        "fiscal_year": budget.fiscal_year,
        "period_start": fy_bounds[0].isoformat() if fy_bounds else None,
        "period_end": fy_bounds[1].isoformat() if fy_bounds else None,
        "rows": rows,
        "total_budget": round(float(total_budget), 2),
        "total_actual": round(float(total_actual), 2),
        "total_variance": round(float(total_actual - total_budget), 2),
    }


async def _old_day_book(db, tenant, *, from_date, to_date, voucher_type=None, account_id=None, group_id=None, party_name=None):
    from sqlalchemy import func

    stmt = (
        select(Voucher)
        .where(Voucher.tenant_id == tenant.id, Voucher.voucher_date >= from_date, Voucher.voucher_date <= to_date)
        .order_by(Voucher.voucher_date, Voucher.id)
    )
    if voucher_type:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.upper())
    if party_name:
        q = f"%{party_name.strip().lower()}%"
        stmt = stmt.where(
            func.lower(func.coalesce(Voucher.reference, "")).like(q)
            | func.lower(func.coalesce(Voucher.description, "")).like(q)
        )
    rows = [r for r in (await db.execute(stmt)).scalars().all() if voucher_visible_in_day_book(r)]
    group_map = {
        a.id: a.group_id
        for a in (await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant.id))).scalars()
    }
    lines_by_voucher = defaultdict(list)
    if rows:
        for line in (
            await db.execute(
                select(VoucherLine)
                .where(VoucherLine.voucher_id.in_([r.id for r in rows]))
                .order_by(VoucherLine.voucher_id, VoucherLine.id)
            )
        ).scalars():
            lines_by_voucher[line.voucher_id].append(line)
    total_amount = 0.0
    out = []
    for row in rows:
        lines = lines_by_voucher.get(row.id, [])
        if account_id is not None and not any(ln.account_id == account_id for ln in lines):
            continue
        if group_id is not None and not any(group_map.get(ln.account_id) == group_id for ln in lines):
            continue
        amt = sum(_to_float(ln.amount) for ln in lines if ln.entry_type == "DEBIT")
        total_amount += amt
        out.append(
            {
                "id": row.id,
                "voucher_number": row.voucher_number,
                "voucher_type": row.voucher_type,
                "voucher_date": row.voucher_date,
                "status": row.status,
                "description": row.description,
                "amount": round(amt, 2),
            }
        )
    return {"rows": out, "total_amount": round(total_amount, 2)}


async def _old_vouchers(db, tenant_id, from_date=None, to_date=None, voucher_type=None, status_filter=None):
    stmt = select(Voucher).where(Voucher.tenant_id == tenant_id)
    if from_date is not None:
        stmt = stmt.where(Voucher.voucher_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Voucher.voucher_date <= to_date)
    if voucher_type:
        stmt = stmt.where(Voucher.voucher_type == voucher_type.strip().upper())
    if status_filter:
        stmt = stmt.where(Voucher.status == status_filter.strip().upper())
    return list((await db.execute(stmt.order_by(Voucher.id))).scalars().all())


async def _old_voucher_summary(db, tenant_id, **f):
    rows = await _old_vouchers(db, tenant_id, **f)
    status_counts: dict[str, int] = {}
    for row in rows:
        status_counts[row.status] = status_counts.get(row.status, 0) + 1
    return {"total_vouchers": len(rows), "status_counts": status_counts}


async def _old_voucher_monthly(db, tenant_id, months_back=12, **f):
    rows = await _old_vouchers(db, tenant_id, **f)
    summary: dict[str, dict] = {}
    for row in rows:
        key = row.voucher_date.strftime("%Y-%m")
        summary.setdefault(key, {"count": 0, "posted_count": 0})
        summary[key]["count"] += 1
        if row.status == "POSTED":
            summary[key]["posted_count"] += 1
    keys = sorted(summary.keys())[-max(months_back, 1):]
    return {"months": [{"month": k, **summary[k]} for k in keys]}


async def _old_top_preparers(db, tenant_id, limit=10, **f):
    rows = await _old_vouchers(db, tenant_id, **f)
    counts: dict[int, int] = {}
    for row in rows:
        if row.created_by is not None:
            counts[row.created_by] = counts.get(row.created_by, 0) + 1
    ranking = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[: max(limit, 1)]
    users = {
        u.id: u
        for u in (await db.execute(select(User).where(User.tenant_id == tenant_id, User.id.in_([u for u, _ in ranking] or [0])))).scalars()
    }
    return {
        "rows": [
            {"user_id": uid, "username": users[uid].username if uid in users else f"User#{uid}", "count": cnt}
            for uid, cnt in ranking
        ]
    }


async def _old_post_dated(db, tenant_id):
    rows = (
        await db.execute(
            select(Voucher)
            .where(Voucher.tenant_id == tenant_id, Voucher.is_post_dated.is_(True))
            .order_by(Voucher.voucher_date, Voucher.id)
        )
    ).scalars().all()
    out = []
    for v in rows:
        amt = Decimal("0")
        for ln in (
            await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id, VoucherLine.entry_type == "DEBIT"))
        ).scalars():
            amt += Decimal(str(ln.amount or 0))
        out.append(
            {
                "id": v.id,
                "voucher_number": v.voucher_number,
                "voucher_date": v.voucher_date.isoformat(),
                "voucher_type": v.voucher_type,
                "status": v.status,
                "description": v.description,
                "amount": str(amt),
                "days_until_active": (v.voucher_date - TODAY).days,
            }
        )
    return {"rows": out}


async def _old_avg_monthly_cashflow(db, tenant_id, days=90):
    end = TODAY
    start = end - timedelta(days=days)
    rows = (
        await db.execute(
            select(VoucherLine, Voucher)
            .join(Voucher, VoucherLine.voucher_id == Voucher.id)
            .where(
                Voucher.tenant_id == tenant_id,
                Voucher.status == "POSTED",
                voucher_in_books_clause(),
                Voucher.voucher_date >= start,
                Voucher.voucher_date <= end,
            )
        )
    ).all()
    inflow = outflow = 0.0
    for line, voucher in rows:
        amt = float(_d(line.amount))
        vtype = (voucher.voucher_type or "").upper()
        if vtype == "RECEIPT" and (line.entry_type or "").upper() == "DEBIT":
            inflow += amt
        elif vtype == "PAYMENT" and (line.entry_type or "").upper() == "CREDIT":
            outflow += amt
    months = max(days / 30.0, 1.0)
    return {
        "avg_monthly_inflow": _money(inflow / months),
        "avg_monthly_outflow": _money(outflow / months),
        "net_monthly": _money((inflow - outflow) / months),
    }


async def _old_cash_forecast_posted_amount(db, tenant_id) -> float:
    vouchers = (
        await db.execute(
            select(Voucher)
            .where(Voucher.tenant_id == tenant_id, Voucher.status == "POSTED", voucher_in_books_clause())
            # Old code had no ORDER BY (heap order); the rewrite pins "latest 60" to (voucher_date, id).
            .order_by(Voucher.voucher_date, Voucher.id)
        )
    ).scalars().all()
    total = 0.0
    for v in vouchers[-60:]:
        lines = (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id))).scalars().all()
        total += sum(_to_float(ln.amount) for ln in lines if ln.entry_type == "DEBIT")
    return total


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_budget_vs_actual_matches_old(db_session_integration):
    db = db_session_integration
    tenant, user, seed = await _seed(db)
    acc = seed["accounts"]
    cc1, cc2 = seed["cost_centers"]
    budget = Budget(tenant_id=tenant.id, budget_name="FY budget", fiscal_year="2026")
    db.add(budget)
    await db.flush()
    db.add_all(
        [
            BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acc["sales"].id, period_month="2026-01", amount=Decimal("5000")),
            BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acc["sales"].id, cost_center_id=cc1.id, period_month="2026-02", amount=Decimal("1200.55")),
            BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acc["cogs"].id, cost_center_id=cc2.id, period_month="2026-02", amount=Decimal("0")),
            BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acc["ap"].id, period_month="2026-03", amount=Decimal("10")),
            BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acc["cogs"].id, period_month="2026-Q2", amount=Decimal("900")),
            BudgetLine(tenant_id=tenant.id, budget_id=budget.id, account_id=acc["cash"].id, period_month="ANNUAL", amount=Decimal("2500")),
        ]
    )
    # A second budget with an "any account" line (account_id NULL) and an empty budget.
    any_budget = Budget(tenant_id=tenant.id, budget_name="Any", fiscal_year="2026")
    empty_budget = Budget(tenant_id=tenant.id, budget_name="Empty", fiscal_year="2026")
    db.add_all([any_budget, empty_budget])
    await db.flush()
    db.add_all(
        [
            BudgetLine(tenant_id=tenant.id, budget_id=any_budget.id, cost_center_id=cc1.id, period_month="2026-01", amount=Decimal("100")),
            BudgetLine(tenant_id=tenant.id, budget_id=any_budget.id, period_month="2026-01", amount=Decimal("100")),
            BudgetLine(tenant_id=tenant.id, budget_id=any_budget.id, cost_center_id=cc2.id, period_month="2026-Q3", amount=Decimal("50")),
        ]
    )
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        for b in (budget, any_budget, empty_budget):
            expected = await _old_budget_vs_actual(db, tenant, b)
            with QueryCounter(db) as qc:
                r = await ac.get(f"/api/v1/finance/budgets/{b.id}/vs-actual")
            assert r.status_code == 200, r.text
            assert r.json() == jsonable_encoder(expected)
            print(f"QUERY_COUNT budget-vs-actual {b.budget_name} {qc.count}")


@pytest.mark.asyncio
async def test_day_book_matches_old(db_session_integration):
    db = db_session_integration
    tenant, user, seed = await _seed(db)
    acc = seed["accounts"]
    wide = {"from_date": TODAY - timedelta(days=500), "to_date": TODAY + timedelta(days=60)}
    cases = [
        {"from_date": TODAY.replace(day=1), "to_date": TODAY},
        wide,
        {**wide, "voucher_type": "receipt"},
        {**wide, "account_id": acc["cash"].id},
        {**wide, "group_id": acc["sales"].group_id},
        {**wide, "party_name": " ALPHA "},
        {**wide, "account_id": acc["ap"].id, "voucher_type": "PAYMENT"},
    ]
    async with api_client(db, tenant, user) as ac:
        for params in cases:
            expected = jsonable_encoder(await _old_day_book(db, tenant, **params))
            q = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in params.items()}
            r = await ac.get("/api/v1/finance/reports/day-book", params=q)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["rows"] == expected["rows"], params
            assert body["total_amount"] == expected["total_amount"], params
            assert body["total_count"] == len(expected["rows"])

            # Optional paging returns slices of the same list with whole-range totals.
            r = await ac.get("/api/v1/finance/reports/day-book", params={**q, "limit": 5, "offset": 3})
            assert r.status_code == 200, r.text
            paged = r.json()
            assert paged["rows"] == expected["rows"][3:8], params
            assert paged["total_count"] == len(expected["rows"])
            assert paged["total_amount"] == expected["total_amount"], params

        r = await ac.get("/api/v1/finance/reports/day-book")
        assert r.status_code == 200, r.text
        default_expected = jsonable_encoder(await _old_day_book(db, tenant, from_date=TODAY.replace(day=1), to_date=TODAY))
        assert r.json()["rows"] == default_expected["rows"]


@pytest.mark.asyncio
async def test_voucher_reports_match_old(db_session_integration):
    db = db_session_integration
    tenant, user, _seed_data = await _seed(db)
    filter_sets = [
        {},
        {"from_date": TODAY - timedelta(days=200), "to_date": TODAY},
        {"voucher_type": " journal "},
        {"status_filter": "posted"},
    ]
    async with api_client(db, tenant, user) as ac:
        for f in filter_sets:
            q = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in f.items()}
            r = await ac.get("/api/v1/finance/voucher-reports/summary", params=q)
            assert r.status_code == 200, r.text
            assert r.json() == await _old_voucher_summary(db, tenant.id, **f), f
            for months_back in (12, 3, 0):
                r = await ac.get("/api/v1/finance/voucher-reports/monthly", params={**q, "months_back": months_back})
                assert r.status_code == 200, r.text
                assert r.json() == await _old_voucher_monthly(db, tenant.id, months_back=months_back, **f), f
            for limit in (10, 1):
                r = await ac.get("/api/v1/finance/voucher-reports/top-preparers", params={**q, "limit": limit})
                assert r.status_code == 200, r.text
                assert r.json() == await _old_top_preparers(db, tenant.id, limit=limit, **f), f


@pytest.mark.asyncio
async def test_post_dated_register_matches_old(db_session_integration):
    db = db_session_integration
    tenant, user, _seed_data = await _seed(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "post_dated_voucher_enabled": True}
    await db.flush()
    expected = await _old_post_dated(db, tenant.id)
    assert len(expected["rows"]) == 3
    async with api_client(db, tenant, user) as ac:
        with QueryCounter(db) as qc:
            r = await ac.get("/api/v1/finance/registers/post-dated")
        assert r.status_code == 200, r.text
        assert r.json() == expected
        print(f"QUERY_COUNT post-dated register {qc.count}")


@pytest.mark.asyncio
async def test_cash_forecast_generate_matches_old(db_session_integration):
    db = db_session_integration
    tenant, user, _seed_data = await _seed(db)
    posted_amount = await _old_cash_forecast_posted_amount(db, tenant.id)
    avg_monthly = posted_amount / 6.0 if posted_amount > 0 else 100000.0
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(
            "/api/v1/finance/cash-forecast/scenarios",
            json={"name": "Base", "start_date": TODAY.isoformat(), "months": 4},
        )
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        with QueryCounter(db) as qc:
            r = await ac.post(f"/api/v1/finance/cash-forecast/scenarios/{sid}/generate")
        assert r.status_code == 200, r.text
        print(f"QUERY_COUNT cash-forecast generate {qc.count}")
    lines = r.json()["lines"]
    assert len(lines) == 4
    for idx, line in enumerate(lines[1:], start=1):
        assert Decimal(line["inflow"]) == Decimal(str(round(avg_monthly * (0.95 + (idx % 3) * 0.05), 2)))
        assert Decimal(line["outflow"]) == Decimal(str(round(avg_monthly * (0.85 + ((idx + 1) % 4) * 0.07), 2)))


@pytest.mark.asyncio
async def test_ratio_trend_and_cashflow_match_old(db_session_integration):
    db = db_session_integration
    tenant, _user, _seed_data = await _seed(db)
    for months in (1, 6, 14):
        # Old algorithm: one calculate_ratios() (two full-ledger aggregates) per month.
        expected_points = []
        y, m = TODAY.year, TODAY.month
        from calendar import monthrange

        for _ in range(months):
            d = date(y, m, min(TODAY.day, monthrange(y, m)[1]))
            calc = await calculate_ratios(db, tenant.id, as_of_date=d)
            for name in ("current_ratio", "inventory_turnover", "debt_to_equity", "interest_coverage"):
                match = next(r for r in calc["ratios"] if r["name"] == name)
                expected_points.append((name, d.isoformat(), match["value"]))
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        for name in ("current_ratio", "inventory_turnover", "debt_to_equity", "interest_coverage"):
            with QueryCounter(db) as qc:
                got = await ratio_trend(db, tenant.id, ratio_name=name, months=months, as_of=TODAY)
            want = sorted((d, v) for n, d, v in expected_points if n == name)
            assert [(p["date"], p["value"]) for p in got["points"]] == want, (name, months)
            assert qc.count == 2
    assert await _avg_monthly_cashflow(db, tenant.id) == await _old_avg_monthly_cashflow(db, tenant.id)
    assert await _avg_monthly_cashflow(db, tenant.id, days=400) == await _old_avg_monthly_cashflow(db, tenant.id, days=400)
