"""Shared pieces of the monthly Cash Flow and Funds Flow reports.

Definitions (PLAN section 5; Bank OD has three treatments and this module is only the Cash Flow / Funds Flow part):
- cash pool        = ledgers whose effective class is CASH_IN_HAND, BANK_ACCOUNTS or BANK_OD (signed, debit minus credit);
- working capital  = Current Assets primary group (CASH_IN_HAND, BANK_ACCOUNTS, STOCK_IN_HAND, SUNDRY_DEBTORS,
                     CURRENT_ASSETS) minus CURRENT_LIABILITIES + SUNDRY_CREDITORS. BANK_OD, SHORT_TERM_BORROWINGS and
                     unclassified groups are NOT in working capital.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, case, func, or_
from sqlalchemy import Integer, cast

from app.models.finance import Voucher
from app.modules.finance.advanced_voucher_service import voucher_in_books_clause
from app.modules.finance.statements.classification_service import GroupInfo
from app.modules.finance.statements.constants import (
    BANK_ACCOUNTS,
    BANK_OD,
    CASH_IN_HAND,
    CLASS_TO_PRIMARY,
    CURRENT_LIABILITIES,
    PRIMARY_CURRENT_ASSETS,
    SUNDRY_CREDITORS,
)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")

CASH_POOL_CLASSES = frozenset({CASH_IN_HAND, BANK_ACCOUNTS, BANK_OD})
WC_ASSET_CLASSES = frozenset(c for c, p in CLASS_TO_PRIMARY.items() if p == PRIMARY_CURRENT_ASSETS)
WC_LIABILITY_CLASSES = frozenset({CURRENT_LIABILITIES, SUNDRY_CREDITORS})

_MONTH_NAMES = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


@dataclass(frozen=True)
class MonthSpan:
    key: str  # YYYY-MM
    label: str  # "Jul 2026"
    start: date
    end: date
    ym: int  # 202607, matches `year_month_sql`


def month_spans(fy_start: date) -> list[MonthSpan]:
    """The 12 months of the fiscal year that starts on `fy_start`, in order (works for Jan and Jul starts)."""
    spans: list[MonthSpan] = []
    year, month = fy_start.year, fy_start.month
    for _ in range(12):
        start = date(year, month, 1)
        ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
        end = date(ny, nm, 1) - timedelta(days=1)
        spans.append(MonthSpan(f"{year:04d}-{month:02d}", f"{_MONTH_NAMES[month - 1]} {year}", start, end, year * 100 + month))
        year, month = ny, nm
    return spans


def year_month_sql(column=Voucher.voucher_date):
    """yyyymm as an integer (no time zone, unlike date_trunc on a date)."""
    return cast(func.extract("year", column) * 100 + func.extract("month", column), Integer)


def voucher_statement_clause():
    """POSTED, or REVERSED with its reversal posted (same rule as ledger_aggregate_service), and in the books."""
    return and_(
        or_(Voucher.status == "POSTED", and_(Voucher.status == "REVERSED", Voucher.reversed_by_voucher_id.is_not(None))),
        voucher_in_books_clause(),
    )


def group_ids_for(groups: dict[int, GroupInfo], classes: frozenset[str]) -> list[int]:
    return [gid for gid, info in groups.items() if info.effective_class in classes]


def q4(value: Decimal | None) -> Decimal:
    return Decimal(value or 0).quantize(Q4)
