"""Voucher controls: series metadata, source module, reversal linkage, posted snapshot, duplicates, bank hook.

Revision ID: 143
Revises: 142
Create Date: 2026-03-31
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "143"
down_revision: Union[str, None] = "142"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "vouchers",
        "voucher_number",
        existing_type=sa.String(length=32),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
    op.add_column("vouchers", sa.Column("branch_code", sa.String(length=32), nullable=False, server_default="MAIN"))
    op.add_column("vouchers", sa.Column("fiscal_year", sa.Integer(), nullable=True))
    op.add_column("vouchers", sa.Column("series_sequence", sa.Integer(), nullable=True))
    op.add_column("vouchers", sa.Column("number_series_key", sa.String(length=128), nullable=True))
    op.add_column("vouchers", sa.Column("source_module", sa.String(length=32), nullable=True))
    op.add_column("vouchers", sa.Column("source_module_ref", sa.String(length=128), nullable=True))
    op.add_column(
        "vouchers",
        sa.Column("allow_manual_edit", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column("vouchers", sa.Column("reverses_voucher_id", sa.Integer(), nullable=True))
    op.add_column("vouchers", sa.Column("reversed_by_voucher_id", sa.Integer(), nullable=True))
    op.add_column("vouchers", sa.Column("reversal_reason", sa.Text(), nullable=True))
    op.add_column("vouchers", sa.Column("reversal_recorded_at", sa.DateTime(), nullable=True))
    op.add_column("vouchers", sa.Column("reversal_recorded_by_user_id", sa.Integer(), nullable=True))
    op.add_column("vouchers", sa.Column("posted_snapshot_json", sa.Text(), nullable=True))
    op.add_column("vouchers", sa.Column("instrument_reference", sa.String(length=128), nullable=True))
    op.add_column("vouchers", sa.Column("duplicate_risk_hash", sa.String(length=64), nullable=True))
    op.add_column("vouchers", sa.Column("bank_reconciliation_id", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "fk_vouchers_reverses_voucher_id",
        "vouchers",
        "vouchers",
        ["reverses_voucher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_vouchers_reversed_by_voucher_id",
        "vouchers",
        "vouchers",
        ["reversed_by_voucher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_vouchers_reversal_recorded_by_user_id",
        "vouchers",
        "users",
        ["reversal_recorded_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_vouchers_bank_reconciliation_id",
        "vouchers",
        "bank_reconciliations",
        ["bank_reconciliation_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_vouchers_reverses_voucher_id", "vouchers", ["reverses_voucher_id"], unique=False)
    op.create_index("ix_vouchers_reversed_by_voucher_id", "vouchers", ["reversed_by_voucher_id"], unique=False)
    op.create_index(
        "ix_vouchers_tenant_duplicate_risk_hash",
        "vouchers",
        ["tenant_id", "duplicate_risk_hash"],
        unique=False,
    )
    op.create_index("ix_vouchers_bank_reconciliation_id", "vouchers", ["bank_reconciliation_id"], unique=False)

    op.alter_column("vouchers", "branch_code", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_vouchers_bank_reconciliation_id", table_name="vouchers")
    op.drop_index("ix_vouchers_tenant_duplicate_risk_hash", table_name="vouchers")
    op.drop_index("ix_vouchers_reversed_by_voucher_id", table_name="vouchers")
    op.drop_index("ix_vouchers_reverses_voucher_id", table_name="vouchers")
    op.drop_constraint("fk_vouchers_bank_reconciliation_id", "vouchers", type_="foreignkey")
    op.drop_constraint("fk_vouchers_reversal_recorded_by_user_id", "vouchers", type_="foreignkey")
    op.drop_constraint("fk_vouchers_reversed_by_voucher_id", "vouchers", type_="foreignkey")
    op.drop_constraint("fk_vouchers_reverses_voucher_id", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "bank_reconciliation_id")
    op.drop_column("vouchers", "duplicate_risk_hash")
    op.drop_column("vouchers", "instrument_reference")
    op.drop_column("vouchers", "posted_snapshot_json")
    op.drop_column("vouchers", "reversal_recorded_by_user_id")
    op.drop_column("vouchers", "reversal_recorded_at")
    op.drop_column("vouchers", "reversal_reason")
    op.drop_column("vouchers", "reversed_by_voucher_id")
    op.drop_column("vouchers", "reverses_voucher_id")
    op.drop_column("vouchers", "allow_manual_edit")
    op.drop_column("vouchers", "source_module_ref")
    op.drop_column("vouchers", "source_module")
    op.drop_column("vouchers", "number_series_key")
    op.drop_column("vouchers", "series_sequence")
    op.drop_column("vouchers", "fiscal_year")
    op.drop_column("vouchers", "branch_code")
    op.alter_column(
        "vouchers",
        "voucher_number",
        existing_type=sa.String(length=64),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
