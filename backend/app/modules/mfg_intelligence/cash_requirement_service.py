"""Factory cash requirement, weekly (Manufacturing Intelligence Phase 3; doc 14 sections 12-14 are binding). Read-only.

Window: `date_from` .. `date_from + horizon_days - 1` (default 90, max 180), 7-day bins from `date_from`. A row dated
before `date_from` is shown in week 1: OVERDUE when it was due before today, DUE_BEFORE_START when it falls between
today and a future `date_from`. A row after the window is left out (counted); a row without a date is listed
(`week_index` null) and kept out of the weeks. Every row: direction, category, source type / id, date rule,
confidence (CONTRACTUAL / SCHEDULED / ESTIMATED), class FORECAST, source currency + amount, rate and rate source,
base amount. A foreign amount without a stored rate is UNKNOWN: kept out of every total and listed in
`unknown_by_currency`.

Outflows
  BTB_MATURITY        BtbLc outer join BtbLcAccounting; BtbLc status not CLOSED / CANCELLED / DRAFT, accounting
                      not REALIZED, not funded by a facility utilization. Date: accounting maturity_date, else
                      BtbLc.maturity_date (CONTRACTUAL), else linked PO expected date (else LC / open date) +
                      `btb_usance_days` (ESTIMATED, BTB_DATE_ESTIMATED). Amount: maturity_amount else amount, x BtbLc
                      rate. Stored tranches only split the dates.
  FACILITY_REPAYMENT  active utilizations: schedule lines upcoming / due / overdue / partially paid (emi - paid);
                      a utilization without any schedule line = bullet: maturity date, outstanding principal +
                      accrued interest. Utilization rate.
  AP_BILL / VENDOR_BILL   finance AR/AP due source (`resolve_finance_ar_ap_due_source`), open bills only:
                      outstanding_bills: PAYABLE bills, amount - paid at due date (foreign = UNKNOWN); a POSTED
                      vendor bill whose GRN / PO has no AP bill counts at its due date (PAYMENT_STATUS_UNKNOWN);
                      more than STALE_PAYABLE_DAYS past due = stale (note STALE_PAYABLES, not in totals).
                      party_ledger: vendor CR bills, pending amount at due date (amounts as recorded).
                      bill_references: PAYABLE references, pending amount at due date (amounts as recorded).
  GRN_NOT_BILLED      RECEIVED GRN lines of a PO with no posted vendor-bill line / header and no AP bill marker:
                      QC-accepted value at GRN date + vendor payment_terms_days (0 when unset), PO rate.
  PO_UNRECEIVED       open POs (APPROVED / PARTIALLY_RECEIVED), not billed as a whole: (ordered - accepted) x price
                      at PO expected date + vendor terms, PO rate. Foreign / non-local vendor without a BTB link is
                      counted here and flagged PO_FUNDING_UNKNOWN.
  PAYROLL_NET / PAYROLL_STATUTORY   newest finalised-or-later run per period whose payment_date is on or after the
                      earlier of today and date_from (net pay; statutory = PF / ESI / PT / BD TDS of the newest
                      calculation snapshots); earlier periods ASSUMED_PAID; later months repeat the last period, due
                      on the 7th working day after month end.
  Dedupe (each source counted once, every skip rule runs in SQL before any row cap): a PO / GRN / bill linked to a
  live BTB LC is paid only through the BTB; a BTB LC or PO linked to a facility utilization (any status except draft
  / cancelled) is paid only through the facility; an AP bill with a GRN marker (or a posted vendor bill / bill line
  of that GRN item) removes the GRN; a PO-only AP bill (or a posted PO-level vendor bill) removes the whole PO.
Inflows
  COMMERCIAL_INVOICE  ISSUED invoices (DRAFT never counts as cash): total - active receipt allocations, invoice rate,
                      at invoice date + `export_document_days` + `export_usance_days` (SCHEDULED). More than
                      STALE_RECEIVABLE_DAYS past that date = doubtful (note STALE_RECEIVABLES, not in totals).
  ORDER_REMAINING     confirmed orders: max(0, (gross contract value - invoiced on ISSUED invoices) x net/gross -
                      POSTED proforma advances not applied to an invoice of the order); net = gross - buying
                      commission (deducted from export proceeds). Date: predicted finish (Phase 1, first 200 orders
                      by delivery date; else / unknown: Order.delivery_date) + document + usance days (ESTIMATED).
Every capped source reads newest first; hitting a cap adds `SOURCE_TRUNCATED:<category>` and `forecast_complete`
false - never silent.
Opening cash = finance `pool_balances_by_class` before `date_from`, with and without Bank OD; the weekly balance and
FINANCING_GAP use net cash (cash + bank minus the drawn overdraft, owner decision 2026-11-13, treasury standard).
Facility headroom is a memo, never added to cash.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, exists, false, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.common.tenant_feature_keys import (
    AR_AP_DUE_SOURCE_BILL_REFERENCES,
    AR_AP_DUE_SOURCE_OUTSTANDING_BILLS,
    AR_AP_DUE_SOURCE_PARTY_LEDGER,
    resolve_finance_ar_ap_due_source,
)
from app.models import Order, ProformaInvoiceOrder, Tenant
from app.models.commercial import (
    BtbLc,
    BtbLcAccounting,
    BtbMaturityTranche,
    CommercialInvoice,
    CommercialInvoiceLine,
    CommercialInvoiceReceiptAllocation,
    ProformaReceiptAllocation,
)
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.finance import BillReference, OutstandingBill, VendorBill, VendorBillLine
from app.models.hr_payroll import PayrollCalculationSnapshot, PayrollPeriod, PayrollRun, PayrollRunLine
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem, Vendor
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.modules.finance.statements.cash_flow_service import cash_pool_clause, pool_balances_by_class
from app.modules.finance.statements.classification_service import load_group_classification
from app.modules.finance.statements.constants import BANK_ACCOUNTS, BANK_OD, CASH_IN_HAND
from app.modules.inventory.open_po_supply_service import usable_received_qty
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext, load_calendar
from app.modules.mfg_intelligence.confirmed_demand import confirmed_status_clause
from app.modules.mfg_intelligence.decimals import ZERO, to_dec
from app.modules.mfg_intelligence.money import (
    CLASS_FORECAST,
    RATE_AS_RECORDED,
    UnknownByCurrency,
    base_currency,
    fx,
    m4,
    norm_ccy,
    positive,
    q4,
)
from app.modules.mfg_intelligence.revenue_resolver import load_order_money_context, resolve_revenue
from app.modules.production.planning_settings_service import read_planning_settings

DEFAULT_HORIZON_DAYS = 90
MAX_HORIZON_DAYS = 180
MAX_ROWS = 2000
# Posted vendor bills with unknown payment status that are more than this many days past due are stale ageing items
# (listed for review, not cash due in week 1).
STALE_PAYABLE_DAYS = 90
# Issued invoices more than this many days past their expected realisation date are doubtful receivables.
STALE_RECEIVABLE_DAYS = 90
MAX_ORDERS = 5000
MAX_PREDICTED_ORDERS = 200
MAX_SOURCE_ROWS = 20000  # per source query, newest first; exceeding it is reported (SOURCE_TRUNCATED:<category>)

OUT, IN = "OUT", "IN"
CONTRACTUAL, SCHEDULED, ESTIMATED = "CONTRACTUAL", "SCHEDULED", "ESTIMATED"

BTB_EXCLUDED_STATUSES = ("CLOSED", "CANCELLED", "CANCELED", "DRAFT")
BTB_NO_TAKEOVER_STATUSES = ("DRAFT", "CANCELLED", "CANCELED")
UTIL_NOT_FUNDING_STATUSES = ("draft", "cancelled", "canceled")
OB_CLOSED_STATUSES = ("PAID", "SETTLED", "CLOSED", "CANCELLED", "VOID", "REJECTED")
OB_VOID_STATUSES = ("CANCELLED", "VOID", "REJECTED")
PL_OPEN_STATUSES = ("PENDING", "PARTIAL", "OVERDUE")
BR_OPEN_STATUSES = ("OPEN", "PARTIALLY_SETTLED")
FACILITY_OPEN_LINE_STATUSES = ("upcoming", "due", "overdue", "partially_paid")
OPEN_PO_STATUSES = ("APPROVED", "PARTIALLY_RECEIVED")
PAYROLL_DONE_STATUSES = ("FINALIZED", "CHECKED", "APPROVED", "POSTED")
PAYROLL_STATUTORY_KEYS = ("employee_pf", "employer_pf", "employee_esi", "employer_esi", "pt", "bd_tds")
# Commercial invoice statuses (commercial_invoice_service: DRAFT -> ISSUED -> CANCELLED). Only ISSUED is a receivable.
RECEIVABLE_INVOICE_STATUSES = ("ISSUED",)
ACTIVE_ALLOCATION_STATUSES = ("PENDING", "POSTED")
PAYROLL_PAY_WORKING_DAY = 7  # Bangladesh Labour Act s.123: within 7 working days after the wage period

_PO_MARKER = re.compile(r"(?:^|[\s|])PO:([^\s|]+)")
_GRN_MARKER = re.compile(r"(?:^|[\s|])GRN:([^\s|]+)")
# Same markers as PostgreSQL regular expressions (substring() returns the capture group, NULL when absent)
_PG_PO_MARKER = r"(?:^|[[:space:]|])PO:([^[:space:]|]+)"
_PG_GRN_MARKER = r"(?:^|[[:space:]|])GRN:([^[:space:]|]+)"


@dataclass
class CashRow:
    direction: str
    category: str
    source_type: str
    source_id: int | None
    reference: str | None
    due_date: date | None
    date_rule: str
    confidence: str
    currency: str | None
    source_amount: Decimal | None
    rate: Decimal | None
    rate_source: str | None
    amount_base: Decimal | None
    reason_codes: list[str] = field(default_factory=list)
    week_index: int | None = None
    overdue: bool = False


def parse_markers(notes: str | None) -> tuple[set[str], set[str]]:
    """(PO codes, GRN codes) from finance AP bill notes (`... | PO:{code} | GRN:{code}`)."""
    text = notes or ""
    return set(_PO_MARKER.findall(text)), set(_GRN_MARKER.findall(text))


def add_days(base: date | None, days: Any, reasons: list[str] | None = None) -> date | None:
    """base + days, or None (reason DATE_OUT_OF_RANGE) when the result would leave the calendar."""
    if base is None:
        return None
    try:
        return base + timedelta(days=int(days or 0))
    except (OverflowError, ValueError):
        if reasons is not None:
            reasons.append("DATE_OUT_OF_RANGE")
        return None


def nth_working_day_after(period_end: date, n: int, calendar: CalendarContext) -> date:
    cur, count = period_end, 0
    for _ in range(400):
        cur += timedelta(days=1)
        if calendar.is_working(cur):
            count += 1
            if count >= n:
                return cur
    return cur


def _month_end(year: int, month: int) -> date:
    nxt = date(year + (month // 12), month % 12 + 1, 1)
    return nxt - timedelta(days=1)


def assign_weeks(
    rows: list[CashRow], date_from: date, date_to: date, today: date | None = None
) -> tuple[list[CashRow], int]:
    """Week index per row (anything due before date_from -> week 0); returns (kept rows, rows beyond the window).

    Due before today = OVERDUE; due on / after today but before a future date_from = DUE_BEFORE_START (both week 1).
    """
    kept: list[CashRow] = []
    beyond = 0
    for r in rows:
        if r.due_date is None:
            r.week_index = None
            kept.append(r)
            continue
        if r.due_date > date_to:
            beyond += 1
            continue
        if r.due_date < date_from:
            r.week_index = 0
            if today is None or r.due_date < today:
                r.overdue = True
                r.reason_codes.append("OVERDUE")
            else:
                r.reason_codes.append("DUE_BEFORE_START")
        else:
            r.week_index = (r.due_date - date_from).days // 7
        kept.append(r)
    return kept, beyond


def build_weeks(rows: list[CashRow], date_from: date, date_to: date, opening: Decimal) -> list[dict[str, Any]]:
    n_weeks = ((date_to - date_from).days // 7) + 1
    inflow = [ZERO] * n_weeks
    outflow = [ZERO] * n_weeks
    by_cat: list[dict[str, Decimal]] = [defaultdict(lambda: ZERO) for _ in range(n_weeks)]
    for r in rows:
        if r.week_index is None or r.amount_base is None:
            continue
        if r.direction == IN:
            inflow[r.week_index] += r.amount_base
        else:
            outflow[r.week_index] += r.amount_base
        by_cat[r.week_index][r.category] += r.amount_base
    weeks: list[dict[str, Any]] = []
    balance = opening
    for i in range(n_weeks):
        start = date_from + timedelta(days=7 * i)
        end = min(start + timedelta(days=6), date_to)
        net = inflow[i] - outflow[i]
        closing = balance + net
        weeks.append(
            {
                "week_index": i,
                "week_start": start,
                "week_end": end,
                "opening": m4(balance),
                "inflow": m4(inflow[i]),
                "outflow": m4(outflow[i]),
                "net": m4(net),
                "closing": m4(closing),
                "below_zero": closing < ZERO,
                "by_category": {k: m4(v) for k, v in sorted(by_cat[i].items())},
            }
        )
        balance = closing
    return weeks


def _row_out(r: CashRow) -> dict[str, Any]:
    return {
        "direction": r.direction,
        "category": r.category,
        "source_type": r.source_type,
        "source_id": r.source_id,
        "reference": r.reference,
        "due_date": r.due_date,
        "date_rule": r.date_rule,
        "confidence": r.confidence,
        "value_class": CLASS_FORECAST,
        "currency": r.currency,
        "source_amount": m4(r.source_amount),
        "rate": format(r.rate.normalize(), "f") if r.rate is not None else None,
        "rate_source": r.rate_source,
        "amount": m4(r.amount_base),
        "week_index": r.week_index,
        "overdue": r.overdue,
        "reason_codes": list(dict.fromkeys(r.reason_codes)),
    }


class _Builder:
    def __init__(self, base: str) -> None:
        self.base = base
        self.rows: list[CashRow] = []
        self.truncated: list[str] = []

    def cap(self, rows: list[Any], category: str) -> list[Any]:
        """Rows of a `.limit(MAX_SOURCE_ROWS + 1)` query: keep the cap, record the truncation (never silent)."""
        limit = MAX_SOURCE_ROWS
        if len(rows) > limit:
            if category not in self.truncated:
                self.truncated.append(category)
            return rows[:limit]
        return rows

    def add(
        self,
        direction: str,
        category: str,
        source_type: str,
        source_id: int | None,
        reference: str | None,
        due: date | None,
        date_rule: str,
        confidence: str,
        currency: str | None,
        source_amount: Decimal | None,
        stored_rate: Any,
        rate_source: str,
        reasons: list[str] | None = None,
        *,
        as_recorded: bool = False,
    ) -> None:
        if source_amount is None or source_amount <= ZERO:
            return
        if as_recorded:
            rate, r_src = Decimal("1"), RATE_AS_RECORDED
            ccy = currency or self.base
        else:
            ccy = norm_ccy(currency) or self.base
            rate, r_src = fx(ccy, self.base, stored_rate, rate_source)
        reason_codes = list(reasons or [])
        if rate is None:
            reason_codes.append("FX_UNKNOWN")
        self.rows.append(
            CashRow(
                direction=direction,
                category=category,
                source_type=source_type,
                source_id=source_id,
                reference=reference,
                due_date=due,
                date_rule=date_rule,
                confidence=confidence,
                currency=ccy,
                source_amount=q4(source_amount),
                rate=rate,
                rate_source=r_src,
                amount_base=q4(source_amount * rate) if rate is not None else None,
                reason_codes=reason_codes,
            )
        )


# ------------------------------------------------------------------ SQL dedupe rules (run before any cap)


class _Rules:
    """Correlated SQL conditions shared by the payable readers (all tenant scoped, NULL-safe: always true / false)."""

    def __init__(self, tid: int, source: str) -> None:
        self.tid = tid
        self.markers = source == AR_AP_DUE_SOURCE_OUTSTANDING_BILLS

    def _takeover_btb_ids(self):
        return select(BtbLc.id).where(
            BtbLc.tenant_id == self.tid, func.upper(func.trim(BtbLc.status)).notin_(BTB_NO_TAKEOVER_STATUSES)
        )

    def _util_conds(self):
        return [
            FacilityUtilization.tenant_id == self.tid,
            func.lower(func.trim(FacilityUtilization.status)).notin_(UTIL_NOT_FUNDING_STATUSES),
        ]

    def facility_btb_ids(self):
        return select(FacilityUtilization.linked_btb_lc_id).where(
            *self._util_conds(), FacilityUtilization.linked_btb_lc_id.is_not(None)
        )

    def funded_btb(self, btb_col):
        return and_(btb_col.is_not(None), or_(btb_col.in_(self._takeover_btb_ids()), btb_col.in_(self.facility_btb_ids())))

    def funded_po(self, po_id_col, po_btb_col, grn_btb_col=None):
        """True when the purchase is paid through a live BTB LC or a facility utilization."""
        btb_po = select(BtbLc.purchase_order_id).where(
            BtbLc.tenant_id == self.tid,
            func.upper(func.trim(BtbLc.status)).notin_(BTB_NO_TAKEOVER_STATUSES),
            BtbLc.purchase_order_id.is_not(None),
        )
        util_po = select(FacilityUtilization.linked_purchase_order_id).where(
            *self._util_conds(), FacilityUtilization.linked_purchase_order_id.is_not(None)
        )
        terms = [
            and_(po_id_col.is_not(None), or_(po_id_col.in_(btb_po), po_id_col.in_(util_po))),
            self.funded_btb(po_btb_col),
        ]
        if grn_btb_col is not None:
            terms.append(self.funded_btb(grn_btb_col))
        return or_(*terms)

    def _posted_vb(self, vb):
        return [vb.tenant_id == self.tid, func.upper(vb.status) == "POSTED"]

    def grn_header_billed(self, grn_id_col):
        vb = aliased(VendorBill)
        return exists().where(*self._posted_vb(vb), vb.goods_receiving_id == grn_id_col)

    def grn_item_billed(self, grn_item_id_col):
        vb = aliased(VendorBill)
        vbl = aliased(VendorBillLine)
        return exists().where(
            vbl.tenant_id == self.tid, vbl.goods_receiving_item_id == grn_item_id_col, vb.id == vbl.vendor_bill_id,
            *self._posted_vb(vb),
        )

    def po_vb_billed(self, po_id_col):
        """A posted PO-level vendor bill (no GRN on the header or any line) bills the whole PO."""
        vb = aliased(VendorBill)
        vbl = aliased(VendorBillLine)
        return exists().where(
            *self._posted_vb(vb),
            vb.purchase_order_id == po_id_col,
            vb.goods_receiving_id.is_(None),
            ~exists().where(vbl.vendor_bill_id == vb.id, vbl.goods_receiving_item_id.is_not(None)),
        )

    def _ob_conds(self, ob):
        return [
            ob.tenant_id == self.tid,
            func.upper(ob.bill_type) == "PAYABLE",
            func.upper(ob.status).notin_(OB_VOID_STATUSES),
        ]

    def grn_marker_billed(self, grn_code_col):
        """An AP bill (open or paid) with a `GRN:{code}` marker; only for the outstanding_bills source."""
        if not self.markers:
            return false()
        ob = aliased(OutstandingBill)
        return exists().where(*self._ob_conds(ob), func.substring(ob.notes, _PG_GRN_MARKER) == grn_code_col)

    def po_marker_billed(self, po_code_col):
        """An AP bill with a `PO:{code}` marker and no GRN marker bills the whole PO (outstanding_bills only)."""
        if not self.markers:
            return false()
        ob = aliased(OutstandingBill)
        return exists().where(
            *self._ob_conds(ob),
            func.substring(ob.notes, _PG_PO_MARKER) == po_code_col,
            func.substring(ob.notes, _PG_GRN_MARKER).is_(None),
        )

    def vb_line_grn_marker_billed(self, vb_id_col):
        if not self.markers:
            return false()
        vbl = aliased(VendorBillLine)
        gri = aliased(GoodsReceivingItem)
        gr = aliased(GoodsReceiving)
        return exists().where(
            vbl.tenant_id == self.tid, vbl.vendor_bill_id == vb_id_col, gri.id == vbl.goods_receiving_item_id,
            gr.id == gri.goods_receiving_id, gr.tenant_id == self.tid, self.grn_marker_billed(gr.grn_code),
        )


# ------------------------------------------------------------------ outflow readers


async def _facility_rows(db: AsyncSession, tenant_id: int, b: _Builder) -> None:
    utils = (
        await db.execute(
            select(
                FacilityUtilization.id,
                FacilityUtilization.utilization_code,
                FacilityUtilization.currency,
                FacilityUtilization.exchange_rate_to_base,
                FacilityUtilization.maturity_date,
                FacilityUtilization.outstanding_principal,
                FacilityUtilization.accrued_interest_outstanding,
            ).where(FacilityUtilization.tenant_id == tenant_id, FacilityUtilization.status == "active")
        )
    ).all()
    util_ids = [int(u[0]) for u in utils]
    if not util_ids:
        return
    lines_by_util: dict[int, list[Any]] = defaultdict(list)
    any_line = {
        int(x)
        for (x,) in (
            await db.execute(
                select(RepaymentScheduleLine.facility_utilization_id)
                .where(RepaymentScheduleLine.tenant_id == tenant_id, RepaymentScheduleLine.facility_utilization_id.in_(util_ids))
                .group_by(RepaymentScheduleLine.facility_utilization_id)
            )
        ).all()
    }
    for row in (
        await db.execute(
            select(
                RepaymentScheduleLine.id,
                RepaymentScheduleLine.facility_utilization_id,
                RepaymentScheduleLine.installment_number,
                RepaymentScheduleLine.due_date,
                RepaymentScheduleLine.emi_amount,
                RepaymentScheduleLine.paid_amount,
                RepaymentScheduleLine.status,
            ).where(
                RepaymentScheduleLine.tenant_id == tenant_id,
                RepaymentScheduleLine.facility_utilization_id.in_(util_ids),
                RepaymentScheduleLine.status.in_(FACILITY_OPEN_LINE_STATUSES),
            )
        )
    ).all():
        lines_by_util[int(row[1])].append(row)
    for uid, code, ccy, rate, maturity, outstanding, accrued in utils:
        uid = int(uid)
        for lid, _u, inst, due, emi, paid, st in lines_by_util.get(uid, []):
            amount = (to_dec(emi) or ZERO) - (to_dec(paid) or ZERO if st == "partially_paid" else ZERO)
            b.add(OUT, "FACILITY_REPAYMENT", "repayment_schedule_line", int(lid), f"{code} #{inst}", due,
                  "SCHEDULE_DUE_DATE", CONTRACTUAL, ccy, amount, rate, "UTILIZATION_EXCHANGE_RATE")
        if uid not in any_line:
            amount = (to_dec(outstanding) or ZERO) + (to_dec(accrued) or ZERO)
            b.add(OUT, "FACILITY_REPAYMENT", "facility_utilization", uid, code, maturity,
                  "BULLET_MATURITY_DATE", CONTRACTUAL, ccy, amount, rate, "UTILIZATION_EXCHANGE_RATE",
                  [] if maturity else ["MATURITY_DATE_MISSING"])


async def _btb_rows(db: AsyncSession, tenant_id: int, b: _Builder, rules: _Rules, btb_usance_days: int) -> None:
    acc_status = func.upper(func.coalesce(BtbLcAccounting.status, ""))
    eff_date = func.coalesce(BtbLcAccounting.maturity_date, BtbLc.maturity_date, BtbLc.lc_date, BtbLc.open_date)
    live = b.cap(
        (
            await db.execute(
                select(
                    BtbLc.id,
                    BtbLc.reference,
                    BtbLc.lc_date,
                    BtbLc.open_date,
                    BtbLc.maturity_date,
                    BtbLc.maturity_amount,
                    BtbLc.amount,
                    BtbLc.currency,
                    BtbLc.exchange_rate_to_base,
                    BtbLc.purchase_order_id,
                    BtbLcAccounting.maturity_date,
                )
                .outerjoin(BtbLcAccounting, and_(BtbLcAccounting.btb_lc_id == BtbLc.id, BtbLcAccounting.tenant_id == tenant_id))
                .where(
                    BtbLc.tenant_id == tenant_id,
                    func.upper(func.trim(BtbLc.status)).notin_(BTB_EXCLUDED_STATUSES),
                    acc_status != "REALIZED",
                    BtbLc.id.notin_(rules.facility_btb_ids()),
                )
                .order_by(eff_date.desc().nulls_last(), BtbLc.id.desc())
                .limit(MAX_SOURCE_ROWS + 1)
            )
        ).all(),
        "BTB_MATURITY",
    )
    live_ids = [int(r[0]) for r in live]
    if not live_ids:
        return
    tranches: dict[int, list[Any]] = defaultdict(list)
    po_expected: dict[int, date | None] = {}
    btb_po_expected: dict[int, date | None] = {}
    for t in (
        await db.execute(
            select(BtbMaturityTranche.btb_lc_id, BtbMaturityTranche.tranche_no, BtbMaturityTranche.maturity_date,
                   BtbMaturityTranche.amount, BtbMaturityTranche.currency, BtbMaturityTranche.id)
            .where(BtbMaturityTranche.tenant_id == tenant_id, BtbMaturityTranche.btb_lc_id.in_(live_ids))
            .order_by(BtbMaturityTranche.btb_lc_id, BtbMaturityTranche.tranche_no)
        )
    ).all():
        tranches[int(t[0])].append(t)
    linked_po = [int(r[9]) for r in live if r[9]]
    for pid, bid, expected in (
        await db.execute(
            select(PurchaseOrder.id, PurchaseOrder.btb_lc_id, PurchaseOrder.expected_date).where(
                PurchaseOrder.tenant_id == tenant_id,
                or_(PurchaseOrder.btb_lc_id.in_(live_ids), PurchaseOrder.id.in_(linked_po or [0])),
            )
        )
    ).all():
        po_expected[int(pid)] = expected
        if bid:
            btb_po_expected.setdefault(int(bid), expected)
    for (bid, ref, lc_date, open_date, lc_maturity, mat_amount, amount, ccy, rate, po_id, acc_maturity) in live:
        bid = int(bid)
        if tranches.get(bid):
            for _b, no, t_date, t_amount, t_ccy, t_id in tranches[bid]:
                b.add(OUT, "BTB_MATURITY", "btb_maturity_tranche", int(t_id), f"{ref} T{no}", t_date,
                      "BTB_TRANCHE_MATURITY", CONTRACTUAL, t_ccy or ccy, to_dec(t_amount), rate, "BTB_LC_EXCHANGE_RATE")
            continue
        value = to_dec(mat_amount) if positive(mat_amount) is not None else to_dec(amount)
        if acc_maturity is not None:
            due, rule, conf, reasons = acc_maturity, "BTB_ACCOUNTING_MATURITY", CONTRACTUAL, []
        elif lc_maturity is not None:
            due, rule, conf, reasons = lc_maturity, "BTB_LC_MATURITY", CONTRACTUAL, []
        else:
            anchor = po_expected.get(int(po_id)) if po_id else None
            if anchor is None:
                anchor = btb_po_expected.get(bid)
            anchor = anchor or lc_date or open_date
            rule, conf, reasons = "PO_EXPECTED_OR_LC_DATE_PLUS_BTB_USANCE", ESTIMATED, ["BTB_DATE_ESTIMATED"]
            due = add_days(anchor, btb_usance_days, reasons)
            if due is None:
                reasons.append("BTB_DATE_UNKNOWN")
        b.add(OUT, "BTB_MATURITY", "btb_lc", bid, ref, due, rule, conf, ccy, value, rate, "BTB_LC_EXCHANGE_RATE", reasons)


async def _payables(db: AsyncSession, tenant: Tenant, b: _Builder, rules: _Rules, source: str, date_from: date) -> list[str]:
    """Open AP bills, posted vendor bills, GRN not billed and unreceived PO value, deduplicated in SQL. Returns notes."""
    tid = tenant.id
    notes: list[str] = [f"AP source: {source}."]

    if source == AR_AP_DUE_SOURCE_PARTY_LEDGER:
        due_eff = func.coalesce(PartyLedgerBill.due_date, PartyLedgerBill.bill_date)
        rows = b.cap(
            (
                await db.execute(
                    select(PartyLedgerBill.id, PartyLedgerBill.bill_number, due_eff, PartyLedgerBill.pending_amount)
                    .join(PartyLedger, and_(PartyLedger.id == PartyLedgerBill.party_ledger_id, PartyLedger.tenant_id == tid))
                    .outerjoin(VendorBill, and_(VendorBill.id == PartyLedgerBill.vendor_bill_id, VendorBill.tenant_id == tid))
                    .outerjoin(PurchaseOrder, and_(PurchaseOrder.id == VendorBill.purchase_order_id, PurchaseOrder.tenant_id == tid))
                    .where(
                        PartyLedgerBill.tenant_id == tid,
                        PartyLedger.party_type == "VENDOR",
                        PartyLedgerBill.amount_type == "CR",
                        PartyLedgerBill.status.in_(PL_OPEN_STATUSES),
                        PartyLedgerBill.pending_amount > 0,
                        ~rules.funded_po(VendorBill.purchase_order_id, PurchaseOrder.btb_lc_id),
                    )
                    .order_by(due_eff.desc().nulls_last(), PartyLedgerBill.id.desc())
                    .limit(MAX_SOURCE_ROWS + 1)
                )
            ).all(),
            "AP_BILL",
        )
        for pid, num, due, pending in rows:
            b.add(OUT, "AP_BILL", "party_ledger_bill", int(pid), num, due, "BILL_DUE_DATE", SCHEDULED,
                  None, to_dec(pending), None, RATE_AS_RECORDED, as_recorded=True)
    elif source == AR_AP_DUE_SOURCE_BILL_REFERENCES:
        due_eff = func.coalesce(BillReference.due_date, BillReference.bill_date)
        rows = b.cap(
            (
                await db.execute(
                    select(BillReference.id, BillReference.bill_number, due_eff, BillReference.pending_amount)
                    .outerjoin(VendorBill, and_(VendorBill.voucher_id == BillReference.source_voucher_id, VendorBill.tenant_id == tid,
                                                BillReference.source_voucher_id.is_not(None)))
                    .outerjoin(PurchaseOrder, and_(PurchaseOrder.id == VendorBill.purchase_order_id, PurchaseOrder.tenant_id == tid))
                    .where(
                        BillReference.tenant_id == tid,
                        func.upper(BillReference.bill_type) == "PAYABLE",
                        func.upper(BillReference.status).in_(BR_OPEN_STATUSES),
                        BillReference.pending_amount > 0,
                        ~rules.funded_po(VendorBill.purchase_order_id, PurchaseOrder.btb_lc_id),
                    )
                    .order_by(due_eff.desc().nulls_last(), BillReference.id.desc())
                    .limit(MAX_SOURCE_ROWS + 1)
                )
            ).all(),
            "AP_BILL",
        )
        for rid, num, due, pending in rows:
            b.add(OUT, "AP_BILL", "bill_reference", int(rid), num, due, "BILL_DUE_DATE", SCHEDULED,
                  None, to_dec(pending), None, RATE_AS_RECORDED, as_recorded=True)
    else:
        await _outstanding_bill_rows(db, tid, b, rules, date_from, notes)

    grn_values = await _grn_values(db, tid, b, rules)
    po_values = await _po_values(db, tid, b, rules)
    vendors = await _vendor_terms(db, tid, {int(v["vendor"]) for v in [*grn_values.values(), *po_values.values()] if v["vendor"]})
    for gid, v in grn_values.items():
        terms = vendors.get(int(v["vendor"]), (0, None))[0] if v["vendor"] else 0
        reasons: list[str] = []
        due = add_days(v["date"], max(0, terms), reasons)
        if v["date"] is None:
            reasons.append("GRN_DATE_MISSING")
        b.add(OUT, "GRN_NOT_BILLED", "goods_receiving", gid, v["code"], due, "GRN_DATE_PLUS_VENDOR_TERMS", SCHEDULED,
              v["ccy"], v["amount"], v["rate"], "PO_EXCHANGE_RATE", reasons)
    for pid, v in po_values.items():
        terms, vtype = vendors.get(int(v["vendor"]), (0, None)) if v["vendor"] else (0, None)
        reasons = []
        due = add_days(v["date"], max(0, terms), reasons)
        if v["date"] is None:
            reasons.append("PO_EXPECTED_DATE_MISSING")
        if vtype != "local" and (vtype == "foreign" or (norm_ccy(v["ccy"]) or b.base) != b.base):
            reasons.append("PO_FUNDING_UNKNOWN")
        b.add(OUT, "PO_UNRECEIVED", "purchase_order", pid, v["code"], due, "PO_EXPECTED_DATE_PLUS_VENDOR_TERMS",
              SCHEDULED, v["ccy"], v["amount"], v["rate"], "PO_EXCHANGE_RATE", reasons)
    return notes


async def _outstanding_bill_rows(db: AsyncSession, tid: int, b: _Builder, rules: _Rules, date_from: date, notes: list[str]) -> None:
    open_amt = OutstandingBill.amount - OutstandingBill.paid_amount
    ob_rows = b.cap(
        (
            await db.execute(
                select(
                    OutstandingBill.id, OutstandingBill.bill_no, OutstandingBill.due_date, open_amt,
                    OutstandingBill.currency, OutstandingBill.notes,
                )
                .where(
                    OutstandingBill.tenant_id == tid,
                    func.upper(OutstandingBill.bill_type) == "PAYABLE",
                    func.upper(OutstandingBill.status).notin_(OB_CLOSED_STATUSES),
                    open_amt > 0,
                )
                .order_by(OutstandingBill.due_date.desc().nulls_last(), OutstandingBill.id.desc())
                .limit(MAX_SOURCE_ROWS + 1)
            )
        ).all(),
        "AP_BILL",
    )
    markers = {int(r[0]): parse_markers(r[5]) for r in ob_rows}
    po_codes = {c for p, _g in markers.values() for c in p}
    grn_codes = {c for _p, g in markers.values() for c in g}
    po_funded: dict[str, bool] = {}
    grn_funded: dict[str, bool] = {}
    if po_codes:
        po_funded = {
            code: bool(funded)
            for code, funded in (
                await db.execute(
                    select(PurchaseOrder.po_code, rules.funded_po(PurchaseOrder.id, PurchaseOrder.btb_lc_id)).where(
                        PurchaseOrder.tenant_id == tid, PurchaseOrder.po_code.in_(po_codes)
                    )
                )
            ).all()
        }
    if grn_codes:
        grn_funded = {
            code: bool(funded)
            for code, funded in (
                await db.execute(
                    select(GoodsReceiving.grn_code,
                           rules.funded_po(PurchaseOrder.id, PurchaseOrder.btb_lc_id, GoodsReceiving.btb_lc_id))
                    .outerjoin(PurchaseOrder, and_(PurchaseOrder.id == GoodsReceiving.purchase_order_id, PurchaseOrder.tenant_id == tid))
                    .where(GoodsReceiving.tenant_id == tid, GoodsReceiving.grn_code.in_(grn_codes))
                )
            ).all()
        }
    for bill_id, bill_no, due, amount, ccy, _notes in ob_rows:
        pcs, gcs = markers[int(bill_id)]
        if any(grn_funded.get(c) for c in gcs) or any(po_funded.get(c) for c in pcs):
            continue
        b.add(OUT, "AP_BILL", "outstanding_bill", int(bill_id), bill_no, due, "BILL_DUE_DATE", SCHEDULED,
              ccy, to_dec(amount), None, "AP_BILL_NO_RATE")

    # Posted vendor bills create no AP bill under this source: count them unless their GRN / PO has one.
    gr = aliased(GoodsReceiving)
    po = aliased(PurchaseOrder)
    due_eff = func.coalesce(VendorBill.due_date, VendorBill.bill_date)
    stale_cutoff = date_from - timedelta(days=STALE_PAYABLE_DAYS)
    base_from = (
        select(VendorBill.id)
        .outerjoin(gr, and_(gr.id == VendorBill.goods_receiving_id, gr.tenant_id == tid))
        .outerjoin(po, and_(po.id == VendorBill.purchase_order_id, po.tenant_id == tid))
    )
    vb_conds = [
        VendorBill.tenant_id == tid,
        func.upper(VendorBill.status) == "POSTED",
        ~rules.grn_marker_billed(gr.grn_code),
        ~rules.vb_line_grn_marker_billed(VendorBill.id),
        ~rules.po_marker_billed(po.po_code),
        ~rules.funded_po(VendorBill.purchase_order_id, po.btb_lc_id),
    ]
    vb_rows = b.cap(
        (
            await db.execute(
                base_from.with_only_columns(
                    VendorBill.id, VendorBill.bill_code, due_eff, VendorBill.currency, VendorBill.exchange_rate_to_base,
                    VendorBill.total_amount,
                )
                .where(*vb_conds, or_(due_eff.is_(None), due_eff >= stale_cutoff))
                .order_by(due_eff.desc().nulls_last(), VendorBill.id.desc())
                .limit(MAX_SOURCE_ROWS + 1)
            )
        ).all(),
        "VENDOR_BILL",
    )
    # still counted as billed (no double count through GRN / PO), but a long-overdue bill of unknown payment status
    # is an ageing item for review, not cash due now
    stale_count = int(
        (
            await db.execute(
                base_from.with_only_columns(func.count(VendorBill.id)).where(*vb_conds, due_eff < stale_cutoff)
            )
        ).scalar_one()
        or 0
    )
    for vb_id, code, due, ccy, rate, total in vb_rows:
        b.add(OUT, "VENDOR_BILL", "vendor_bill", int(vb_id), code, due, "VENDOR_BILL_DUE_DATE", SCHEDULED,
              ccy, to_dec(total), rate, "VENDOR_BILL_EXCHANGE_RATE", ["PAYMENT_STATUS_UNKNOWN"])
    notes.append("Posted vendor bills without an AP bill are shown at their due date; payment status unknown.")
    if stale_count:
        notes.append(
            f"STALE_PAYABLES: {stale_count} posted vendor bill(s) more than {STALE_PAYABLE_DAYS} days past due with "
            "unknown payment status are left out of the cash totals; review them in accounts payable."
        )


async def _vendor_terms(db: AsyncSession, tid: int, vendor_ids: set[int]) -> dict[int, tuple[int, str | None]]:
    if not vendor_ids:
        return {}
    return {
        int(vid): (int(days or 0), (vtype or "").strip().lower() or None)
        for vid, days, vtype in (
            await db.execute(
                select(Vendor.id, Vendor.payment_terms_days, Vendor.vendor_type).where(
                    Vendor.tenant_id == tid, Vendor.id.in_(vendor_ids)
                )
            )
        ).all()
    }


async def _grn_values(db: AsyncSession, tid: int, b: _Builder, rules: _Rules) -> dict[int, dict[str, Any]]:
    """GRN accepted value not billed. Every skip rule is in SQL, so the cap keeps the newest unbilled lines."""
    grn_rows = b.cap(
        (
            await db.execute(
                select(
                    GoodsReceiving.id, GoodsReceiving.grn_code, GoodsReceiving.received_date,
                    func.coalesce(GoodsReceiving.vendor_id, PurchaseOrder.vendor_id),
                    PurchaseOrder.currency, PurchaseOrder.exchange_rate_to_base,
                    GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty, GoodsReceivingItem.unit_price,
                    GoodsReceivingItem.accepted_value, PurchaseOrderItem.unit_price,
                )
                .join(GoodsReceivingItem, and_(GoodsReceivingItem.goods_receiving_id == GoodsReceiving.id, GoodsReceivingItem.tenant_id == tid))
                .join(PurchaseOrder, and_(PurchaseOrder.id == GoodsReceiving.purchase_order_id, PurchaseOrder.tenant_id == tid))
                .outerjoin(PurchaseOrderItem, and_(PurchaseOrderItem.id == GoodsReceivingItem.purchase_order_line_id, PurchaseOrderItem.tenant_id == tid))
                .where(
                    GoodsReceiving.tenant_id == tid,
                    GoodsReceiving.status == "RECEIVED",
                    ~rules.grn_header_billed(GoodsReceiving.id),
                    ~rules.grn_item_billed(GoodsReceivingItem.id),
                    ~rules.po_vb_billed(PurchaseOrder.id),
                    ~rules.grn_marker_billed(GoodsReceiving.grn_code),
                    ~rules.po_marker_billed(PurchaseOrder.po_code),
                    ~rules.funded_po(PurchaseOrder.id, PurchaseOrder.btb_lc_id, GoodsReceiving.btb_lc_id),
                )
                .order_by(GoodsReceiving.received_date.desc().nulls_last(), GoodsReceiving.id.desc(), GoodsReceivingItem.id.desc())
                .limit(MAX_SOURCE_ROWS + 1)
            )
        ).all(),
        "GRN_NOT_BILLED",
    )
    grn_values: dict[int, dict[str, Any]] = {}
    for gid, code, rdate, vendor_id, ccy, rate, acc, rec, gprice, acc_value, pprice in grn_rows:
        slot = grn_values.setdefault(
            int(gid), {"code": code, "date": rdate, "vendor": vendor_id, "ccy": ccy, "rate": rate, "amount": ZERO}
        )
        explicit = to_dec(acc_value)
        if explicit is not None and acc_value is not None and str(acc_value).strip():
            slot["amount"] += explicit
        else:
            price = to_dec(gprice) if gprice is not None and str(gprice).strip() else to_dec(pprice)
            slot["amount"] += usable_received_qty(acc, rec) * (price or ZERO)
    return grn_values


async def _po_values(db: AsyncSession, tid: int, b: _Builder, rules: _Rules) -> dict[int, dict[str, Any]]:
    """Unreceived open PO value (not billed as a whole, not BTB / facility funded), newest expected date first."""
    po_rows = b.cap(
        (
            await db.execute(
                select(
                    PurchaseOrderItem.id, PurchaseOrder.id, PurchaseOrder.po_code, PurchaseOrder.vendor_id,
                    PurchaseOrder.expected_date, PurchaseOrder.currency, PurchaseOrder.exchange_rate_to_base,
                    PurchaseOrderItem.quantity, PurchaseOrderItem.unit_price,
                )
                .join(PurchaseOrder, and_(PurchaseOrder.id == PurchaseOrderItem.purchase_order_id, PurchaseOrder.tenant_id == tid))
                .where(
                    PurchaseOrderItem.tenant_id == tid,
                    func.upper(func.trim(PurchaseOrder.status)).in_(OPEN_PO_STATUSES),
                    ~rules.po_vb_billed(PurchaseOrder.id),
                    ~rules.po_marker_billed(PurchaseOrder.po_code),
                    ~rules.funded_po(PurchaseOrder.id, PurchaseOrder.btb_lc_id),
                )
                .order_by(PurchaseOrder.expected_date.desc().nulls_last(), PurchaseOrder.id.desc(), PurchaseOrderItem.id.desc())
                .limit(MAX_SOURCE_ROWS + 1)
            )
        ).all(),
        "PO_UNRECEIVED",
    )
    received: dict[int, Decimal] = defaultdict(lambda: ZERO)
    line_ids = [int(r[0]) for r in po_rows]
    if line_ids:
        for line_id, acc, rec in (
            await db.execute(
                select(GoodsReceivingItem.purchase_order_line_id, GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty)
                .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
                .where(
                    GoodsReceiving.tenant_id == tid,
                    GoodsReceivingItem.tenant_id == tid,
                    GoodsReceiving.status == "RECEIVED",
                    GoodsReceivingItem.purchase_order_line_id.in_(line_ids),
                )
            )
        ).all():
            received[int(line_id)] += usable_received_qty(acc, rec)
    po_values: dict[int, dict[str, Any]] = {}
    for line_id, po_id, code, vendor_id, expected, ccy, rate, qty, price in po_rows:
        open_qty = max(ZERO, (to_dec(qty) or ZERO) - received[int(line_id)])
        slot = po_values.setdefault(
            int(po_id), {"code": code, "date": expected, "vendor": vendor_id, "ccy": ccy, "rate": rate, "amount": ZERO}
        )
        slot["amount"] += open_qty * (to_dec(price) or ZERO)
    return po_values


async def _payroll(
    db: AsyncSession, tenant_id: int, b: _Builder, date_from: date, date_to: date, calendar: CalendarContext, today: date
) -> list[str]:
    """Periods paid on / after the earlier of today and date_from count (a future date_from shows the ones due in
    between in week 1 as DUE_BEFORE_START, like every other source); earlier periods are assumed paid."""
    cutoff = min(today, date_from)
    runs = (
        await db.execute(
            select(PayrollRun.id, PayrollRun.run_code, PayrollRun.period_id, PayrollRun.net_total,
                   PayrollPeriod.period_code, PayrollPeriod.end_date, PayrollPeriod.payment_date)
            .join(PayrollPeriod, and_(PayrollPeriod.id == PayrollRun.period_id, PayrollPeriod.tenant_id == tenant_id))
            .where(PayrollRun.tenant_id == tenant_id, func.upper(PayrollRun.status).in_(PAYROLL_DONE_STATUSES))
            .order_by(PayrollPeriod.end_date.desc(), PayrollRun.id.desc())
            .limit(500)
        )
    ).all()
    newest: dict[int, Any] = {}
    for r in runs:
        newest.setdefault(int(r[2]), r)  # rows arrive newest period first, newest run first
    if not newest:
        return ["No finalised payroll run: payroll is not in the forecast (PAYROLL_NO_FINALIZED_RUN)."]
    selected = [r for r in newest.values() if r[6] is not None and r[6] >= cutoff]
    last = max(newest.values(), key=lambda r: (r[5], r[0]))
    run_ids = {int(r[0]) for r in selected} | {int(last[0])}
    latest_snap = (
        select(func.max(PayrollCalculationSnapshot.id))
        .join(PayrollRunLine, PayrollRunLine.id == PayrollCalculationSnapshot.payroll_run_line_id)
        .where(PayrollCalculationSnapshot.tenant_id == tenant_id, PayrollRunLine.tenant_id == tenant_id, PayrollRunLine.run_id.in_(run_ids))
        .group_by(PayrollCalculationSnapshot.payroll_run_line_id)
    )
    statutory: dict[int, Decimal] = defaultdict(lambda: ZERO)
    for run_id, trace in (
        await db.execute(
            select(PayrollRunLine.run_id, PayrollCalculationSnapshot.trace_json)
            .join(PayrollRunLine, PayrollRunLine.id == PayrollCalculationSnapshot.payroll_run_line_id)
            .where(PayrollCalculationSnapshot.id.in_(latest_snap))
        )
    ).all():
        statutory[int(run_id)] += statutory_from_trace(trace)
    for r in selected:
        run_id, code, _pid, net, pcode, _end, pay = r
        ref = f"{pcode} / {code}"
        b.add(OUT, "PAYROLL_NET", "payroll_run", int(run_id), ref, pay, "PAYROLL_PERIOD_PAYMENT_DATE", SCHEDULED,
              None, to_dec(net), None, "BASE")
        b.add(OUT, "PAYROLL_STATUTORY", "payroll_run", int(run_id), ref, pay, "PAYROLL_PERIOD_PAYMENT_DATE", SCHEDULED,
              None, statutory[int(run_id)], None, "BASE")
    # Later months repeat the last period, due on the 7th working day after month end.
    end = last[5]
    year, month = end.year, end.month
    net_last, stat_last = to_dec(last[3]), statutory[int(last[0])]
    for _ in range(12):
        month += 1
        if month > 12:
            year, month = year + 1, 1
        try:
            period_end = _month_end(year, month)
            pay = nth_working_day_after(period_end, PAYROLL_PAY_WORKING_DAY, calendar)
        except (OverflowError, ValueError):
            break
        if pay > date_to:
            break
        if pay < cutoff:
            continue
        ref = f"{year}-{month:02d} (repeat of {last[4]})"
        b.add(OUT, "PAYROLL_NET", "payroll_run", int(last[0]), ref, pay, "PAYROLL_7TH_WORKING_DAY", ESTIMATED,
              None, net_last, None, "BASE", ["PAYROLL_REPEATS_LAST_PERIOD"])
        b.add(OUT, "PAYROLL_STATUTORY", "payroll_run", int(last[0]), ref, pay, "PAYROLL_7TH_WORKING_DAY", ESTIMATED,
              None, stat_last, None, "BASE", ["PAYROLL_REPEATS_LAST_PERIOD"])
    return ["Payroll: earlier periods are assumed paid (ASSUMED_PAID); totals only, no per-person data."]


def statutory_from_trace(trace: Any) -> Decimal:
    """PF / ESI (employee + employer), PT and BD TDS of one calculation snapshot (same keys as hr_payroll)."""
    t = trace if isinstance(trace, dict) else {}
    st = t.get("statutory") if isinstance(t.get("statutory"), dict) else {}
    pf = st.get("pf") if isinstance(st.get("pf"), dict) else {}
    esi = st.get("esi") if isinstance(st.get("esi"), dict) else {}
    tds = st.get("bd_tds") if isinstance(st.get("bd_tds"), dict) else {}
    total = ZERO
    for v in (pf.get("employee_pf"), pf.get("employer_pf"), esi.get("employee_esi"), esi.get("employer_esi"),
              st.get("pt_amount"), tds.get("monthly_tds")):
        d = to_dec(v)
        if d is not None and d.is_finite():
            total += d
    return total


# ------------------------------------------------------------------ inflows


async def _invoice_rows(db: AsyncSession, tid: int, b: _Builder, *, realisation_days: int, date_from: date) -> list[str]:
    """ISSUED invoices not fully realised; more than STALE_RECEIVABLE_DAYS past expected realisation = doubtful."""
    allocated = (
        select(
            CommercialInvoiceReceiptAllocation.commercial_invoice_id.label("ci_id"),
            func.coalesce(func.sum(CommercialInvoiceReceiptAllocation.allocated_amount), 0).label("alloc"),
        )
        .where(
            CommercialInvoiceReceiptAllocation.tenant_id == tid,
            CommercialInvoiceReceiptAllocation.status.in_(ACTIVE_ALLOCATION_STATUSES),
        )
        .group_by(CommercialInvoiceReceiptAllocation.commercial_invoice_id)
        .subquery()
    )
    anchor = func.coalesce(CommercialInvoice.invoice_date, func.date(CommercialInvoice.created_at))
    outstanding = CommercialInvoice.total_amount - func.coalesce(allocated.c.alloc, 0)
    stale_anchor = add_days(date_from, -(STALE_RECEIVABLE_DAYS + realisation_days))
    conds = [
        CommercialInvoice.tenant_id == tid,
        func.upper(func.trim(CommercialInvoice.status)).in_(RECEIVABLE_INVOICE_STATUSES),
        outstanding > 0,
    ]
    fresh = or_(anchor.is_(None), anchor >= stale_anchor) if stale_anchor is not None else true()
    rows = b.cap(
        (
            await db.execute(
                select(CommercialInvoice.id, CommercialInvoice.invoice_code, anchor, CommercialInvoice.currency,
                       CommercialInvoice.exchange_rate_to_base, outstanding)
                .outerjoin(allocated, allocated.c.ci_id == CommercialInvoice.id)
                .where(*conds, fresh)
                .order_by(anchor.desc().nulls_last(), CommercialInvoice.id.desc())
                .limit(MAX_SOURCE_ROWS + 1)
            )
        ).all(),
        "COMMERCIAL_INVOICE",
    )
    stale_count = 0
    if stale_anchor is not None:
        stale_count = int(
            (
                await db.execute(
                    select(func.count(CommercialInvoice.id))
                    .outerjoin(allocated, allocated.c.ci_id == CommercialInvoice.id)
                    .where(*conds, anchor < stale_anchor)
                )
            ).scalar_one()
            or 0
        )
    for ci_id, code, inv_anchor, ccy, rate, amount in rows:
        reasons: list[str] = []
        due = add_days(inv_anchor, realisation_days, reasons)
        b.add(IN, "COMMERCIAL_INVOICE", "commercial_invoice", int(ci_id), code, due,
              "INVOICE_DATE_PLUS_DOCUMENT_AND_USANCE_DAYS", SCHEDULED, ccy, to_dec(amount), rate, "INVOICE_EXCHANGE_RATE",
              reasons)
    if stale_count:
        return [
            f"STALE_RECEIVABLES: {stale_count} invoice(s) more than {STALE_RECEIVABLE_DAYS} days past their expected "
            "realisation date are doubtful and left out of the cash totals; review them in receivables."
        ]
    return []


async def _inflows(
    db: AsyncSession, tenant: Tenant, b: _Builder, *, doc_days: int, usance_days: int, predicted: dict[int, date | None],
    orders: list[Order], date_from: date,
) -> list[str]:
    tid = tenant.id
    realisation_days = doc_days + usance_days
    notes = await _invoice_rows(db, tid, b, realisation_days=realisation_days, date_from=date_from)
    if not orders:
        return notes
    base = b.base
    ids = [o.id for o in orders]
    ctx = await load_order_money_context(db, tid, base, orders)
    invoiced: dict[int, Decimal] = defaultdict(lambda: ZERO)
    invoiced_unknown: set[int] = set()
    for oid, ccy, rate, amount in (
        await db.execute(
            select(CommercialInvoiceLine.order_id, CommercialInvoice.currency, CommercialInvoice.exchange_rate_to_base,
                   func.coalesce(func.sum(CommercialInvoiceLine.line_amount), 0))
            .join(CommercialInvoice, and_(CommercialInvoice.id == CommercialInvoiceLine.commercial_invoice_id, CommercialInvoice.tenant_id == tid))
            .where(
                CommercialInvoiceLine.tenant_id == tid,
                CommercialInvoiceLine.order_id.in_(ids),
                func.upper(func.trim(CommercialInvoice.status)).in_(RECEIVABLE_INVOICE_STATUSES),
            )
            .group_by(CommercialInvoiceLine.order_id, CommercialInvoice.currency, CommercialInvoice.exchange_rate_to_base)
        )
    ).all():
        r, _src = fx(ccy, base, rate, "INVOICE_EXCHANGE_RATE")
        if r is None:
            invoiced_unknown.add(int(oid))
        else:
            invoiced[int(oid)] += (to_dec(amount) or ZERO) * r
    advances = await advances_by_order(db, tid, ids, ctx)
    for order in orders:
        rev = resolve_revenue(order, ctx)
        target = predicted.get(order.id)
        if target is not None:
            rule = "PREDICTED_FINISH_PLUS_DOCUMENT_AND_USANCE_DAYS"
            reasons: list[str] = []
        else:
            target = order.delivery_date
            rule = "ORDER_DELIVERY_DATE_PLUS_DOCUMENT_AND_USANCE_DAYS"
            reasons = ["DELIVERY_DATE_USED"] if target else ["SHIP_DATE_UNKNOWN"]
        due = add_days(target, realisation_days, reasons)
        if rev.gross_source is None:
            continue
        if rev.gross_base is None or rev.net_base is None or order.id in invoiced_unknown:
            b.rows.append(
                CashRow(IN, "ORDER_REMAINING", "order", order.id, order.order_code, due, rule, ESTIMATED,
                        rev.currency, rev.gross_source, None, "UNKNOWN", None, reasons + ["FX_UNKNOWN"])
            )
            continue
        ratio = (rev.net_base / rev.gross_base) if rev.gross_base > ZERO else Decimal("1")
        remaining = remaining_order_inflow(rev.gross_base, invoiced[order.id], advances.get(order.id, ZERO), ratio)
        if remaining <= ZERO:
            continue
        reasons.append(f"REVENUE_{rev.source}")
        reasons.append("NET_OF_BUYING_COMMISSION" if rev.commission_base else "NO_BUYING_COMMISSION")
        b.add(IN, "ORDER_REMAINING", "order", order.id, order.order_code, due, rule, ESTIMATED, None, remaining,
              None, "BASE", reasons)
    notes.append("Order inflows are net of buying commission (deducted from export proceeds).")
    return notes


def remaining_order_inflow(
    revenue_base: Decimal, invoiced_base: Decimal, advances_base: Decimal, net_ratio: Decimal = Decimal("1")
) -> Decimal:
    """max(0, (contract value - invoiced) x net/gross - advances received): the un-invoiced part of the order, net of
    buying commission, less cash already received in advance. Partial invoices and advances never double count."""
    return q4(max(ZERO, (revenue_base - invoiced_base) * net_ratio - advances_base))


async def advances_by_order(db: AsyncSession, tenant_id: int, order_ids: list[int], ctx: Any) -> dict[int, Decimal]:
    """Unapplied part of POSTED proforma advances (base) per order: advance minus what the same receipt voucher has
    applied (active allocations) to non-cancelled invoices of that order / of the PI's orders, floored at 0; a PI-level
    advance without order is spread by order quantity."""
    pra = ProformaReceiptAllocation
    pi_ids = {p[0] for rows in ctx.pis_by_order.values() for p in rows}
    conds = [pra.order_id.in_(order_ids)]
    if pi_ids:
        conds.append(and_(pra.order_id.is_(None), pra.proforma_invoice_id.in_(pi_ids)))
    cira = aliased(CommercialInvoiceReceiptAllocation)
    cil = aliased(CommercialInvoiceLine)
    ci = aliased(CommercialInvoice)
    pio = aliased(ProformaInvoiceOrder)
    # Invoices of this advance's order (or of the PI's orders for a PI-level advance), not cancelled. Selected as
    # invoice ids (not joined to lines) so a multi-line invoice is not summed more than once.
    invoices_of_order = select(cil.commercial_invoice_id).where(
        cil.tenant_id == tenant_id,
        or_(
            cil.order_id == pra.order_id,
            and_(
                pra.order_id.is_(None),
                cil.order_id.in_(select(pio.order_id).where(pio.proforma_invoice_id == pra.proforma_invoice_id)),
            ),
        ),
    )
    live_invoices = select(ci.id).where(ci.tenant_id == tenant_id, func.upper(func.trim(ci.status)) != "CANCELLED")
    # base amount as stored on the allocation; older rows without it fall back to the allocated amount
    applied_amount = (
        select(func.coalesce(func.sum(func.coalesce(func.nullif(cira.allocated_base_amount, 0), cira.allocated_amount)), 0))
        .where(
            cira.tenant_id == tenant_id,
            cira.voucher_id == pra.voucher_id,
            cira.status.in_(ACTIVE_ALLOCATION_STATUSES),
            cira.commercial_invoice_id.in_(invoices_of_order),
            cira.commercial_invoice_id.in_(live_invoices),
        )
        .correlate(pra)
        .scalar_subquery()
    )
    # only the part of the advance not yet applied to one of those invoices is netted (never below 0)
    unapplied = func.greatest(func.coalesce(pra.allocated_base_amount, 0) - applied_amount, 0)
    rows = (
        await db.execute(
            select(pra.proforma_invoice_id, pra.order_id, func.coalesce(func.sum(unapplied), 0))
            .where(pra.tenant_id == tenant_id, func.upper(pra.status) == "POSTED", or_(*conds))
            .group_by(pra.proforma_invoice_id, pra.order_id)
        )
    ).all()
    out: dict[int, Decimal] = defaultdict(lambda: ZERO)
    spread_pis = {int(pi) for pi, oid, _a in rows if oid is None}
    pi_orders: dict[int, list[tuple[int, Decimal]]] = defaultdict(list)
    if spread_pis:
        for pi, oid, qty in (
            await db.execute(
                select(ProformaInvoiceOrder.proforma_invoice_id, ProformaInvoiceOrder.order_id, Order.quantity)
                .join(Order, and_(Order.id == ProformaInvoiceOrder.order_id, Order.tenant_id == tenant_id))
                .where(ProformaInvoiceOrder.proforma_invoice_id.in_(spread_pis))
            )
        ).all():
            pi_orders[int(pi)].append((int(oid), to_dec(qty) or ZERO))
    wanted = set(order_ids)
    for pi, oid, amount in rows:
        value = to_dec(amount) or ZERO
        if oid is not None:
            out[int(oid)] += value
            continue
        members = pi_orders.get(int(pi), [])
        total_qty = sum((q for _o, q in members), ZERO)
        if total_qty <= ZERO:
            continue
        for member, q in members:
            if member in wanted:
                out[member] += value * q / total_qty
    return dict(out)


# ------------------------------------------------------------------ main


async def _opening_cash(db: AsyncSession, tenant_id: int, date_from: date) -> dict[str, Decimal]:
    groups = await load_group_classification(db, tenant_id)
    clause = cash_pool_clause(groups, tenant_id)
    balances = await pool_balances_by_class(db, groups, tenant_id, clause, date_from, date_from)
    cash = balances.get(CASH_IN_HAND, (ZERO, ZERO))[0]
    bank = balances.get(BANK_ACCOUNTS, (ZERO, ZERO))[0]
    od = balances.get(BANK_OD, (ZERO, ZERO))[0]
    return {"cash_in_hand": q4(cash), "bank": q4(bank), "bank_od": q4(od)}


async def _facility_headroom(db: AsyncSession, tenant_id: int, base: str) -> dict[str, Any]:
    total = ZERO
    unknown = UnknownByCurrency()
    count = 0
    for ccy, rate, sanctioned, utilized, available in (
        await db.execute(
            select(Facility.currency, Facility.exchange_rate_to_base, Facility.sanctioned_amount, Facility.utilized_amount,
                   Facility.available_amount).where(Facility.tenant_id == tenant_id, Facility.status == "active")
        )
    ).all():
        free = to_dec(available) if available is not None else (to_dec(sanctioned) or ZERO) - (to_dec(utilized) or ZERO)
        free = max(ZERO, free or ZERO)
        count += 1
        r, _src = fx(ccy, base, rate, "FACILITY_EXCHANGE_RATE")
        if r is None:
            unknown.add(ccy, free)
        else:
            total += free * r
    return {"amount": m4(total), "facilities": count, "unknown_by_currency": unknown.as_dict(),
            "note": "Available financing (memo) - never added to cash."}


async def build_cash_requirement(
    db: AsyncSession,
    tenant: Tenant,
    *,
    date_from: date,
    horizon_days: int,
    today: date,
    planning_math_v2: bool,
    integrated_planning: bool,
) -> dict[str, Any]:
    from app.modules.mfg_intelligence.delivery_service import predict_deliveries

    tid = tenant.id
    base = base_currency(tenant)
    date_to = date_from + timedelta(days=horizon_days - 1)
    settings = await read_planning_settings(db, tid)
    doc_days = int(settings["export_document_days"])
    usance_days = int(settings["export_usance_days"])
    btb_usance = int(settings["btb_usance_days"])
    calendar = await load_calendar(db, tid, date_from - timedelta(days=40), date_to + timedelta(days=40))
    b = _Builder(base)
    notes: list[str] = []
    source, _automatic = resolve_finance_ar_ap_due_source(tenant.feature_flags)
    rules = _Rules(tid, source)

    await _facility_rows(db, tid, b)
    await _btb_rows(db, tid, b, rules, btb_usance)
    notes += await _payables(db, tenant, b, rules, source, date_from)
    notes += await _payroll(db, tid, b, date_from, date_to, calendar, today)

    orders = list(
        (
            await db.execute(
                select(Order)
                .where(Order.tenant_id == tid, confirmed_status_clause())
                .order_by(Order.delivery_date.asc().nulls_last(), Order.id)
                .limit(MAX_ORDERS + 1)
            )
        )
        .scalars()
        .all()
    )
    orders_truncated = len(orders) > MAX_ORDERS
    orders = orders[:MAX_ORDERS]
    if orders_truncated:
        b.truncated.append("ORDER_REMAINING")
    predicted: dict[int, date | None] = {}
    head = orders[:MAX_PREDICTED_ORDERS]
    if head:
        results = await predict_deliveries(
            db, tid, head, today=today, planning_math_v2=planning_math_v2, order_bom_v2=False,
            include_details=False, allocation_v1=False, integrated_planning=integrated_planning,
        )
        predicted = {int(r["order_id"]): r.get("likely_complete_date") for r in results if r.get("likely_complete_date")}
    notes += await _inflows(
        db, tenant, b, doc_days=doc_days, usance_days=usance_days, predicted=predicted, orders=orders, date_from=date_from
    )

    opening = await _opening_cash(db, tid, date_from)
    opening_excl = opening["cash_in_hand"] + opening["bank"]
    opening_incl = opening_excl + opening["bank_od"]
    headroom = await _facility_headroom(db, tid, base)

    rows, beyond = assign_weeks(b.rows, date_from, date_to, today)
    # Net cash position (treasury standard): a drawn overdraft is a credit balance in the cash pool and reduces
    # liquidity; only the undrawn limit / facility headroom is financing (memo).
    weeks = build_weeks(rows, date_from, date_to, opening_incl)
    gap = next((w for w in weeks if w["below_zero"]), None)
    unknown: dict[tuple[str, str, str], list[Any]] = {}
    undated = {IN: ZERO, OUT: ZERO}
    undated_rows = 0
    for r in rows:
        if r.amount_base is None:
            key = (r.direction, r.category, r.currency or "UNKNOWN")
            slot = unknown.setdefault(key, [ZERO, 0])
            slot[0] += r.source_amount or ZERO
            slot[1] += 1
        elif r.week_index is None:
            undated[r.direction] += r.amount_base
            undated_rows += 1
    inflow_total = sum((Decimal(w["inflow"]) for w in weeks), ZERO)
    outflow_total = sum((Decimal(w["outflow"]) for w in weeks), ZERO)
    rows.sort(key=lambda r: (r.week_index if r.week_index is not None else 10**6, r.due_date or date.max,
                             r.direction, r.category, r.source_id or 0))
    reason_codes: list[str] = []
    if gap is not None:
        reason_codes.append("FINANCING_GAP")
    if any(r.overdue for r in rows):
        reason_codes.append("OVERDUE_IN_WEEK_1")
    if any("DUE_BEFORE_START" in r.reason_codes for r in rows):
        reason_codes.append("DUE_BEFORE_START_IN_WEEK_1")
    if unknown:
        reason_codes.append("FX_UNKNOWN_EXCLUDED")
    if orders_truncated:
        reason_codes.append("ORDERS_TRUNCATED")
    reason_codes += [f"SOURCE_TRUNCATED:{c}" for c in b.truncated]
    forecast_complete = not b.truncated
    if not forecast_complete:
        notes.append(
            f"Forecast incomplete: a source hit its row limit ({MAX_SOURCE_ROWS} rows, newest kept): "
            + ", ".join(b.truncated) + "."
        )
    return {
        "date_from": date_from,
        "date_to": date_to,
        "horizon_days": horizon_days,
        "base_currency": base,
        "value_class": CLASS_FORECAST,
        "settings": {"export_document_days": doc_days, "export_usance_days": usance_days, "btb_usance_days": btb_usance},
        "opening": {
            "cash_in_hand": m4(opening["cash_in_hand"]),
            "bank": m4(opening["bank"]),
            "bank_od": m4(opening["bank_od"]),
            "excluding_overdraft": m4(opening_excl),
            "including_overdraft": m4(opening_incl),
            "basis": "NET_OF_DRAWN_OVERDRAFT",
            "source": "FINANCE_POOL_BALANCES_BY_CLASS",
        },
        "totals": {
            "inflow": m4(inflow_total),
            "outflow": m4(outflow_total),
            "net": m4(inflow_total - outflow_total),
            "closing": m4(opening_incl + inflow_total - outflow_total),
        },
        "weeks": weeks,
        "financing_gap": (
            {"week_index": gap["week_index"], "week_start": gap["week_start"], "shortfall": m4(-Decimal(gap["closing"]))}
            if gap is not None
            else None
        ),
        "facility_headroom": headroom,
        "undated": {"inflow": m4(undated[IN]), "outflow": m4(undated[OUT]), "rows": undated_rows},
        "beyond_horizon_rows": beyond,
        "unknown_by_currency": [
            {"direction": d, "category": c, "currency": ccy, "source_amount": m4(v[0]), "rows": v[1]}
            for (d, c, ccy), v in sorted(unknown.items())
        ],
        "rows": [_row_out(r) for r in rows[:MAX_ROWS]],
        "row_count": len(rows),
        "truncated": len(rows) > MAX_ROWS,
        "max_rows": MAX_ROWS,
        "forecast_complete": forecast_complete,
        "reason_codes": reason_codes,
        "notes": notes + [
            "Forecast - not posted. Weekly balance and financing gap use net cash (cash + bank - drawn overdraft); "
            "undrawn facility limits are shown as available financing only.",
            "Items due before the start date are shown in week 1 (OVERDUE when already past due today).",
        ],
    }
