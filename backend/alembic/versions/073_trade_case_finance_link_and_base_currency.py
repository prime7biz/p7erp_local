"""Add trade_case_id to vouchers and payment_runs; base_currency fields on trade_cases (Phase F).

Revision ID: 073
Revises: 072
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "073"
down_revision: Union[str, None] = "072"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "vouchers",
        sa.Column("trade_case_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_vouchers_trade_case_id",
        "vouchers",
        "trade_cases",
        ["trade_case_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_vouchers_trade_case_id", "vouchers", ["trade_case_id"], unique=False)

    op.add_column(
        "payment_runs",
        sa.Column("trade_case_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_payment_runs_trade_case_id",
        "payment_runs",
        "trade_cases",
        ["trade_case_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_payment_runs_trade_case_id", "payment_runs", ["trade_case_id"], unique=False)

    op.add_column(
        "trade_cases",
        sa.Column("base_currency", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "trade_cases",
        sa.Column("base_currency_margin", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trade_cases", "base_currency_margin")
    op.drop_column("trade_cases", "base_currency")

    op.drop_index("ix_payment_runs_trade_case_id", table_name="payment_runs")
    op.drop_constraint("fk_payment_runs_trade_case_id", "payment_runs", type_="foreignkey")
    op.drop_column("payment_runs", "trade_case_id")

    op.drop_index("ix_vouchers_trade_case_id", table_name="vouchers")
    op.drop_constraint("fk_vouchers_trade_case_id", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "trade_case_id")
