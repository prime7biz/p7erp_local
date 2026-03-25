"""Production cost, CM actuals, WIP journals, mfg_work_order on vouchers.

Revision ID: 097
Revises: 096
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "097"
down_revision: Union[str, None] = "096"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "production_cost_inputs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_type", sa.String(length=32), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=True),
        sa.Column("cost_date", sa.Date(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("labor_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("helper_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("supervision_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("machine_depreciation", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("overhead_allocation", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("utility_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("other_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_production_cost_inputs_tenant_cost_date", "production_cost_inputs", ["tenant_id", "cost_date"])

    op.create_table(
        "cm_cost_actuals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("line_id", sa.Integer(), nullable=True),
        sa.Column("period_date", sa.Date(), nullable=False),
        sa.Column("total_production_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_good_output", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("actual_cm_per_piece", sa.Numeric(18, 6), nullable=True),
        sa.Column("quoted_cm_per_piece", sa.Numeric(18, 6), nullable=True),
        sa.Column("variance_amount", sa.Numeric(18, 6), nullable=True),
        sa.Column("variance_pct", sa.Numeric(18, 4), nullable=True),
        sa.Column("is_over_budget", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("alert_triggered", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cm_cost_actuals_tenant_period", "cm_cost_actuals", ["tenant_id", "period_date"])

    op.create_table(
        "wip_journals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("from_department", sa.String(length=32), nullable=False),
        sa.Column("to_department", sa.String(length=32), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("uom", sa.String(length=32), nullable=True),
        sa.Column("material_value", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("conversion_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_value", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("voucher_id", sa.Integer(), nullable=True),
        sa.Column("cost_center_id", sa.Integer(), nullable=True),
        sa.Column("journal_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cost_center_id"], ["cost_centers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wip_journals_tenant_id", "wip_journals", ["tenant_id"])

    op.add_column(
        "vouchers",
        sa.Column("mfg_work_order_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_vouchers_mfg_work_order_id",
        "vouchers",
        "mfg_work_orders",
        ["mfg_work_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_vouchers_mfg_work_order_id", "vouchers", ["mfg_work_order_id"])


def downgrade() -> None:
    op.drop_index("ix_vouchers_mfg_work_order_id", table_name="vouchers")
    op.drop_constraint("fk_vouchers_mfg_work_order_id", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "mfg_work_order_id")
    op.drop_index("ix_wip_journals_tenant_id", table_name="wip_journals")
    op.drop_table("wip_journals")
    op.drop_index("ix_cm_cost_actuals_tenant_period", table_name="cm_cost_actuals")
    op.drop_table("cm_cost_actuals")
    op.drop_index("ix_production_cost_inputs_tenant_cost_date", table_name="production_cost_inputs")
    op.drop_table("production_cost_inputs")
