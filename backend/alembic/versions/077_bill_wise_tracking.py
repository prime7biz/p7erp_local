"""Add bill-wise tracking: enable_bill_wise on chart_of_accounts, bill_references and bill_allocations tables.

Revision ID: 077
Revises: 076
Create Date: 2026-03-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "077"
down_revision: Union[str, None] = "076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chart_of_accounts",
        sa.Column("enable_bill_wise", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "bill_references",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("bill_number", sa.String(50), nullable=False, index=True),
        sa.Column("bill_date", sa.Date(), nullable=False, index=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("bill_type", sa.String(20), nullable=False, index=True),
        sa.Column("party_name", sa.String(255), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("original_amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("pending_amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("source_voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("source_doc_type", sa.String(50), nullable=True),
        sa.Column("source_doc_number", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN", index=True),
        sa.Column("credit_period_days", sa.Integer(), nullable=True),
        sa.Column("is_overdue", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "bill_allocations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("bill_reference_id", sa.Integer(), sa.ForeignKey("bill_references.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("voucher_line_id", sa.Integer(), sa.ForeignKey("voucher_lines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("allocation_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("allocation_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("bill_allocations")
    op.drop_table("bill_references")
    op.drop_column("chart_of_accounts", "enable_bill_wise")
