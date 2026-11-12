"""Bill-wise AR/AP "due" figures from the tenant's chosen source (PLAN open question 8).

Tenant setting `finance_ar_ap_due_source` (tenant_feature_keys.get_finance_ar_ap_due_source):
  outstanding_bills  outstanding_bills: RECEIVABLE / PAYABLE, open = amount - paid_amount, open status, own currency
                     column -> only base-currency bills are summed, foreign bills are counted in the note.
  party_ledger       party_ledger_bills of CUSTOMER (DR bills) / VENDOR (CR bills) party ledgers, open = pending_amount,
                     status PENDING / PARTIAL / OVERDUE. No currency column: amounts as recorded on the bill.
  bill_references    bill_references RECEIVABLE / PAYABLE, open = pending_amount, status OPEN / PARTIALLY_SETTLED.
                     No currency column: amounts as recorded. Advances (negative pending) are not "due".
Only bills with a positive open amount count. A bill without a due date is due on its bill date.
The sources keep only the CURRENT open amount (no history), so for a past as-of date the figures are today's open
amounts of the bills dated on or before that date.

Unset: the standard bill-wise source is used automatically (party_ledger when `party_ledger_enabled` is strictly
true, else outstanding_bills; `resolve_finance_ar_ap_due_source`) and the result says so (`automatic`, note).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, literal, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import (
    AR_AP_DUE_SOURCE_BILL_REFERENCES,
    AR_AP_DUE_SOURCE_OUTSTANDING_BILLS,
    AR_AP_DUE_SOURCE_PARTY_LEDGER,
    resolve_finance_ar_ap_due_source,
)
from app.models.finance import BillReference, OutstandingBill
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.models.tenant import Tenant

ZERO = Decimal("0")
Q4 = Decimal("0.0001")
RECEIVABLE, PAYABLE = "RECEIVABLE", "PAYABLE"

OUTSTANDING_CLOSED_STATUSES = ("PAID", "SETTLED", "CLOSED", "CANCELLED", "VOID", "REJECTED")
PARTY_LEDGER_OPEN_STATUSES = ("PENDING", "PARTIAL", "OVERDUE")
BILL_REFERENCE_OPEN_STATUSES = ("OPEN", "PARTIALLY_SETTLED")

SOURCE_NOTES = {
    AR_AP_DUE_SOURCE_OUTSTANDING_BILLS: "Source: outstanding_bills (open = amount - paid).",
    AR_AP_DUE_SOURCE_PARTY_LEDGER: (
        "Source: party ledger bills (customer DR / vendor CR bills, pending amount). The source has no currency column: "
        "amounts are as recorded on the bill (voucher line currency), not converted."
    ),
    AR_AP_DUE_SOURCE_BILL_REFERENCES: (
        "Source: bill references (pending amount; advances left out). The source has no currency column: amounts are "
        "as recorded, not converted."
    ),
}
HISTORY_NOTE = "Open amounts are current (the source keeps no history); bills dated after the as-of date are left out."
AUTOMATIC_NOTE = (
    "Chosen automatically (no AR/AP source set in Settings): the party ledger when it is switched on, "
    "else outstanding bills."
)


def with_automatic_note(note: str, automatic: bool) -> str:
    return f"{AUTOMATIC_NOTE} {note}" if automatic else note


def _q(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Q4)


@dataclass
class ArApDue:
    source: str
    debtors_due: Decimal
    debtors_open: Decimal
    creditors_due: Decimal
    creditors_open: Decimal
    foreign_bills: int  # outstanding_bills only: open foreign-currency bills left out of the amounts
    note: str
    automatic: bool = False  # True = no setting chosen, the standard source was used


def _source_parts(tenant: Tenant, source: str):
    """(open amount, effective due date, bill date, side label, join or None, WHERE conditions, currency or None)."""
    tid = tenant.id
    if source == AR_AP_DUE_SOURCE_OUTSTANDING_BILLS:
        open_amt = OutstandingBill.amount - OutstandingBill.paid_amount
        side = func.upper(OutstandingBill.bill_type)
        conds = [
            OutstandingBill.tenant_id == tid,
            func.upper(OutstandingBill.status).notin_(OUTSTANDING_CLOSED_STATUSES),
            open_amt > 0,
        ]
        return open_amt, OutstandingBill.due_date, OutstandingBill.bill_date, side, None, conds, OutstandingBill.currency
    if source == AR_AP_DUE_SOURCE_PARTY_LEDGER:
        side = case(
            (and_(PartyLedger.party_type == "CUSTOMER", PartyLedgerBill.amount_type == "DR"), literal(RECEIVABLE)),
            (and_(PartyLedger.party_type == "VENDOR", PartyLedgerBill.amount_type == "CR"), literal(PAYABLE)),
            else_=literal("OTHER"),
        )
        join = (PartyLedger, and_(PartyLedger.id == PartyLedgerBill.party_ledger_id, PartyLedger.tenant_id == tid))
        conds = [
            PartyLedgerBill.tenant_id == tid,
            PartyLedgerBill.status.in_(PARTY_LEDGER_OPEN_STATUSES),
            PartyLedgerBill.pending_amount > 0,
        ]
        due = func.coalesce(PartyLedgerBill.due_date, PartyLedgerBill.bill_date)
        return PartyLedgerBill.pending_amount, due, PartyLedgerBill.bill_date, side, join, conds, None
    if source == AR_AP_DUE_SOURCE_BILL_REFERENCES:
        conds = [
            BillReference.tenant_id == tid,
            func.upper(BillReference.status).in_(BILL_REFERENCE_OPEN_STATUSES),
            BillReference.pending_amount > 0,
        ]
        due = func.coalesce(BillReference.due_date, BillReference.bill_date)
        return BillReference.pending_amount, due, BillReference.bill_date, func.upper(BillReference.bill_type), None, conds, None
    raise ValueError(source)


def _from_table(source: str):
    return {
        AR_AP_DUE_SOURCE_OUTSTANDING_BILLS: OutstandingBill,
        AR_AP_DUE_SOURCE_PARTY_LEDGER: PartyLedgerBill,
        AR_AP_DUE_SOURCE_BILL_REFERENCES: BillReference,
    }[source]


async def ar_ap_due_totals(db: AsyncSession, tenant: Tenant, *, as_of: date) -> ArApDue:
    """Debtors / creditors due on or before `as_of` and total open, from the chosen (or automatic) source.

    One SQL statement.
    """
    source, automatic = resolve_finance_ar_ap_due_source(tenant.feature_flags)
    open_amt, due, bill_date, side, join, conds, currency = _source_parts(tenant, source)
    base_ccy = (tenant.base_currency or "BDT").upper()
    in_base = func.upper(currency) == base_ccy if currency is not None else true()
    is_due = due <= as_of

    def total(side_value: str, *extra):
        return func.coalesce(func.sum(case((and_(side == side_value, in_base, *extra), open_amt), else_=0)), 0)

    foreign = (
        func.coalesce(func.sum(case((func.upper(currency) != base_ccy, 1), else_=0)), 0)
        if currency is not None
        else literal(0)
    )
    stmt = select(
        total(RECEIVABLE, is_due),
        total(RECEIVABLE),
        total(PAYABLE, is_due),
        total(PAYABLE),
        foreign,
    ).select_from(_from_table(source))
    if join is not None:
        stmt = stmt.join(*join)
    stmt = stmt.where(*conds, bill_date <= as_of)
    d_due, d_open, c_due, c_open, foreign_count = (await db.execute(stmt)).one()
    note = SOURCE_NOTES[source]
    if currency is not None:
        note += f" Amounts count only {base_ccy} bills"
        note += f"; {int(foreign_count)} open foreign-currency bill(s) are left out." if foreign_count else "."
    note += " " + HISTORY_NOTE
    return ArApDue(
        source=source,
        debtors_due=_q(d_due),
        debtors_open=_q(d_open),
        creditors_due=_q(c_due),
        creditors_open=_q(c_open),
        foreign_bills=int(foreign_count or 0),
        note=with_automatic_note(note, automatic),
        automatic=automatic,
    )


def overdue_select(tenant: Tenant, source: str, *, as_of: date, bill_type: str):
    """Control Tower overdue rows (due date before `as_of`) for party_ledger / bill_references.

    Columns ref_id, reference, ref_date, party, amount (+ amount_due, bill_type); same shape as the outstanding_bills
    card so the card and its drill-down share one selectable.
    """
    tid = tenant.id
    if source == AR_AP_DUE_SOURCE_PARTY_LEDGER:
        open_amt, due, _bill_date, side, join, conds, _ccy = _source_parts(tenant, source)
        from app.models.customer import Customer
        from app.models.inventory import Vendor

        party = func.coalesce(Customer.name, Vendor.name)
        return (
            select(
                PartyLedgerBill.id.label("ref_id"),
                PartyLedgerBill.bill_number.label("reference"),
                due.label("ref_date"),
                party.label("party"),
                open_amt.label("amount"),
                open_amt.label("amount_due"),
                PartyLedgerBill.bill_type.label("bill_type"),
            )
            .join(*join)
            .outerjoin(Customer, and_(Customer.id == PartyLedger.customer_id, Customer.tenant_id == tid))
            .outerjoin(Vendor, and_(Vendor.id == PartyLedger.vendor_id, Vendor.tenant_id == tid))
            .where(*conds, side == bill_type, due < as_of)
        )
    if source == AR_AP_DUE_SOURCE_BILL_REFERENCES:
        open_amt, due, _bill_date, side, _join, conds, _ccy = _source_parts(tenant, source)
        return select(
            BillReference.id.label("ref_id"),
            BillReference.bill_number.label("reference"),
            due.label("ref_date"),
            BillReference.party_name.label("party"),
            open_amt.label("amount"),
            open_amt.label("amount_due"),
            BillReference.bill_type.label("bill_type"),
        ).where(*conds, side == bill_type, due < as_of)
    raise ValueError(source)
