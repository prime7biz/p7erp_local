"""Create tax_ledgers table (Sprint 3 GST/Tax)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "204"
down_revision: Union[str, None] = "203"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tax_ledgers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("chart_account_id", sa.Integer(), nullable=False),
        sa.Column("tax_type", sa.String(length=16), nullable=False),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("gst_type", sa.String(length=16), nullable=False, server_default="GOODS"),
        sa.Column("nature_of_transaction", sa.String(length=128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "tax_type IN ('CGST', 'SGST', 'IGST', 'UTGST', 'VAT', 'CST')",
            name="ck_tax_ledgers_tax_type",
        ),
        sa.CheckConstraint(
            "gst_type IN ('GOODS', 'SERVICES')",
            name="ck_tax_ledgers_gst_type",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chart_account_id"], ["chart_of_accounts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "tax_type",
            "tax_rate",
            "gst_type",
            name="uq_tax_ledgers_tenant_type_rate_gst",
        ),
    )
    op.create_index("ix_tax_ledgers_tenant_id", "tax_ledgers", ["tenant_id"])
    op.create_index("ix_tax_ledgers_chart_account_id", "tax_ledgers", ["chart_account_id"])
    op.create_index("ix_tax_ledgers_tax_type", "tax_ledgers", ["tax_type"])


def downgrade() -> None:
    op.drop_index("ix_tax_ledgers_tax_type", table_name="tax_ledgers")
    op.drop_index("ix_tax_ledgers_chart_account_id", table_name="tax_ledgers")
    op.drop_index("ix_tax_ledgers_tenant_id", table_name="tax_ledgers")
    op.drop_table("tax_ledgers")
