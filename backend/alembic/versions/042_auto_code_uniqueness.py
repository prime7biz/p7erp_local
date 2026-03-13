"""Enforce tenant scoped uniqueness for generated codes.

Revision ID: 042
Revises: 041
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op


revision: str = "042"
down_revision: Union[str, None] = "041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_inquiries_tenant_inquiry_code",
        "inquiries",
        ["tenant_id", "inquiry_code"],
    )
    op.create_unique_constraint(
        "uq_quotations_tenant_quotation_code",
        "quotations",
        ["tenant_id", "quotation_code"],
    )
    op.create_unique_constraint(
        "uq_orders_tenant_order_code",
        "orders",
        ["tenant_id", "order_code"],
    )
    op.create_unique_constraint(
        "uq_account_groups_tenant_code",
        "account_groups",
        ["tenant_id", "code"],
    )
    op.create_unique_constraint(
        "uq_chart_of_accounts_tenant_account_number",
        "chart_of_accounts",
        ["tenant_id", "account_number"],
    )
    op.create_unique_constraint(
        "uq_vouchers_tenant_voucher_number",
        "vouchers",
        ["tenant_id", "voucher_number"],
    )
    op.create_unique_constraint(
        "uq_fx_receipts_tenant_receipt_no",
        "fx_receipts",
        ["tenant_id", "receipt_no"],
    )
    op.create_unique_constraint(
        "uq_outstanding_bills_tenant_bill_no",
        "outstanding_bills",
        ["tenant_id", "bill_no"],
    )
    op.create_unique_constraint(
        "uq_cost_centers_tenant_center_code",
        "cost_centers",
        ["tenant_id", "center_code"],
    )
    op.create_unique_constraint(
        "uq_payment_runs_tenant_run_code",
        "payment_runs",
        ["tenant_id", "run_code"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_payment_runs_tenant_run_code", "payment_runs", type_="unique")
    op.drop_constraint("uq_cost_centers_tenant_center_code", "cost_centers", type_="unique")
    op.drop_constraint("uq_outstanding_bills_tenant_bill_no", "outstanding_bills", type_="unique")
    op.drop_constraint("uq_fx_receipts_tenant_receipt_no", "fx_receipts", type_="unique")
    op.drop_constraint("uq_vouchers_tenant_voucher_number", "vouchers", type_="unique")
    op.drop_constraint(
        "uq_chart_of_accounts_tenant_account_number",
        "chart_of_accounts",
        type_="unique",
    )
    op.drop_constraint("uq_account_groups_tenant_code", "account_groups", type_="unique")
    op.drop_constraint("uq_orders_tenant_order_code", "orders", type_="unique")
    op.drop_constraint("uq_quotations_tenant_quotation_code", "quotations", type_="unique")
    op.drop_constraint("uq_inquiries_tenant_inquiry_code", "inquiries", type_="unique")
