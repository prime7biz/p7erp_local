"""Create voucher_tax_lines table (Sprint 3 GST/Tax)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "205"
down_revision: Union[str, None] = "204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voucher_tax_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("voucher_line_id", sa.Integer(), nullable=True),
        sa.Column("tax_ledger_id", sa.Integer(), nullable=False),
        sa.Column("taxable_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("tax_rate_applied", sa.Numeric(5, 2), nullable=False),
        sa.Column("hsn_code", sa.String(length=32), nullable=True),
        sa.Column("is_itc_eligible", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="OUTWARD"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "direction IN ('OUTWARD', 'INWARD')",
            name="ck_voucher_tax_lines_direction",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_line_id"], ["voucher_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tax_ledger_id"], ["tax_ledgers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_voucher_tax_lines_tenant_id", "voucher_tax_lines", ["tenant_id"])
    op.create_index("ix_voucher_tax_lines_voucher_id", "voucher_tax_lines", ["voucher_id"])
    op.create_index("ix_voucher_tax_lines_tax_ledger_id", "voucher_tax_lines", ["tax_ledger_id"])
    op.create_index(
        "ix_voucher_tax_lines_tenant_voucher",
        "voucher_tax_lines",
        ["tenant_id", "voucher_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_voucher_tax_lines_tenant_voucher", table_name="voucher_tax_lines")
    op.drop_index("ix_voucher_tax_lines_tax_ledger_id", table_name="voucher_tax_lines")
    op.drop_index("ix_voucher_tax_lines_voucher_id", table_name="voucher_tax_lines")
    op.drop_index("ix_voucher_tax_lines_tenant_id", table_name="voucher_tax_lines")
    op.drop_table("voucher_tax_lines")
