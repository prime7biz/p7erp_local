"""Enhance voucher_types + vouchers for advanced voucher kinds (Sprint 4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "206"
down_revision: Union[str, None] = "205"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "voucher_types",
        sa.Column("is_credit_note", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "voucher_types",
        sa.Column("is_debit_note", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "voucher_types",
        sa.Column("is_memorandum", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "voucher_types",
        sa.Column("is_optional", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "voucher_types",
        sa.Column("is_post_dated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "voucher_types",
        sa.Column("is_stock_transfer", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.add_column(
        "vouchers",
        sa.Column("is_post_dated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "vouchers",
        sa.Column("is_memorandum", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "vouchers",
        sa.Column("is_optional", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "vouchers",
        sa.Column("include_in_books", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "vouchers",
        sa.Column("books_applied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "vouchers",
        sa.Column("original_party_bill_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "vouchers",
        sa.Column("voucher_class_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_vouchers_is_post_dated", "vouchers", ["is_post_dated"])
    op.create_index("ix_vouchers_is_memorandum", "vouchers", ["is_memorandum"])
    op.create_index("ix_vouchers_is_optional", "vouchers", ["is_optional"])


def downgrade() -> None:
    op.drop_index("ix_vouchers_is_optional", table_name="vouchers")
    op.drop_index("ix_vouchers_is_memorandum", table_name="vouchers")
    op.drop_index("ix_vouchers_is_post_dated", table_name="vouchers")
    op.drop_column("vouchers", "voucher_class_id")
    op.drop_column("vouchers", "original_party_bill_id")
    op.drop_column("vouchers", "books_applied")
    op.drop_column("vouchers", "include_in_books")
    op.drop_column("vouchers", "is_optional")
    op.drop_column("vouchers", "is_memorandum")
    op.drop_column("vouchers", "is_post_dated")
    op.drop_column("voucher_types", "is_stock_transfer")
    op.drop_column("voucher_types", "is_post_dated")
    op.drop_column("voucher_types", "is_optional")
    op.drop_column("voucher_types", "is_memorandum")
    op.drop_column("voucher_types", "is_debit_note")
    op.drop_column("voucher_types", "is_credit_note")
