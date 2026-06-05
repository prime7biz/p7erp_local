"""Finance module: String money/qty columns -> Numeric (go-live remediation Phase 2).

Revision ID: 180
Revises: 179
"""

import sys
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from numeric_column_helpers import (  # noqa: E402
    alter_numeric_to_string,
    alter_string_to_numeric,
    scrub_string_decimal,
)

revision: str = "180"
down_revision: Union[str, None] = "179"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MONEY = "numeric(18,4)"
_RATE = "numeric(18,6)"
_PCT = "numeric(10,4)"
_MONEY_FMT = "FM999999999999999999.9999"
_RATE_FMT = "FM999999999999999999.999999"
_PCT_FMT = "FM999999999999999999.9999"


def _upgrade_money_nn(table: str, col: str, *, existing_len: int = 32) -> None:
    scrub_string_decimal(table, col, default_lit="0", nullable=False)
    alter_string_to_numeric(
        table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=False, server_default_sql="0"
    )


def _upgrade_money_null(table: str, col: str, *, existing_len: int = 32) -> None:
    scrub_string_decimal(table, col, nullable=True)
    alter_string_to_numeric(table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=True)


def _upgrade_rate_nn(table: str, col: str, *, existing_len: int = 32, default: str = "1") -> None:
    scrub_string_decimal(table, col, default_lit=default, nullable=False)
    alter_string_to_numeric(
        table, col, prec_sql=_RATE, existing_len=existing_len, nullable=False, server_default_sql=default
    )


def _upgrade_rate_null(table: str, col: str, *, existing_len: int = 32) -> None:
    scrub_string_decimal(table, col, nullable=True)
    alter_string_to_numeric(table, col, prec_sql=_RATE, existing_len=existing_len, nullable=True)


def _downgrade_money_nn(table: str, col: str, *, existing_len: int = 32) -> None:
    alter_numeric_to_string(table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=False, fmt=_MONEY_FMT)


def _downgrade_money_null(table: str, col: str, *, existing_len: int = 32) -> None:
    alter_numeric_to_string(table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=True, fmt=_MONEY_FMT)


def _downgrade_rate_nn(table: str, col: str, *, existing_len: int = 32) -> None:
    alter_numeric_to_string(table, col, prec_sql=_RATE, existing_len=existing_len, nullable=False, fmt=_RATE_FMT)


def upgrade() -> None:
    _upgrade_money_nn("chart_of_accounts", "opening_balance")
    _upgrade_money_nn("chart_of_accounts", "balance")

    _upgrade_rate_nn("vouchers", "exchange_rate")

    _upgrade_rate_nn("voucher_lines", "exchange_rate")
    _upgrade_money_nn("voucher_lines", "base_amount")
    _upgrade_money_nn("voucher_lines", "amount")

    for col in ("inflow", "outflow", "net", "cumulative"):
        _upgrade_money_nn("cash_forecast_lines", col)

    _upgrade_money_nn("fx_receipts", "fc_amount")
    _upgrade_rate_nn("fx_receipts", "rate_to_base")
    _upgrade_money_nn("fx_receipts", "base_amount")
    _upgrade_money_nn("fx_receipts", "settled_amount")

    for col in ("subtotal_amount", "tax_amount", "total_amount"):
        _upgrade_money_null("vendor_bills", col)

    _upgrade_money_nn("vendor_bill_lines", "quantity")
    _upgrade_money_nn("vendor_bill_lines", "unit_price")
    _upgrade_money_null("vendor_bill_lines", "line_total")
    scrub_string_decimal("vendor_bill_lines", "tax_rate", nullable=True)
    alter_string_to_numeric(
        "vendor_bill_lines", "tax_rate", prec_sql=_PCT, existing_len=16, nullable=True
    )
    _upgrade_money_null("vendor_bill_lines", "tax_amount")

    _upgrade_money_nn("outstanding_bills", "amount")
    _upgrade_money_nn("outstanding_bills", "paid_amount")

    _upgrade_money_nn("budget_lines", "amount")

    _upgrade_money_nn("bank_accounts", "opening_balance")
    _upgrade_money_nn("bank_accounts", "current_balance")

    for col in ("statement_balance", "book_balance", "difference_amount"):
        _upgrade_money_nn("bank_reconciliations", col)

    _upgrade_money_nn("bank_statement_lines", "debit_amount")
    _upgrade_money_nn("bank_statement_lines", "credit_amount")
    _upgrade_money_null("bank_statement_lines", "running_balance")

    _upgrade_money_nn("payment_runs", "total_amount")

    _upgrade_money_nn("payment_run_items", "amount")
    _upgrade_rate_nn("payment_run_items", "fx_rate_to_base")
    _upgrade_money_nn("payment_run_items", "base_amount")

    _upgrade_money_nn("bill_references", "original_amount")
    _upgrade_money_nn("bill_references", "pending_amount")

    _upgrade_money_nn("bill_allocations", "amount")


def downgrade() -> None:
    _downgrade_money_nn("bill_allocations", "amount")

    _downgrade_money_nn("bill_references", "pending_amount")
    _downgrade_money_nn("bill_references", "original_amount")

    _downgrade_money_nn("payment_run_items", "base_amount")
    _downgrade_rate_nn("payment_run_items", "fx_rate_to_base")
    _downgrade_money_nn("payment_run_items", "amount")

    _downgrade_money_nn("payment_runs", "total_amount")

    _downgrade_money_null("bank_statement_lines", "running_balance")
    _downgrade_money_nn("bank_statement_lines", "credit_amount")
    _downgrade_money_nn("bank_statement_lines", "debit_amount")

    for col in ("difference_amount", "book_balance", "statement_balance"):
        _downgrade_money_nn("bank_reconciliations", col)

    _downgrade_money_nn("bank_accounts", "current_balance")
    _downgrade_money_nn("bank_accounts", "opening_balance")

    _downgrade_money_nn("budget_lines", "amount")

    _downgrade_money_nn("outstanding_bills", "paid_amount")
    _downgrade_money_nn("outstanding_bills", "amount")

    _downgrade_money_null("vendor_bill_lines", "tax_amount")
    alter_numeric_to_string(
        "vendor_bill_lines", "tax_rate", prec_sql=_PCT, existing_len=16, nullable=True, fmt=_PCT_FMT
    )
    _downgrade_money_null("vendor_bill_lines", "line_total")
    _downgrade_money_nn("vendor_bill_lines", "unit_price")
    _downgrade_money_nn("vendor_bill_lines", "quantity")

    for col in ("total_amount", "tax_amount", "subtotal_amount"):
        _downgrade_money_null("vendor_bills", col)

    _downgrade_money_nn("fx_receipts", "settled_amount")
    _downgrade_money_nn("fx_receipts", "base_amount")
    _downgrade_rate_nn("fx_receipts", "rate_to_base")
    _downgrade_money_nn("fx_receipts", "fc_amount")

    for col in ("cumulative", "net", "outflow", "inflow"):
        _downgrade_money_nn("cash_forecast_lines", col)

    _downgrade_money_nn("voucher_lines", "amount")
    _downgrade_money_nn("voucher_lines", "base_amount")
    _downgrade_rate_nn("voucher_lines", "exchange_rate")

    _downgrade_rate_nn("vouchers", "exchange_rate")

    _downgrade_money_nn("chart_of_accounts", "balance")
    _downgrade_money_nn("chart_of_accounts", "opening_balance")
