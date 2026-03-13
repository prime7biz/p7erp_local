"""Add advanced manufacturing foundation tables

Revision ID: 034
Revises: 033
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfg_work_centers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("capacity_minutes_per_day", sa.Integer(), nullable=False, server_default="480"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_mfg_work_centers_tenant_code"),
    )
    op.create_index("ix_mfg_work_centers_tenant_id", "mfg_work_centers", ["tenant_id"])
    op.create_index("ix_mfg_work_centers_code", "mfg_work_centers", ["code"])

    op.create_table(
        "mfg_operations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("default_work_center_id", sa.Integer(), nullable=True),
        sa.Column("std_cycle_minutes", sa.Numeric(12, 2), nullable=True),
        sa.Column("std_setup_minutes", sa.Numeric(12, 2), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["default_work_center_id"], ["mfg_work_centers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_mfg_operations_tenant_code"),
    )
    op.create_index("ix_mfg_operations_tenant_id", "mfg_operations", ["tenant_id"])
    op.create_index("ix_mfg_operations_code", "mfg_operations", ["code"])
    op.create_index("ix_mfg_operations_default_work_center_id", "mfg_operations", ["default_work_center_id"])

    op.create_table(
        "mfg_routing_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("routing_code", sa.String(length=32), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("tenant_id", "routing_code", "version_no", name="uq_mfg_routing_tenant_code_version"),
    )
    op.create_index("ix_mfg_routing_templates_tenant_id", "mfg_routing_templates", ["tenant_id"])
    op.create_index("ix_mfg_routing_templates_routing_code", "mfg_routing_templates", ["routing_code"])
    op.create_index("ix_mfg_routing_templates_item_id", "mfg_routing_templates", ["item_id"])

    op.create_table(
        "mfg_routing_steps",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("routing_id", sa.Integer(), nullable=False),
        sa.Column("step_no", sa.Integer(), nullable=False),
        sa.Column("operation_id", sa.Integer(), nullable=False),
        sa.Column("work_center_id", sa.Integer(), nullable=True),
        sa.Column("std_minutes", sa.Numeric(12, 2), nullable=True),
        sa.Column("qc_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["routing_id"], ["mfg_routing_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operation_id"], ["mfg_operations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_center_id"], ["mfg_work_centers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "routing_id", "step_no", name="uq_mfg_routing_steps_tenant_routing_step"),
    )
    op.create_index("ix_mfg_routing_steps_tenant_id", "mfg_routing_steps", ["tenant_id"])
    op.create_index("ix_mfg_routing_steps_routing_id", "mfg_routing_steps", ["routing_id"])
    op.create_index("ix_mfg_routing_steps_operation_id", "mfg_routing_steps", ["operation_id"])
    op.create_index("ix_mfg_routing_steps_work_center_id", "mfg_routing_steps", ["work_center_id"])

    op.create_table(
        "mfg_production_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("plan_code", sa.String(length=32), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "plan_code", name="uq_mfg_plans_tenant_code"),
    )
    op.create_index("ix_mfg_production_plans_tenant_id", "mfg_production_plans", ["tenant_id"])
    op.create_index("ix_mfg_production_plans_plan_code", "mfg_production_plans", ["plan_code"])
    op.create_index("ix_mfg_production_plans_status", "mfg_production_plans", ["status"])
    op.create_index("ix_mfg_production_plans_created_by_user_id", "mfg_production_plans", ["created_by_user_id"])

    op.create_table(
        "mfg_production_plan_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("routing_id", sa.Integer(), nullable=True),
        sa.Column("planned_qty", sa.Numeric(18, 3), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["mfg_production_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["routing_id"], ["mfg_routing_templates.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_production_plan_lines_tenant_id", "mfg_production_plan_lines", ["tenant_id"])
    op.create_index("ix_mfg_production_plan_lines_plan_id", "mfg_production_plan_lines", ["plan_id"])
    op.create_index("ix_mfg_production_plan_lines_item_id", "mfg_production_plan_lines", ["item_id"])
    op.create_index("ix_mfg_production_plan_lines_order_id", "mfg_production_plan_lines", ["order_id"])
    op.create_index("ix_mfg_production_plan_lines_routing_id", "mfg_production_plan_lines", ["routing_id"])

    op.create_table(
        "mfg_work_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("mo_number", sa.String(length=32), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("plan_line_id", sa.Integer(), nullable=True),
        sa.Column("routing_id", sa.Integer(), nullable=True),
        sa.Column("qty_planned", sa.Numeric(18, 3), nullable=False),
        sa.Column("qty_completed", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["plan_line_id"], ["mfg_production_plan_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["routing_id"], ["mfg_routing_templates.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "mo_number", name="uq_mfg_work_orders_tenant_mo"),
    )
    op.create_index("ix_mfg_work_orders_tenant_id", "mfg_work_orders", ["tenant_id"])
    op.create_index("ix_mfg_work_orders_mo_number", "mfg_work_orders", ["mo_number"])
    op.create_index("ix_mfg_work_orders_item_id", "mfg_work_orders", ["item_id"])
    op.create_index("ix_mfg_work_orders_plan_line_id", "mfg_work_orders", ["plan_line_id"])
    op.create_index("ix_mfg_work_orders_routing_id", "mfg_work_orders", ["routing_id"])
    op.create_index("ix_mfg_work_orders_status", "mfg_work_orders", ["status"])

    op.create_table(
        "mfg_work_order_operations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("step_no", sa.Integer(), nullable=False),
        sa.Column("operation_id", sa.Integer(), nullable=False),
        sa.Column("work_center_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("start_at", sa.DateTime(), nullable=True),
        sa.Column("end_at", sa.DateTime(), nullable=True),
        sa.Column("qty_in", sa.Numeric(18, 3), nullable=True),
        sa.Column("qty_out", sa.Numeric(18, 3), nullable=True),
        sa.Column("scrap_qty", sa.Numeric(18, 3), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["mfg_work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operation_id"], ["mfg_operations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_center_id"], ["mfg_work_centers.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "work_order_id", "step_no", name="uq_mfg_wo_ops_tenant_wo_step"),
    )
    op.create_index("ix_mfg_work_order_operations_tenant_id", "mfg_work_order_operations", ["tenant_id"])
    op.create_index("ix_mfg_work_order_operations_work_order_id", "mfg_work_order_operations", ["work_order_id"])
    op.create_index("ix_mfg_work_order_operations_operation_id", "mfg_work_order_operations", ["operation_id"])
    op.create_index("ix_mfg_work_order_operations_work_center_id", "mfg_work_order_operations", ["work_center_id"])
    op.create_index("ix_mfg_work_order_operations_status", "mfg_work_order_operations", ["status"])

    op.create_table(
        "mfg_material_issues",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("work_order_operation_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("qty_issued", sa.Numeric(18, 3), nullable=False),
        sa.Column("stock_movement_id", sa.Integer(), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["mfg_work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_operation_id"], ["mfg_work_order_operations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stock_movement_id"], ["stock_movements.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_material_issues_tenant_id", "mfg_material_issues", ["tenant_id"])
    op.create_index("ix_mfg_material_issues_work_order_id", "mfg_material_issues", ["work_order_id"])
    op.create_index("ix_mfg_material_issues_work_order_operation_id", "mfg_material_issues", ["work_order_operation_id"])
    op.create_index("ix_mfg_material_issues_item_id", "mfg_material_issues", ["item_id"])
    op.create_index("ix_mfg_material_issues_warehouse_id", "mfg_material_issues", ["warehouse_id"])
    op.create_index("ix_mfg_material_issues_stock_movement_id", "mfg_material_issues", ["stock_movement_id"])

    op.create_table(
        "mfg_material_returns",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("issue_id", sa.Integer(), nullable=False),
        sa.Column("qty_returned", sa.Numeric(18, 3), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("stock_movement_id", sa.Integer(), nullable=True),
        sa.Column("returned_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["issue_id"], ["mfg_material_issues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stock_movement_id"], ["stock_movements.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_material_returns_tenant_id", "mfg_material_returns", ["tenant_id"])
    op.create_index("ix_mfg_material_returns_issue_id", "mfg_material_returns", ["issue_id"])
    op.create_index("ix_mfg_material_returns_warehouse_id", "mfg_material_returns", ["warehouse_id"])
    op.create_index("ix_mfg_material_returns_stock_movement_id", "mfg_material_returns", ["stock_movement_id"])

    op.create_table(
        "mfg_quality_checks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("work_order_operation_id", sa.Integer(), nullable=True),
        sa.Column("check_type", sa.String(length=64), nullable=False, server_default="in_process"),
        sa.Column("result", sa.String(length=16), nullable=False, server_default="pass"),
        sa.Column("defect_code", sa.String(length=32), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("checked_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["mfg_work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_operation_id"], ["mfg_work_order_operations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["checked_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_quality_checks_tenant_id", "mfg_quality_checks", ["tenant_id"])
    op.create_index("ix_mfg_quality_checks_work_order_id", "mfg_quality_checks", ["work_order_id"])
    op.create_index("ix_mfg_quality_checks_work_order_operation_id", "mfg_quality_checks", ["work_order_operation_id"])
    op.create_index("ix_mfg_quality_checks_result", "mfg_quality_checks", ["result"])
    op.create_index("ix_mfg_quality_checks_checked_by_user_id", "mfg_quality_checks", ["checked_by_user_id"])

    op.create_table(
        "mfg_cost_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("material_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("labor_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("overhead_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total_cost", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("variance_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("snapshot_note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["mfg_work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_cost_snapshots_tenant_id", "mfg_cost_snapshots", ["tenant_id"])
    op.create_index("ix_mfg_cost_snapshots_work_order_id", "mfg_cost_snapshots", ["work_order_id"])
    op.create_index("ix_mfg_cost_snapshots_created_by_user_id", "mfg_cost_snapshots", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_mfg_cost_snapshots_created_by_user_id", table_name="mfg_cost_snapshots")
    op.drop_index("ix_mfg_cost_snapshots_work_order_id", table_name="mfg_cost_snapshots")
    op.drop_index("ix_mfg_cost_snapshots_tenant_id", table_name="mfg_cost_snapshots")
    op.drop_table("mfg_cost_snapshots")

    op.drop_index("ix_mfg_quality_checks_checked_by_user_id", table_name="mfg_quality_checks")
    op.drop_index("ix_mfg_quality_checks_result", table_name="mfg_quality_checks")
    op.drop_index("ix_mfg_quality_checks_work_order_operation_id", table_name="mfg_quality_checks")
    op.drop_index("ix_mfg_quality_checks_work_order_id", table_name="mfg_quality_checks")
    op.drop_index("ix_mfg_quality_checks_tenant_id", table_name="mfg_quality_checks")
    op.drop_table("mfg_quality_checks")

    op.drop_index("ix_mfg_material_returns_stock_movement_id", table_name="mfg_material_returns")
    op.drop_index("ix_mfg_material_returns_warehouse_id", table_name="mfg_material_returns")
    op.drop_index("ix_mfg_material_returns_issue_id", table_name="mfg_material_returns")
    op.drop_index("ix_mfg_material_returns_tenant_id", table_name="mfg_material_returns")
    op.drop_table("mfg_material_returns")

    op.drop_index("ix_mfg_material_issues_stock_movement_id", table_name="mfg_material_issues")
    op.drop_index("ix_mfg_material_issues_warehouse_id", table_name="mfg_material_issues")
    op.drop_index("ix_mfg_material_issues_item_id", table_name="mfg_material_issues")
    op.drop_index("ix_mfg_material_issues_work_order_operation_id", table_name="mfg_material_issues")
    op.drop_index("ix_mfg_material_issues_work_order_id", table_name="mfg_material_issues")
    op.drop_index("ix_mfg_material_issues_tenant_id", table_name="mfg_material_issues")
    op.drop_table("mfg_material_issues")

    op.drop_index("ix_mfg_work_order_operations_status", table_name="mfg_work_order_operations")
    op.drop_index("ix_mfg_work_order_operations_work_center_id", table_name="mfg_work_order_operations")
    op.drop_index("ix_mfg_work_order_operations_operation_id", table_name="mfg_work_order_operations")
    op.drop_index("ix_mfg_work_order_operations_work_order_id", table_name="mfg_work_order_operations")
    op.drop_index("ix_mfg_work_order_operations_tenant_id", table_name="mfg_work_order_operations")
    op.drop_table("mfg_work_order_operations")

    op.drop_index("ix_mfg_work_orders_status", table_name="mfg_work_orders")
    op.drop_index("ix_mfg_work_orders_routing_id", table_name="mfg_work_orders")
    op.drop_index("ix_mfg_work_orders_plan_line_id", table_name="mfg_work_orders")
    op.drop_index("ix_mfg_work_orders_item_id", table_name="mfg_work_orders")
    op.drop_index("ix_mfg_work_orders_mo_number", table_name="mfg_work_orders")
    op.drop_index("ix_mfg_work_orders_tenant_id", table_name="mfg_work_orders")
    op.drop_table("mfg_work_orders")

    op.drop_index("ix_mfg_production_plan_lines_routing_id", table_name="mfg_production_plan_lines")
    op.drop_index("ix_mfg_production_plan_lines_order_id", table_name="mfg_production_plan_lines")
    op.drop_index("ix_mfg_production_plan_lines_item_id", table_name="mfg_production_plan_lines")
    op.drop_index("ix_mfg_production_plan_lines_plan_id", table_name="mfg_production_plan_lines")
    op.drop_index("ix_mfg_production_plan_lines_tenant_id", table_name="mfg_production_plan_lines")
    op.drop_table("mfg_production_plan_lines")

    op.drop_index("ix_mfg_production_plans_created_by_user_id", table_name="mfg_production_plans")
    op.drop_index("ix_mfg_production_plans_status", table_name="mfg_production_plans")
    op.drop_index("ix_mfg_production_plans_plan_code", table_name="mfg_production_plans")
    op.drop_index("ix_mfg_production_plans_tenant_id", table_name="mfg_production_plans")
    op.drop_table("mfg_production_plans")

    op.drop_index("ix_mfg_routing_steps_work_center_id", table_name="mfg_routing_steps")
    op.drop_index("ix_mfg_routing_steps_operation_id", table_name="mfg_routing_steps")
    op.drop_index("ix_mfg_routing_steps_routing_id", table_name="mfg_routing_steps")
    op.drop_index("ix_mfg_routing_steps_tenant_id", table_name="mfg_routing_steps")
    op.drop_table("mfg_routing_steps")

    op.drop_index("ix_mfg_routing_templates_item_id", table_name="mfg_routing_templates")
    op.drop_index("ix_mfg_routing_templates_routing_code", table_name="mfg_routing_templates")
    op.drop_index("ix_mfg_routing_templates_tenant_id", table_name="mfg_routing_templates")
    op.drop_table("mfg_routing_templates")

    op.drop_index("ix_mfg_operations_default_work_center_id", table_name="mfg_operations")
    op.drop_index("ix_mfg_operations_code", table_name="mfg_operations")
    op.drop_index("ix_mfg_operations_tenant_id", table_name="mfg_operations")
    op.drop_table("mfg_operations")

    op.drop_index("ix_mfg_work_centers_code", table_name="mfg_work_centers")
    op.drop_index("ix_mfg_work_centers_tenant_id", table_name="mfg_work_centers")
    op.drop_table("mfg_work_centers")
