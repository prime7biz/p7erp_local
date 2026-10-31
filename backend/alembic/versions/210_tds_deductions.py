"""Create tds_deductions (Sprint 5)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "210"
down_revision: Union[str, None] = "209"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tds_deductions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("party_ledger_id", sa.Integer(), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=True),
        sa.Column("tds_section_id", sa.Integer(), nullable=False),
        sa.Column("taxable_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("tds_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("net_payment", sa.Numeric(15, 2), nullable=True),
        sa.Column("tds_liability_voucher_id", sa.Integer(), nullable=True),
        sa.Column("certificate_number", sa.String(length=64), nullable=True),
        sa.Column("certificate_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="PENDING"),
        sa.Column("deduction_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "status IN ('PENDING', 'DEPOSITED', 'CERTIFICATE_ISSUED')",
            name="ck_tds_deductions_status",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["party_ledger_id"], ["party_ledgers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tds_section_id"], ["tds_sections.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tds_liability_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tds_deductions_tenant_id", "tds_deductions", ["tenant_id"])
    op.create_index("ix_tds_deductions_party_ledger_id", "tds_deductions", ["party_ledger_id"])
    op.create_index("ix_tds_deductions_voucher_id", "tds_deductions", ["voucher_id"])
    op.create_index("ix_tds_deductions_status", "tds_deductions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_tds_deductions_status", table_name="tds_deductions")
    op.drop_index("ix_tds_deductions_voucher_id", table_name="tds_deductions")
    op.drop_index("ix_tds_deductions_party_ledger_id", table_name="tds_deductions")
    op.drop_index("ix_tds_deductions_tenant_id", table_name="tds_deductions")
    op.drop_table("tds_deductions")
