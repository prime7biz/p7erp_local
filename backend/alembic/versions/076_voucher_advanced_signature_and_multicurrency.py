"""Add advanced voucher signature and multi-currency fields.

Revision ID: 076
Revises: 075
Create Date: 2026-03-20
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "076"
down_revision: Union[str, None] = "075"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vouchers", sa.Column("currency", sa.String(length=8), nullable=False, server_default="BDT"))
    op.add_column("vouchers", sa.Column("base_currency", sa.String(length=8), nullable=False, server_default="BDT"))
    op.add_column("vouchers", sa.Column("exchange_rate", sa.String(length=32), nullable=False, server_default="1"))
    op.add_column("vouchers", sa.Column("exchange_rate_source", sa.String(length=32), nullable=False, server_default="system"))
    op.add_column("vouchers", sa.Column("exchange_rate_fetched_at", sa.DateTime(), nullable=True))
    op.add_column("vouchers", sa.Column("verification_id", sa.String(length=64), nullable=True))
    op.add_column("vouchers", sa.Column("signature_hash", sa.String(length=128), nullable=True))
    op.add_column("vouchers", sa.Column("signed_at", sa.DateTime(), nullable=True))
    op.add_column("vouchers", sa.Column("signed_by_system", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_vouchers_verification_id", "vouchers", ["verification_id"], unique=True)

    op.add_column("voucher_lines", sa.Column("currency", sa.String(length=8), nullable=False, server_default="BDT"))
    op.add_column("voucher_lines", sa.Column("exchange_rate", sa.String(length=32), nullable=False, server_default="1"))
    op.add_column("voucher_lines", sa.Column("base_amount", sa.String(length=32), nullable=False, server_default="0"))
    op.add_column("voucher_lines", sa.Column("is_rate_overridden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("voucher_lines", sa.Column("rate_source", sa.String(length=32), nullable=False, server_default="system"))

    op.alter_column("vouchers", "currency", server_default=None)
    op.alter_column("vouchers", "base_currency", server_default=None)
    op.alter_column("vouchers", "exchange_rate", server_default=None)
    op.alter_column("vouchers", "exchange_rate_source", server_default=None)
    op.alter_column("vouchers", "signed_by_system", server_default=None)
    op.alter_column("voucher_lines", "currency", server_default=None)
    op.alter_column("voucher_lines", "exchange_rate", server_default=None)
    op.alter_column("voucher_lines", "base_amount", server_default=None)
    op.alter_column("voucher_lines", "is_rate_overridden", server_default=None)
    op.alter_column("voucher_lines", "rate_source", server_default=None)


def downgrade() -> None:
    op.drop_column("voucher_lines", "rate_source")
    op.drop_column("voucher_lines", "is_rate_overridden")
    op.drop_column("voucher_lines", "base_amount")
    op.drop_column("voucher_lines", "exchange_rate")
    op.drop_column("voucher_lines", "currency")

    op.drop_index("ix_vouchers_verification_id", table_name="vouchers")
    op.drop_column("vouchers", "signed_by_system")
    op.drop_column("vouchers", "signed_at")
    op.drop_column("vouchers", "signature_hash")
    op.drop_column("vouchers", "verification_id")
    op.drop_column("vouchers", "exchange_rate_fetched_at")
    op.drop_column("vouchers", "exchange_rate_source")
    op.drop_column("vouchers", "exchange_rate")
    op.drop_column("vouchers", "base_currency")
    op.drop_column("vouchers", "currency")
