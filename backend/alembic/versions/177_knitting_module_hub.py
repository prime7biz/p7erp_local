"""Knitting module: charge rates, work orders, process order knitting finance links."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "177"
down_revision = "176"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knitting_charge_rates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("fabric_type_code", sa.String(length=128), nullable=False),
        sa.Column("unit_basis", sa.String(length=32), nullable=False),
        sa.Column("rate_per_unit", sa.Numeric(precision=18, scale=4), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="BDT"),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_knitting_charge_rates_tenant_id"), "knitting_charge_rates", ["tenant_id"])
    op.create_index(op.f("ix_knitting_charge_rates_fabric_type_code"), "knitting_charge_rates", ["fabric_type_code"])
    op.create_index(op.f("ix_knitting_charge_rates_effective_from"), "knitting_charge_rates", ["effective_from"])
    op.create_index(op.f("ix_knitting_charge_rates_effective_to"), "knitting_charge_rates", ["effective_to"])

    op.create_table(
        "knitting_work_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("wo_number", sa.String(length=32), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="in_house"),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("machine_id", sa.Integer(), nullable=True),
        sa.Column("yarn_item_id", sa.Integer(), nullable=False),
        sa.Column("greige_item_id", sa.Integer(), nullable=False),
        sa.Column("fabric_type_code", sa.String(length=128), nullable=True),
        sa.Column("gauge", sa.String(length=64), nullable=True),
        sa.Column("planned_yarn_qty", sa.String(length=32), nullable=True),
        sa.Column("planned_greige_qty", sa.String(length=32), nullable=True),
        sa.Column("processing_charge_preview", sa.String(length=32), nullable=True),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("output_warehouse_id", sa.Integer(), nullable=True),
        sa.Column("knitting_plan_id", sa.Integer(), nullable=True),
        sa.Column("linked_order_id", sa.Integer(), nullable=True),
        sa.Column("process_order_id", sa.Integer(), nullable=True),
        sa.Column("delivery_challan_id", sa.Integer(), nullable=True),
        sa.Column("gate_pass_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["delivery_challan_id"], ["delivery_challans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["machine_id"], ["department_machines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["yarn_item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["greige_item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["output_warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["knitting_plan_id"], ["knitting_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["process_order_id"], ["process_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["gate_pass_id"], ["enhanced_gate_passes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "wo_number", name="uq_knitting_work_orders_tenant_wo"),
    )
    op.create_index(op.f("ix_knitting_work_orders_tenant_id"), "knitting_work_orders", ["tenant_id"])
    op.create_index(op.f("ix_knitting_work_orders_wo_number"), "knitting_work_orders", ["wo_number"])
    op.create_index(op.f("ix_knitting_work_orders_status"), "knitting_work_orders", ["status"])

    op.add_column("process_orders", sa.Column("customer_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_process_orders_customer_id_customers"),
        "process_orders",
        "customers",
        ["customer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_process_orders_customer_id"), "process_orders", ["customer_id"])

    op.add_column("process_orders", sa.Column("knitting_service_voucher_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_process_orders_knitting_service_voucher_id_vouchers"),
        "process_orders",
        "vouchers",
        ["knitting_service_voucher_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_process_orders_knitting_service_voucher_id"), "process_orders", ["knitting_service_voucher_id"]
    )

    op.alter_column(
        "process_orders",
        "process_method",
        existing_type=sa.String(length=16),
        type_=sa.String(length=24),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "process_orders",
        "process_method",
        existing_type=sa.String(length=24),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
    op.drop_index(op.f("ix_process_orders_knitting_service_voucher_id"), table_name="process_orders")
    op.drop_constraint(op.f("fk_process_orders_knitting_service_voucher_id_vouchers"), "process_orders", type_="foreignkey")
    op.drop_column("process_orders", "knitting_service_voucher_id")

    op.drop_index(op.f("ix_process_orders_customer_id"), table_name="process_orders")
    op.drop_constraint(op.f("fk_process_orders_customer_id_customers"), "process_orders", type_="foreignkey")
    op.drop_column("process_orders", "customer_id")

    op.drop_index(op.f("ix_knitting_work_orders_status"), table_name="knitting_work_orders")
    op.drop_index(op.f("ix_knitting_work_orders_wo_number"), table_name="knitting_work_orders")
    op.drop_index(op.f("ix_knitting_work_orders_tenant_id"), table_name="knitting_work_orders")
    op.drop_table("knitting_work_orders")

    op.drop_index(op.f("ix_knitting_charge_rates_effective_to"), table_name="knitting_charge_rates")
    op.drop_index(op.f("ix_knitting_charge_rates_effective_from"), table_name="knitting_charge_rates")
    op.drop_index(op.f("ix_knitting_charge_rates_fabric_type_code"), table_name="knitting_charge_rates")
    op.drop_index(op.f("ix_knitting_charge_rates_tenant_id"), table_name="knitting_charge_rates")
    op.drop_table("knitting_charge_rates")
