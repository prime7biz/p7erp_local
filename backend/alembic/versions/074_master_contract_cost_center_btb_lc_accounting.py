"""Master contract cost center and BTB LC accounting lifecycle.

- master_contracts.cost_center_id -> cost_centers.id
- btb_lc_accounting: track LC open voucher, import bill voucher, maturity, realization
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "074"
down_revision: Union[str, None] = "073"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Master contract -> cost center (for payments and COGS allocation)
    op.add_column(
        "master_contracts",
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_master_contracts_cost_center_id",
        "master_contracts",
        "cost_centers",
        ["cost_center_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_master_contracts_cost_center_id",
        "master_contracts",
        ["cost_center_id"],
        unique=False,
    )

    # BTB LC accounting lifecycle: LC open, import bill liability, realization
    op.create_table(
        "btb_lc_accounting",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("btb_lc_id", sa.Integer(), nullable=False),
        sa.Column("lc_open_voucher_id", sa.Integer(), nullable=True),
        sa.Column("import_bill_voucher_id", sa.Integer(), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=True),
        sa.Column("realization_voucher_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="OPEN"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["btb_lc_id"],
            ["btb_lcs.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lc_open_voucher_id"],
            ["vouchers.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["import_bill_voucher_id"],
            ["vouchers.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["realization_voucher_id"],
            ["vouchers.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_btb_lc_accounting_tenant_id",
        "btb_lc_accounting",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_btb_lc_accounting_btb_lc_id",
        "btb_lc_accounting",
        ["btb_lc_id"],
        unique=True,
    )
    op.create_index(
        "ix_btb_lc_accounting_lc_open_voucher_id",
        "btb_lc_accounting",
        ["lc_open_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_btb_lc_accounting_import_bill_voucher_id",
        "btb_lc_accounting",
        ["import_bill_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_btb_lc_accounting_realization_voucher_id",
        "btb_lc_accounting",
        ["realization_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_btb_lc_accounting_status",
        "btb_lc_accounting",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_btb_lc_accounting_status", table_name="btb_lc_accounting")
    op.drop_index(
        "ix_btb_lc_accounting_realization_voucher_id",
        table_name="btb_lc_accounting",
    )
    op.drop_index(
        "ix_btb_lc_accounting_import_bill_voucher_id",
        table_name="btb_lc_accounting",
    )
    op.drop_index(
        "ix_btb_lc_accounting_lc_open_voucher_id",
        table_name="btb_lc_accounting",
    )
    op.drop_index("ix_btb_lc_accounting_btb_lc_id", table_name="btb_lc_accounting")
    op.drop_index("ix_btb_lc_accounting_tenant_id", table_name="btb_lc_accounting")
    op.drop_table("btb_lc_accounting")

    op.drop_index("ix_master_contracts_cost_center_id", table_name="master_contracts")
    op.drop_constraint(
        "fk_master_contracts_cost_center_id",
        "master_contracts",
        type_="foreignkey",
    )
    op.drop_column("master_contracts", "cost_center_id")
