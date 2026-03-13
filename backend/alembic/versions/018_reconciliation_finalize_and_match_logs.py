"""Add reconciliation finalize fields and match logs

Revision ID: 018
Revises: 017
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bank_reconciliations", sa.Column("is_finalized", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("bank_reconciliations", sa.Column("finalized_at", sa.DateTime(), nullable=True))
    op.add_column("bank_reconciliations", sa.Column("finalized_by", sa.Integer(), nullable=True))
    op.create_index("ix_bank_reconciliations_is_finalized", "bank_reconciliations", ["is_finalized"])
    op.create_index("ix_bank_reconciliations_finalized_by", "bank_reconciliations", ["finalized_by"])
    op.create_foreign_key(
        "fk_bank_reconciliations_finalized_by_users",
        "bank_reconciliations",
        "users",
        ["finalized_by"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "bank_statement_match_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("reconciliation_id", sa.Integer(), nullable=False),
        sa.Column("statement_line_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("payment_run_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reconciliation_id"], ["bank_reconciliations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["statement_line_id"], ["bank_statement_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_run_id"], ["payment_runs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_bank_statement_match_logs_tenant_id", "bank_statement_match_logs", ["tenant_id"])
    op.create_index("ix_bank_statement_match_logs_reconciliation_id", "bank_statement_match_logs", ["reconciliation_id"])
    op.create_index("ix_bank_statement_match_logs_statement_line_id", "bank_statement_match_logs", ["statement_line_id"])
    op.create_index("ix_bank_statement_match_logs_action", "bank_statement_match_logs", ["action"])
    op.create_index("ix_bank_statement_match_logs_payment_run_id", "bank_statement_match_logs", ["payment_run_id"])
    op.create_index("ix_bank_statement_match_logs_created_by", "bank_statement_match_logs", ["created_by"])


def downgrade() -> None:
    op.drop_index("ix_bank_statement_match_logs_created_by", table_name="bank_statement_match_logs")
    op.drop_index("ix_bank_statement_match_logs_payment_run_id", table_name="bank_statement_match_logs")
    op.drop_index("ix_bank_statement_match_logs_action", table_name="bank_statement_match_logs")
    op.drop_index("ix_bank_statement_match_logs_statement_line_id", table_name="bank_statement_match_logs")
    op.drop_index("ix_bank_statement_match_logs_reconciliation_id", table_name="bank_statement_match_logs")
    op.drop_index("ix_bank_statement_match_logs_tenant_id", table_name="bank_statement_match_logs")
    op.drop_table("bank_statement_match_logs")

    op.drop_constraint("fk_bank_reconciliations_finalized_by_users", "bank_reconciliations", type_="foreignkey")
    op.drop_index("ix_bank_reconciliations_finalized_by", table_name="bank_reconciliations")
    op.drop_index("ix_bank_reconciliations_is_finalized", table_name="bank_reconciliations")
    op.drop_column("bank_reconciliations", "finalized_by")
    op.drop_column("bank_reconciliations", "finalized_at")
    op.drop_column("bank_reconciliations", "is_finalized")
