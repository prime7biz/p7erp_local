"""Finance Control Tower: exception cards and their drill-down lists (PLAN Phase 3).

Every card and its drill-down list come from the SAME selectable (SQL cards) or the SAME Python list (cards that
need statement maths), so `card.count == drill.total` and `card.amount == drill.amount` by construction (acceptance 3.1).
All queries are read-only and tenant-scoped; none runs per row. Nothing here blocks a workflow (open question 15).

Query budget per request (independent of how many rows exist): SQL cards 1 statement each (+1 for a drill page),
negative cash 3, stock vs GL 8, budget 1 + 3 per FINAL budget (capped at MAX_BUDGETS_SCANNED).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, Numeric, and_, case, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.models.finance import Budget, OutstandingBill, Voucher, VoucherLine
from app.models.finance import VendorBill, VendorBillLine
from app.models.inventory import (
    DeliveryChallan,
    GoodsReceiving,
    GoodsReceivingItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Vendor,
)
from app.models.tenant import Tenant
from app.modules.finance import exception_reports_service as exc_svc
from app.modules.finance.budget_vs_actual_service import RULE_CREDIT_MINUS_DEBIT, compute_budget_vs_actual
from app.modules.finance.control.constants import (
    BUDGET_BREACH_PERCENT,
    BUDGET_WARNING_PERCENT,
    CARD_DEFS,
    DRAFT_OLD_DAYS,
    DRAFT_STATUS,
    HREF_TEMPLATE,
    MAX_AS_OF_YEAR,
    MAX_BUDGETS_SCANNED,
    MIN_AS_OF_YEAR,
    OVERDUE_CLOSED_STATUSES,
    OVERDUE_SOURCE,
    PENDING_APPROVAL_STATUSES,
    VARIANCE_TOLERANCE_MIN_AMOUNT,
    VARIANCE_TOLERANCE_PERCENT,
)
from app.modules.finance.control.schemas import ControlCard, ControlTowerResponse, ExceptionListResponse, ExceptionRow
from app.modules.finance.fiscal_year import fiscal_year_bounds, fy_start_month
from app.modules.finance.posting_core import line_base_amount_sql
from app.modules.finance.statements.constants import BANK_ACCOUNTS, CASH_IN_HAND
from app.modules.finance.statements.ledger_aggregate_service import build_ledger_calcs
from app.modules.finance.statements.stock_gl_service import build_stock_gl

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")
_STD_COLUMNS = ("ref_id", "reference", "ref_date", "party", "amount")


def _q(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Q4)


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value.quantize(Q4), "f")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


@dataclass
class CardResult:
    total: int = 0
    amount: Decimal = ZERO
    oldest: date | None = None
    rows: list[dict] = field(default_factory=list)  # standard row dicts (only when a page was requested)
    source: str | None = None
    note: str | None = None


def _row(ref_id, reference, ref_date, party, amount, details: dict | None = None) -> dict:
    return {
        "id": ref_id,
        "reference": reference,
        "date": ref_date,
        "party": party,
        "amount": _q(amount),
        "details": {k: _plain(v) for k, v in (details or {}).items()},
    }


# ---- generic SQL card ------------------------------------------------------------------------------------
async def _sql_card(db: AsyncSession, base, *, as_of: date, limit: int, offset: int) -> CardResult:
    """`base` is a select with columns ref_id, reference, ref_date, party, amount (+ optional detail columns)."""
    sub = base.subquery("exc")
    count, amount, oldest = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(sub.c.amount), 0), func.min(sub.c.ref_date)).select_from(sub)
        )
    ).one()
    result = CardResult(total=int(count), amount=_q(amount), oldest=oldest)
    if limit > 0 and result.total:
        page = (
            select(sub)
            .order_by(sub.c.ref_date.asc().nulls_last(), sub.c.ref_id.asc())
            .limit(limit)
            .offset(offset)
        )
        for m in (await db.execute(page)).mappings():
            details = {k: v for k, v in m.items() if k not in _STD_COLUMNS}
            if m["ref_date"] is not None:
                details["age_days"] = (as_of - m["ref_date"]).days
            result.rows.append(_row(m["ref_id"], m["reference"], m["ref_date"], m["party"], m["amount"], details))
    return result


def _slice_card(rows: list[dict], *, limit: int, offset: int) -> CardResult:
    result = CardResult(total=len(rows), amount=sum((r["amount"] for r in rows), ZERO))
    known = [r["date"] for r in rows if r["date"] is not None]
    result.oldest = min(known) if known else None
    if limit > 0:
        result.rows = rows[offset : offset + limit]
    return result


# ---- SQL cards ---------------------------------------------------------------------------------------------
async def _grn_not_billed(db, tenant: Tenant, as_of: date, limit: int, offset: int) -> CardResult:
    conds = exc_svc.grn_not_billed_conditions(tenant.id)
    value = (
        select(
            GoodsReceivingItem.goods_receiving_id.label("grn_id"),
            func.coalesce(func.sum(GoodsReceivingItem.quantity * func.coalesce(PurchaseOrderItem.unit_price, 0)), 0).label("v"),
        )
        .select_from(GoodsReceivingItem)
        .outerjoin(
            PurchaseOrderItem,
            and_(
                PurchaseOrderItem.id == GoodsReceivingItem.purchase_order_line_id,
                PurchaseOrderItem.tenant_id == tenant.id,
            ),
        )
        .where(
            GoodsReceivingItem.tenant_id == tenant.id,
            GoodsReceivingItem.goods_receiving_id.in_(select(GoodsReceiving.id).where(*conds)),
        )
        .group_by(GoodsReceivingItem.goods_receiving_id)
        .subquery("grn_value")
    )
    base = (
        select(
            GoodsReceiving.id.label("ref_id"),
            GoodsReceiving.grn_code.label("reference"),
            GoodsReceiving.received_date.label("ref_date"),
            Vendor.name.label("party"),
            (func.coalesce(value.c.v, 0) * func.coalesce(PurchaseOrder.exchange_rate_to_base, 1)).label("amount"),
            PurchaseOrder.po_code.label("po_code"),
            GoodsReceiving.supplier_invoice_no.label("supplier_invoice_no"),
        )
        .outerjoin(Vendor, and_(Vendor.id == GoodsReceiving.vendor_id, Vendor.tenant_id == tenant.id))
        .outerjoin(
            PurchaseOrder,
            and_(PurchaseOrder.id == GoodsReceiving.purchase_order_id, PurchaseOrder.tenant_id == tenant.id),
        )
        .outerjoin(value, value.c.grn_id == GoodsReceiving.id)
        .where(*conds)
    )
    result = await _sql_card(db, base, as_of=as_of, limit=limit, offset=offset)
    result.note = "Amount = received quantity x PO unit price in base currency; GRNs without a PO line count as 0."
    return result


async def _challan_not_invoiced(db, tenant: Tenant, as_of: date, limit: int, offset: int) -> CardResult:
    base = select(
        DeliveryChallan.id.label("ref_id"),
        DeliveryChallan.challan_code.label("reference"),
        DeliveryChallan.delivery_date.label("ref_date"),
        DeliveryChallan.customer_name.label("party"),
        cast(literal(0), Numeric(18, 4)).label("amount"),
    ).where(*exc_svc.challan_not_invoiced_conditions(tenant.id))
    result = await _sql_card(db, base, as_of=as_of, limit=limit, offset=offset)
    result.note = "Delivery challans carry no money value, so the amount is 0."
    return result


async def _vendor_bill_variance(db, tenant: Tenant, as_of: date, limit: int, offset: int) -> CardResult:
    tid = tenant.id
    price_var = case(
        (PurchaseOrderItem.id.is_not(None), func.abs(VendorBillLine.unit_price - PurchaseOrderItem.unit_price) * VendorBillLine.quantity),
        else_=0,
    )
    qty_var = case(
        (
            and_(PurchaseOrderItem.id.is_not(None), GoodsReceivingItem.id.is_not(None)),
            func.abs(VendorBillLine.quantity - GoodsReceivingItem.quantity) * PurchaseOrderItem.unit_price,
        ),
        else_=0,
    )
    expected = case(
        (
            PurchaseOrderItem.id.is_not(None),
            PurchaseOrderItem.unit_price * func.coalesce(GoodsReceivingItem.quantity, PurchaseOrderItem.quantity),
        ),
        else_=0,
    )
    rate = func.coalesce(VendorBill.exchange_rate_to_base, 1)
    bill_date = func.coalesce(VendorBill.bill_date, VendorBill.vendor_invoice_date)
    inner = (
        select(
            VendorBill.id.label("ref_id"),
            VendorBill.bill_code.label("reference"),
            bill_date.label("ref_date"),
            Vendor.name.label("party"),
            (func.sum(price_var + qty_var) * rate).label("variance"),
            (func.sum(expected) * rate).label("expected"),
        )
        .select_from(VendorBill)
        .join(VendorBillLine, and_(VendorBillLine.vendor_bill_id == VendorBill.id, VendorBillLine.tenant_id == tid))
        .outerjoin(
            PurchaseOrderItem,
            and_(PurchaseOrderItem.id == VendorBillLine.purchase_order_line_id, PurchaseOrderItem.tenant_id == tid),
        )
        .outerjoin(
            GoodsReceivingItem,
            and_(GoodsReceivingItem.id == VendorBillLine.goods_receiving_item_id, GoodsReceivingItem.tenant_id == tid),
        )
        .outerjoin(Vendor, and_(Vendor.id == VendorBill.vendor_id, Vendor.tenant_id == tid))
        .where(VendorBill.tenant_id == tid, func.upper(VendorBill.status).notin_(exc_svc.CANCELLED))
        .group_by(VendorBill.id, VendorBill.bill_code, bill_date, Vendor.name, VendorBill.exchange_rate_to_base)
        .subquery("bill_var")
    )
    tolerance = func.greatest(inner.c.expected * VARIANCE_TOLERANCE_PERCENT, VARIANCE_TOLERANCE_MIN_AMOUNT)
    base = select(
        inner.c.ref_id,
        inner.c.reference,
        inner.c.ref_date,
        inner.c.party,
        inner.c.variance.label("amount"),
        inner.c.expected.label("expected_value"),
        tolerance.label("tolerance"),
    ).where(inner.c.variance > tolerance)
    result = await _sql_card(db, base, as_of=as_of, limit=limit, offset=offset)
    result.note = (
        "Informational only: price (bill vs PO) plus quantity (bill vs GRN) difference, flagged above the greater of "
        f"{VARIANCE_TOLERANCE_PERCENT * 100:.0f}% or {VARIANCE_TOLERANCE_MIN_AMOUNT} base currency. Never blocks a bill."
    )
    return result


async def _overdue(db, tenant: Tenant, as_of: date, limit: int, offset: int, *, bill_type: str) -> CardResult:
    base_ccy = (tenant.base_currency or "BDT").upper()
    due = OutstandingBill.amount - OutstandingBill.paid_amount
    conds = [
        OutstandingBill.tenant_id == tenant.id,
        func.upper(OutstandingBill.bill_type) == bill_type,
        OutstandingBill.due_date < as_of,
        func.upper(OutstandingBill.status).notin_(OVERDUE_CLOSED_STATUSES),
        due > 0,
    ]
    base = select(
        OutstandingBill.id.label("ref_id"),
        OutstandingBill.bill_no.label("reference"),
        OutstandingBill.due_date.label("ref_date"),
        OutstandingBill.party_name.label("party"),
        case((func.upper(OutstandingBill.currency) == base_ccy, due), else_=0).label("amount"),
        OutstandingBill.currency.label("currency"),
        due.label("amount_due"),
        OutstandingBill.bill_type.label("bill_type"),
    ).where(*conds)
    result = await _sql_card(db, base, as_of=as_of, limit=limit, offset=offset)
    result.source = OVERDUE_SOURCE
    foreign = (
        await db.execute(
            select(func.count()).select_from(OutstandingBill).where(*conds, func.upper(OutstandingBill.currency) != base_ccy)
        )
    ).scalar_one()
    result.note = (
        f"Source: {OVERDUE_SOURCE}. Amount counts only {base_ccy} bills"
        + (f"; {int(foreign)} foreign-currency bill(s) are in the count but not in the amount." if foreign else ".")
    )
    return result


def _voucher_totals(tenant_id: int, voucher_ids_select):
    return (
        select(
            VoucherLine.voucher_id.label("vid"),
            func.coalesce(
                func.sum(case((func.upper(VoucherLine.entry_type) == "DEBIT", line_base_amount_sql()), else_=0)), 0
            ).label("t"),
        )
        .where(VoucherLine.tenant_id == tenant_id, VoucherLine.voucher_id.in_(voucher_ids_select))
        .group_by(VoucherLine.voucher_id)
        .subquery("voucher_total")
    )


async def _vouchers(db, tenant: Tenant, as_of: date, limit: int, offset: int, *, code: str) -> CardResult:
    if code == "VOUCHERS_PENDING_APPROVAL":
        conds = [Voucher.tenant_id == tenant.id, Voucher.status.in_(PENDING_APPROVAL_STATUSES)]
        ref_date = Voucher.voucher_date
    else:
        cutoff = datetime.combine(as_of - timedelta(days=DRAFT_OLD_DAYS), time.min)
        conds = [Voucher.tenant_id == tenant.id, Voucher.status == DRAFT_STATUS, Voucher.created_at < cutoff]
        ref_date = cast(Voucher.created_at, Date)
    totals = _voucher_totals(tenant.id, select(Voucher.id).where(*conds))
    base = (
        select(
            Voucher.id.label("ref_id"),
            Voucher.voucher_number.label("reference"),
            ref_date.label("ref_date"),
            Voucher.description.label("party"),
            func.coalesce(totals.c.t, 0).label("amount"),
            Voucher.status.label("status"),
            Voucher.voucher_type.label("voucher_type"),
            Voucher.voucher_date.label("voucher_date"),
        )
        .outerjoin(totals, totals.c.vid == Voucher.id)
        .where(*conds)
    )
    result = await _sql_card(db, base, as_of=as_of, limit=limit, offset=offset)
    result.note = "Amount = total debit of the voucher in base currency. Vouchers move on only through their approval chain."
    return result


# ---- Python cards (need statement maths) ---------------------------------------------------------------
async def _negative_cash(db, tenant: Tenant, as_of: date, limit: int, offset: int) -> CardResult:
    fy_start = fiscal_year_bounds(as_of, fy_start_month(tenant.feature_flags))[0]
    calcs, _groups = await build_ledger_calcs(db, tenant.id, from_date=fy_start, to_date=as_of, fy_start=fy_start)
    negatives = sorted(
        (c for c in calcs if not c.is_pl and c.effective_class in (CASH_IN_HAND, BANK_ACCOUNTS) and c.closing_net < ZERO),
        key=lambda c: (c.closing_net, c.account_id),
    )
    rows = [
        _row(
            c.account_id,
            c.account_number,
            None,
            c.name,
            -c.closing_net,
            {"statement_class": c.effective_class, "balance": c.closing_net, "group_id": c.group_id},
        )
        for c in negatives
    ]
    result = _slice_card(rows, limit=limit, offset=offset)
    result.note = "Cash-in-hand and bank ledgers by statement class; Bank OD is expected to be a credit balance and is left out."
    return result


async def _negative_stock(db, tenant: Tenant, as_of: date, limit: int, offset: int) -> CardResult:
    sub = exc_svc.negative_stock_select(tenant.id).subquery("neg_stock")
    cols = sub.c
    # Position-based: select() column names collide (name / name), so address them by index.
    on_hand, default_cost = cols[2], cols[6]
    amount = func.abs(on_hand) * func.coalesce(default_cost, 0)
    count, total = (
        await db.execute(select(func.count(), func.coalesce(func.sum(amount), 0)).select_from(sub))
    ).one()
    result = CardResult(total=int(count), amount=_q(total))
    if limit > 0 and result.total:
        page = (
            select(cols[0], cols[1], on_hand, cols[3], cols[4], cols[5], default_cost)
            .order_by(on_hand.asc(), cols[0].asc(), cols[1].asc().nulls_last())
            .limit(limit)
            .offset(offset)
        )
        for item_id, wh_id, oh, code, name, wh_name, cost in (await db.execute(page)).all():
            result.rows.append(
                _row(
                    item_id,
                    code,
                    None,
                    name,
                    abs(Decimal(str(oh))) * Decimal(str(cost or 0)),
                    {"warehouse_id": wh_id, "warehouse_name": wh_name, "on_hand": _q(oh), "default_cost": _q(cost)},
                )
            )
    result.note = "Current stock movements (IN minus all others); amount = shortfall x item default cost."
    return result


async def _stock_gl(db, tenant: Tenant, as_of: date, limit: int, offset: int) -> CardResult:
    stock = await build_stock_gl(db, tenant, as_of_date=as_of)
    rows: list[dict] = []
    if stock.difference != ZERO:  # exact 4-decimal equality (open question 23)
        rows.append(
            _row(
                None,
                "Stock valuation vs GL inventory",
                as_of,
                None,
                abs(stock.difference),
                {
                    "fifo_total": stock.fifo_total,
                    "gl_total": stock.gl_total,
                    "difference": stock.difference,
                    "unclassified_stock": stock.unclassified_stock,
                },
            )
        )
    result = _slice_card(rows, limit=limit, offset=offset)
    result.note = "Same valuation as the Stock vs GL statement; alert only, never blocks a transaction."
    return result


async def _budget_lines(db, tenant: Tenant, as_of: date) -> list[dict]:
    """Rows for FINAL budget lines whose period covers `as_of`, with used percent (cost-type lines only)."""
    budgets = (
        await db.execute(
            select(Budget)
            .where(Budget.tenant_id == tenant.id, Budget.status == "FINAL")
            .order_by(Budget.id.desc())
            .limit(MAX_BUDGETS_SCANNED)
        )
    ).scalars().all()
    out: list[dict] = []
    for budget in budgets:
        data = await compute_budget_vs_actual(db, tenant, budget)
        for line in data["rows"]:
            if line.get("net_rule") == RULE_CREDIT_MINUS_DEBIT:
                continue  # income / liability lines: reaching the plan is not a breach
            start, end = line.get("period_start"), line.get("period_end")
            if start and end and not (date.fromisoformat(start) <= as_of <= date.fromisoformat(end)):
                continue
            planned = Decimal(str(line["budget_amount"]))
            if planned <= ZERO:
                continue
            actual = Decimal(str(line["actual_amount"]))
            out.append(
                {
                    "budget": budget,
                    "line": line,
                    "planned": planned,
                    "actual": actual,
                    "percent": actual / planned * Decimal("100"),
                    "end": date.fromisoformat(end) if end else None,
                }
            )
    return out


def _budget_rows(lines: list[dict], *, breach: bool) -> list[dict]:
    if breach:
        chosen = [x for x in lines if x["percent"] >= BUDGET_BREACH_PERCENT]
    else:
        chosen = [x for x in lines if BUDGET_WARNING_PERCENT <= x["percent"] < BUDGET_BREACH_PERCENT]
    chosen.sort(key=lambda x: (-x["percent"], x["budget"].id, x["line"]["line_id"]))
    return [
        _row(
            x["line"]["line_id"],
            x["budget"].budget_name,
            x["end"],
            None,
            x["actual"],
            {
                "budget_id": x["budget"].id,
                "cost_center_id": x["line"]["cost_center_id"],
                "account_id": x["line"]["account_id"],
                "period_month": x["line"]["period_month"],
                "budget_amount": x["planned"],
                "used_percent": x["percent"].quantize(Decimal("0.01")),
            },
        )
        for x in chosen
    ]


# ---- orchestration -------------------------------------------------------------------------------------------
class _Run:
    """One request: caches the budget scan shared by BUDGET_BREACH and BUDGET_WARNING."""

    def __init__(self, db: AsyncSession, tenant: Tenant, as_of: date):
        self.db, self.tenant, self.as_of = db, tenant, as_of
        self._budget: list[dict] | None = None

    async def fetch(self, code: str, limit: int, offset: int) -> CardResult:
        db, tenant, as_of = self.db, self.tenant, self.as_of
        if code == "GRN_NOT_BILLED":
            return await _grn_not_billed(db, tenant, as_of, limit, offset)
        if code == "CHALLAN_NOT_INVOICED":
            return await _challan_not_invoiced(db, tenant, as_of, limit, offset)
        if code == "VENDOR_BILL_VARIANCE":
            return await _vendor_bill_variance(db, tenant, as_of, limit, offset)
        if code == "NEGATIVE_CASH":
            return await _negative_cash(db, tenant, as_of, limit, offset)
        if code == "NEGATIVE_STOCK":
            return await _negative_stock(db, tenant, as_of, limit, offset)
        if code == "OVERDUE_RECEIVABLES":
            return await _overdue(db, tenant, as_of, limit, offset, bill_type="RECEIVABLE")
        if code == "OVERDUE_PAYABLES":
            return await _overdue(db, tenant, as_of, limit, offset, bill_type="PAYABLE")
        if code in ("BUDGET_BREACH", "BUDGET_WARNING"):
            if self._budget is None:
                self._budget = await _budget_lines(db, tenant, as_of)
            result = _slice_card(_budget_rows(self._budget, breach=code == "BUDGET_BREACH"), limit=limit, offset=offset)
            result.note = "FINAL budgets only; amount = actual used on the flagged lines. Alert only, no new blocking rule."
            return result
        if code == "STOCK_GL_MISMATCH":
            return await _stock_gl(db, tenant, as_of, limit, offset)
        if code in ("VOUCHERS_PENDING_APPROVAL", "VOUCHERS_DRAFT_OLD"):
            return await _vouchers(db, tenant, as_of, limit, offset, code=code)
        raise KeyError(code)


def _card(code: str, result: CardResult | None, *, failed: bool = False) -> ControlCard:
    label, severity = CARD_DEFS[code]
    result = result or CardResult()
    return ControlCard(
        code=code,
        label=label,
        severity=severity,  # type: ignore[arg-type]
        count=result.total,
        amount=result.amount,
        oldest_date=result.oldest,
        href=HREF_TEMPLATE.format(code=code),
        source=result.source,
        note="This check could not be calculated; it is not shown as zero exceptions." if failed else result.note,
    )


def check_as_of(as_of: date) -> None:
    """ValueError (-> 422) when the as-of year is outside the supported range (date maths would overflow)."""
    if not (MIN_AS_OF_YEAR <= as_of.year <= MAX_AS_OF_YEAR):
        raise ValueError(f"as_of_date must be between the years {MIN_AS_OF_YEAR} and {MAX_AS_OF_YEAR}")


async def build_control_tower(db: AsyncSession, tenant: Tenant, *, as_of: date, severity: str) -> ControlTowerResponse:
    check_as_of(as_of)
    run = _Run(db, tenant, as_of)
    cards: list[ControlCard] = []
    for code, (_label, card_severity) in CARD_DEFS.items():
        if severity != "all" and card_severity != severity:
            continue
        try:
            cards.append(_card(code, await run.fetch(code, 0, 0)))
        except Exception:  # one broken check must not blank the whole home screen
            logger.exception("control_tower_card_failed code=%s tenant=%s", code, tenant.id)
            await safe_async_session_rollback(db)
            cards.append(_card(code, None, failed=True))
    return ControlTowerResponse(
        as_of_date=as_of,
        base_currency=tenant.base_currency or "BDT",
        severity=severity,
        cards=cards,
        data_as_of=datetime.utcnow(),
    )


async def build_exception_list(
    db: AsyncSession, tenant: Tenant, *, code: str, as_of: date, limit: int, offset: int
) -> ExceptionListResponse:
    if code not in CARD_DEFS:
        raise KeyError(code)
    check_as_of(as_of)
    result = await _Run(db, tenant, as_of).fetch(code, limit, offset)
    label, severity = CARD_DEFS[code]
    return ExceptionListResponse(
        code=code,
        label=label,
        severity=severity,  # type: ignore[arg-type]
        as_of_date=as_of,
        base_currency=tenant.base_currency or "BDT",
        total=result.total,
        amount=result.amount,
        oldest_date=result.oldest,
        limit=limit,
        offset=offset,
        source=result.source,
        note=result.note,
        rows=[ExceptionRow(**r) for r in result.rows],
    )
