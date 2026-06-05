"""HR, wastage, knitting: String(16/32) money/qty -> Numeric (go-live remediation Phase 4).

Revision ID: 182
Revises: 181
"""

import sys
from pathlib import Path
from typing import Sequence, Union

from alembic import op

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from numeric_column_helpers import (  # noqa: E402
    alter_numeric_to_string,
    alter_string_to_numeric,
    scrub_string_decimal,
)

revision: str = "182"
down_revision: Union[str, None] = "181"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MONEY = "numeric(18,4)"
_PCT = "numeric(10,4)"
_MONEY_FMT = "FM999999999999999999.9999"
_PCT_FMT = "FM999999999999999999.9999"


def _upgrade_nn(table: str, col: str, *, existing_len: int = 16) -> None:
    scrub_string_decimal(table, col, default_lit="0", nullable=False)
    alter_string_to_numeric(
        table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=False, server_default_sql="0"
    )


def _upgrade_null(table: str, col: str, *, existing_len: int = 32) -> None:
    scrub_string_decimal(table, col, nullable=True)
    alter_string_to_numeric(table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=True)


def _downgrade_nn(table: str, col: str, *, existing_len: int = 16) -> None:
    alter_numeric_to_string(table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=False, fmt=_MONEY_FMT)


def _downgrade_null(table: str, col: str, *, existing_len: int = 32) -> None:
    alter_numeric_to_string(table, col, prec_sql=_MONEY, existing_len=existing_len, nullable=True, fmt=_MONEY_FMT)


def upgrade() -> None:
    _upgrade_nn("hr_payroll_components", "default_amount")

    _upgrade_nn("hr_payroll_structure_lines", "amount")

    for col in ("gross_total", "deduction_total", "net_total"):
        _upgrade_nn("hr_payroll_runs", col)

    for col in ("gross_pay", "deductions", "net_pay", "overtime_amount"):
        _upgrade_nn("hr_payroll_run_lines", col)

    for col in ("annual_quota_days", "max_carry_forward_days"):
        _upgrade_nn("hr_leave_policies", col)

    for col in ("allocated_days", "used_days", "pending_days", "closing_balance_days"):
        _upgrade_nn("hr_leave_balances", col)

    scrub_string_decimal("hr_leave_requests", "days_requested", nullable=False)
    alter_string_to_numeric(
        "hr_leave_requests",
        "days_requested",
        prec_sql=_MONEY,
        existing_len=16,
        nullable=False,
        server_default_sql=None,
    )

    _upgrade_nn("hr_overtime_entries", "ot_hours")
    _upgrade_nn("hr_overtime_entries", "rate_multiplier")
    scrub_string_decimal("hr_overtime_entries", "amount", nullable=True)
    alter_string_to_numeric(
        "hr_overtime_entries", "amount", prec_sql=_MONEY, existing_len=16, nullable=True
    )

    for col in ("quantity", "unit_cost", "value", "recoverable_value"):
        _upgrade_nn("wastage_transactions", col, existing_len=32)

    for col in ("planned_fabric_cons", "actual_fabric_cons", "trim_wastage_value", "total_wastage_value"):
        _upgrade_nn("wastage_order_summaries", col, existing_len=32)

    scrub_string_decimal("wastage_order_summaries", "fabric_variance_pct", default_lit="0", nullable=False)
    alter_string_to_numeric(
        "wastage_order_summaries",
        "fabric_variance_pct",
        prec_sql=_PCT,
        existing_len=16,
        nullable=False,
        server_default_sql="0",
    )

    for col in ("planned_yarn_qty", "planned_greige_qty", "processing_charge_preview"):
        _upgrade_null("knitting_work_orders", col)


def downgrade() -> None:
    for col in ("processing_charge_preview", "planned_greige_qty", "planned_yarn_qty"):
        _downgrade_null("knitting_work_orders", col)

    alter_numeric_to_string(
        "wastage_order_summaries",
        "fabric_variance_pct",
        prec_sql=_PCT,
        existing_len=16,
        nullable=False,
        fmt=_PCT_FMT,
    )
    for col in ("total_wastage_value", "trim_wastage_value", "actual_fabric_cons", "planned_fabric_cons"):
        _downgrade_nn("wastage_order_summaries", col, existing_len=32)

    for col in ("recoverable_value", "value", "unit_cost", "quantity"):
        _downgrade_nn("wastage_transactions", col, existing_len=32)

    alter_numeric_to_string(
        "hr_overtime_entries", "amount", prec_sql=_MONEY, existing_len=16, nullable=True, fmt=_MONEY_FMT
    )
    _downgrade_nn("hr_overtime_entries", "rate_multiplier")
    _downgrade_nn("hr_overtime_entries", "ot_hours")

    alter_numeric_to_string(
        "hr_leave_requests",
        "days_requested",
        prec_sql=_MONEY,
        existing_len=16,
        nullable=False,
        fmt=_MONEY_FMT,
    )

    for col in ("closing_balance_days", "pending_days", "used_days", "allocated_days"):
        _downgrade_nn("hr_leave_balances", col)

    for col in ("max_carry_forward_days", "annual_quota_days"):
        _downgrade_nn("hr_leave_policies", col)

    for col in ("overtime_amount", "net_pay", "deductions", "gross_pay"):
        _downgrade_nn("hr_payroll_run_lines", col)

    for col in ("net_total", "deduction_total", "gross_total"):
        _downgrade_nn("hr_payroll_runs", col)

    _downgrade_nn("hr_payroll_structure_lines", "amount")
    _downgrade_nn("hr_payroll_components", "default_amount")
