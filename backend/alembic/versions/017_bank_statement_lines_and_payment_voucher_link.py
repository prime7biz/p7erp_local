"""Add bank statement lines and payment run voucher link

Revision ID: 017
Revises: 016
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payment_runs", sa.Column("executed_voucher_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_payment_runs_executed_voucher_id_vouchers",
        "payment_runs",
        "vouchers",
        ["executed_voucher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_payment_runs_executed_voucher_id", "payment_runs", ["executed_voucher_id"])

    op.create_table(
        "bank_statement_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("reconciliation_id", sa.Integer(), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("reference", sa.String(length=64), nullable=True),
        sa.Column("debit_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("credit_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("running_balance", sa.String(length=32), nullable=True),
        sa.Column("matched_payment_run_id", sa.Integer(), nullable=True),
        sa.Column("matched_status", sa.String(length=16), nullable=False, server_default="UNMATCHED"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reconciliation_id"], ["bank_reconciliations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["matched_payment_run_id"], ["payment_runs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_bank_statement_lines_tenant_id", "bank_statement_lines", ["tenant_id"])
    op.create_index("ix_bank_statement_lines_reconciliation_id", "bank_statement_lines", ["reconciliation_id"])
    op.create_index("ix_bank_statement_lines_reference", "bank_statement_lines", ["reference"])
    op.create_index("ix_bank_statement_lines_matched_payment_run_id", "bank_statement_lines", ["matched_payment_run_id"])
    op.create_index("ix_bank_statement_lines_matched_status", "bank_statement_lines", ["matched_status"])


def downgrade() -> None:
    op.drop_index("ix_bank_statement_lines_matched_status", table_name="bank_statement_lines")
    op.drop_index("ix_bank_statement_lines_matched_payment_run_id", table_name="bank_statement_lines")
    op.drop_index("ix_bank_statement_lines_reference", table_name="bank_statement_lines")
    op.drop_index("ix_bank_statement_lines_reconciliation_id", table_name="bank_statement_lines")
    op.drop_index("ix_bank_statement_lines_tenant_id", table_name="bank_statement_lines")
    op.drop_table("bank_statement_lines")

    op.drop_index("ix_payment_runs_executed_voucher_id", table_name="payment_runs")
    op.drop_constraint("fk_payment_runs_executed_voucher_id_vouchers", "payment_runs", type_="foreignkey")
    op.drop_column("payment_runs", "executed_voucher_id")
