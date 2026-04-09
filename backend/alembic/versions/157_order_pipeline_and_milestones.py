"""Order pipeline columns, DC-order bridge, voucher/export_case order_id, mfg/prod order_id.

Revision ID: 157
Revises: 156
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "157"
down_revision: Union[str, None] = "156"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("pipeline_status", sa.String(length=32), nullable=False, server_default="ORDER_CONFIRMED"),
    )
    op.create_index("ix_orders_pipeline_status", "orders", ["pipeline_status"])
    op.add_column("orders", sa.Column("pipeline_na_steps", sa.JSON(), nullable=True))
    op.add_column("orders", sa.Column("order_type", sa.String(length=16), nullable=True))
    op.create_index("ix_orders_order_type", "orders", ["order_type"])
    op.add_column(
        "orders",
        sa.Column("master_contract_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_orders_master_contract_id",
        "orders",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_orders_master_contract_id", "orders", ["master_contract_id"])
    for col in (
        "pi_issued_at",
        "lc_received_at",
        "bom_created_at",
        "po_issued_at",
        "rm_received_at",
        "production_started_at",
        "shipped_at",
        "payment_received_at",
        "completed_at",
    ):
        op.add_column("orders", sa.Column(col, sa.DateTime(), nullable=True))
    op.add_column(
        "orders",
        sa.Column("rm_received_pct", sa.Numeric(5, 2), nullable=True),
    )

    op.execute(
        """
        UPDATE orders SET pipeline_status = CASE
          WHEN UPPER(COALESCE(status, '')) = 'IN_PROGRESS' THEN 'IN_PRODUCTION'
          WHEN UPPER(COALESCE(status, '')) = 'COMPLETED' THEN 'COMPLETED'
          ELSE 'ORDER_CONFIRMED'
        END
        """
    )

    op.add_column("export_cases", sa.Column("order_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_export_cases_order_id",
        "export_cases",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_export_cases_order_id", "export_cases", ["order_id"])

    op.add_column("vouchers", sa.Column("order_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_vouchers_order_id",
        "vouchers",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_vouchers_order_id", "vouchers", ["order_id"])

    op.create_table(
        "delivery_challan_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("delivery_challan_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["delivery_challan_id"], ["delivery_challans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "delivery_challan_id",
            "order_id",
            name="uq_delivery_challan_orders_challan_order",
        ),
    )
    op.create_index("ix_delivery_challan_orders_tenant_id", "delivery_challan_orders", ["tenant_id"])
    op.create_index(
        "ix_delivery_challan_orders_delivery_challan_id",
        "delivery_challan_orders",
        ["delivery_challan_id"],
    )
    op.create_index("ix_delivery_challan_orders_order_id", "delivery_challan_orders", ["order_id"])

    # Manufacturing
    _add_order_id_fk("mfg_production_plans", "fk_mfg_production_plans_order_id")
    _add_order_id_fk("mfg_work_orders", "fk_mfg_work_orders_order_id")
    _add_order_id_fk("mfg_work_order_operations", "fk_mfg_work_order_operations_order_id")
    _add_order_id_fk("mfg_material_issues", "fk_mfg_material_issues_order_id")
    _add_order_id_fk("mfg_material_returns", "fk_mfg_material_returns_order_id")
    _add_order_id_fk("mfg_quality_checks", "fk_mfg_quality_checks_order_id")
    _add_order_id_fk("mfg_cost_snapshots", "fk_mfg_cost_snapshots_order_id")
    _add_order_id_fk("mfg_mrp_recommendations", "fk_mfg_mrp_recommendations_order_id")
    _add_order_id_fk("mfg_operation_assignments", "fk_mfg_operation_assignments_order_id")
    _add_order_id_fk("mfg_downtime_events", "fk_mfg_downtime_events_order_id")
    _add_order_id_fk("mfg_ncrs", "fk_mfg_ncrs_order_id")
    _add_order_id_fk("mfg_capas", "fk_mfg_capas_order_id")
    _add_order_id_fk("mfg_tna_plan_tasks", "fk_mfg_tna_plan_tasks_order_id")

    # Production (garment)
    _add_order_id_fk("line_crew_daily", "fk_line_crew_daily_order_id")
    _add_order_id_fk("unit_crew_daily", "fk_unit_crew_daily_order_id")
    _add_order_id_fk("operation_bulletins", "fk_operation_bulletins_order_id")
    _add_order_id_fk("line_balance_runs", "fk_line_balance_runs_order_id")
    _add_order_id_fk("lay_plans", "fk_lay_plans_order_id")
    _add_order_id_fk("cut_tickets", "fk_cut_tickets_order_id")
    _add_order_id_fk("production_cost_inputs", "fk_production_cost_inputs_order_id")
    _add_order_id_fk("dye_recipes", "fk_dye_recipes_order_id")
    _add_order_id_fk("production_qc_checks", "fk_production_qc_checks_order_id")
    _add_order_id_fk("line_crew_sheet_headers", "fk_line_crew_sheet_headers_order_id")

    op.alter_column("orders", "pipeline_status", server_default=None)


def _add_order_id_fk(table: str, fk_name: str) -> None:
    op.add_column(table, sa.Column("order_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        fk_name,
        table,
        "orders",
        ["order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(f"ix_{table}_order_id", table, ["order_id"])


def downgrade() -> None:
    op.drop_index("ix_delivery_challan_orders_order_id", table_name="delivery_challan_orders")
    op.drop_index("ix_delivery_challan_orders_delivery_challan_id", table_name="delivery_challan_orders")
    op.drop_index("ix_delivery_challan_orders_tenant_id", table_name="delivery_challan_orders")
    op.drop_table("delivery_challan_orders")

    op.drop_index("ix_vouchers_order_id", table_name="vouchers")
    op.drop_constraint("fk_vouchers_order_id", "vouchers", type_="foreignkey")
    op.drop_column("vouchers", "order_id")

    op.drop_index("ix_export_cases_order_id", table_name="export_cases")
    op.drop_constraint("fk_export_cases_order_id", "export_cases", type_="foreignkey")
    op.drop_column("export_cases", "order_id")

    for table, fk in [
        ("line_crew_sheet_headers", "fk_line_crew_sheet_headers_order_id"),
        ("production_qc_checks", "fk_production_qc_checks_order_id"),
        ("dye_recipes", "fk_dye_recipes_order_id"),
        ("production_cost_inputs", "fk_production_cost_inputs_order_id"),
        ("cut_tickets", "fk_cut_tickets_order_id"),
        ("lay_plans", "fk_lay_plans_order_id"),
        ("line_balance_runs", "fk_line_balance_runs_order_id"),
        ("operation_bulletins", "fk_operation_bulletins_order_id"),
        ("unit_crew_daily", "fk_unit_crew_daily_order_id"),
        ("line_crew_daily", "fk_line_crew_daily_order_id"),
        ("mfg_tna_plan_tasks", "fk_mfg_tna_plan_tasks_order_id"),
        ("mfg_capas", "fk_mfg_capas_order_id"),
        ("mfg_ncrs", "fk_mfg_ncrs_order_id"),
        ("mfg_downtime_events", "fk_mfg_downtime_events_order_id"),
        ("mfg_operation_assignments", "fk_mfg_operation_assignments_order_id"),
        ("mfg_mrp_recommendations", "fk_mfg_mrp_recommendations_order_id"),
        ("mfg_cost_snapshots", "fk_mfg_cost_snapshots_order_id"),
        ("mfg_quality_checks", "fk_mfg_quality_checks_order_id"),
        ("mfg_material_returns", "fk_mfg_material_returns_order_id"),
        ("mfg_material_issues", "fk_mfg_material_issues_order_id"),
        ("mfg_work_order_operations", "fk_mfg_work_order_operations_order_id"),
        ("mfg_work_orders", "fk_mfg_work_orders_order_id"),
        ("mfg_production_plans", "fk_mfg_production_plans_order_id"),
    ]:
        op.drop_index(f"ix_{table}_order_id", table_name=table)
        op.drop_constraint(fk, table, type_="foreignkey")
        op.drop_column(table, "order_id")

    op.drop_column("orders", "rm_received_pct")
    for col in (
        "completed_at",
        "payment_received_at",
        "shipped_at",
        "production_started_at",
        "rm_received_at",
        "po_issued_at",
        "bom_created_at",
        "lc_received_at",
        "pi_issued_at",
    ):
        op.drop_column("orders", col)
    op.drop_index("ix_orders_master_contract_id", table_name="orders")
    op.drop_constraint("fk_orders_master_contract_id", "orders", type_="foreignkey")
    op.drop_column("orders", "master_contract_id")
    op.drop_index("ix_orders_order_type", table_name="orders")
    op.drop_column("orders", "order_type")
    op.drop_column("orders", "pipeline_na_steps")
    op.drop_index("ix_orders_pipeline_status", table_name="orders")
    op.drop_column("orders", "pipeline_status")
