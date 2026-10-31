"""Create inter_department_transfers tables (Sprint I1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "215"
down_revision: Union[str, None] = "214"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inter_department_transfers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("idt_number", sa.String(length=32), nullable=False),
        sa.Column("idt_date", sa.Date(), nullable=False),
        sa.Column("from_warehouse_id", sa.Integer(), nullable=False),
        sa.Column("to_warehouse_id", sa.Integer(), nullable=False),
        sa.Column("process_name", sa.String(length=64), nullable=False),
        sa.Column("source_item_id", sa.Integer(), nullable=False),
        sa.Column("source_qty_issued", sa.Numeric(15, 4), nullable=False),
        sa.Column("source_qty_unit", sa.String(length=16), nullable=False),
        sa.Column("source_batch_id", sa.Integer(), nullable=True),
        sa.Column("target_item_id", sa.Integer(), nullable=False),
        sa.Column("target_qty_expected", sa.Numeric(15, 4), nullable=False),
        sa.Column("target_qty_received", sa.Numeric(15, 4), nullable=True),
        sa.Column("target_qty_unit", sa.String(length=16), nullable=False),
        sa.Column("process_loss_qty", sa.Numeric(15, 4), nullable=True),
        sa.Column("process_loss_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("standard_process_loss_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("loss_exception", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_job_work", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("job_work_vendor_id", sa.Integer(), nullable=True),
        sa.Column("job_work_cost_per_unit", sa.Numeric(15, 4), nullable=True),
        sa.Column("job_work_total_cost", sa.Numeric(15, 2), nullable=True),
        sa.Column("transport_cost", sa.Numeric(15, 4), nullable=False, server_default="0"),
        sa.Column("other_charges", sa.Numeric(15, 4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="ISSUED"),
        sa.Column("source_item_cost", sa.Numeric(15, 4), nullable=True),
        sa.Column("target_item_value", sa.Numeric(15, 4), nullable=True),
        sa.Column("source_voucher_id", sa.Integer(), nullable=True),
        sa.Column("target_voucher_id", sa.Integer(), nullable=True),
        sa.Column("linked_order_id", sa.Integer(), nullable=True),
        sa.Column("narration", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["to_warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_batch_id"], ["stock_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["job_work_vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "idt_number", name="uq_idt_tenant_number"),
    )
    op.create_index("ix_inter_department_transfers_tenant_id", "inter_department_transfers", ["tenant_id"])
    op.create_index("ix_inter_department_transfers_idt_number", "inter_department_transfers", ["idt_number"])
    op.create_index("ix_inter_department_transfers_status", "inter_department_transfers", ["status"])
    op.create_index("ix_inter_department_transfers_process_name", "inter_department_transfers", ["process_name"])
    op.create_index("ix_inter_department_transfers_linked_order_id", "inter_department_transfers", ["linked_order_id"])

    op.create_table(
        "inter_department_transfer_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("idt_id", sa.Integer(), nullable=False),
        sa.Column("source_item_id", sa.Integer(), nullable=False),
        sa.Column("source_qty", sa.Numeric(15, 4), nullable=False),
        sa.Column("source_batch_id", sa.Integer(), nullable=True),
        sa.Column("source_unit_cost", sa.Numeric(15, 4), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["idt_id"], ["inter_department_transfers.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["source_item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["source_batch_id"], ["stock_batches.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_idt_lines_idt_id", "inter_department_transfer_lines", ["idt_id"])


def downgrade() -> None:
    op.drop_table("inter_department_transfer_lines")
    op.drop_table("inter_department_transfers")
