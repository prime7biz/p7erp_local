"""BTB LC maturity tranches + seed single tranche from btb_lcs.

Revision ID: 165
Revises: 164
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "165"
down_revision: Union[str, None] = "164"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "btb_maturity_tranches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("btb_lc_id", sa.Integer(), nullable=False),
        sa.Column("tranche_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("maturity_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="UPCOMING"),
        sa.Column("payment_voucher_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["btb_lc_id"], ["btb_lcs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("btb_lc_id", "tranche_no", name="uq_btb_maturity_tranches_lc_tranche"),
    )
    op.create_index("ix_btb_maturity_tranches_tenant_id", "btb_maturity_tranches", ["tenant_id"], unique=False)
    op.create_index(
        "ix_bmt_tenant_btb_date",
        "btb_maturity_tranches",
        ["tenant_id", "btb_lc_id", "maturity_date"],
        unique=False,
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO btb_maturity_tranches (
                tenant_id, btb_lc_id, tranche_no, maturity_date, amount, currency, status
            )
            SELECT
                b.tenant_id,
                b.id,
                1,
                b.maturity_date,
                COALESCE(b.maturity_amount, b.amount),
                b.currency,
                'UPCOMING'
            FROM btb_lcs b
            WHERE b.maturity_date IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM btb_maturity_tranches t WHERE t.btb_lc_id = b.id
              )
            """
        )
    )
    op.alter_column("btb_maturity_tranches", "tranche_no", server_default=None)
    op.alter_column("btb_maturity_tranches", "status", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_bmt_tenant_btb_date", table_name="btb_maturity_tranches")
    op.drop_index("ix_btb_maturity_tranches_tenant_id", table_name="btb_maturity_tranches")
    op.drop_table("btb_maturity_tranches")
