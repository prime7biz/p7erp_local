"""Add manufacturing shopfloor assignment downtime and NCR CAPA

Revision ID: 036
Revises: 035
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfg_operation_assignments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("work_order_operation_id", sa.Integer(), nullable=False),
        sa.Column("assigned_user_id", sa.Integer(), nullable=False),
        sa.Column("role_type", sa.String(length=32), nullable=False, server_default="operator"),
        sa.Column("assigned_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_operation_id"], ["mfg_work_order_operations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_mfg_operation_assignments_tenant_id", "mfg_operation_assignments", ["tenant_id"])
    op.create_index(
        "ix_mfg_operation_assignments_work_order_operation_id",
        "mfg_operation_assignments",
        ["work_order_operation_id"],
    )
    op.create_index("ix_mfg_operation_assignments_assigned_user_id", "mfg_operation_assignments", ["assigned_user_id"])

    op.create_table(
        "mfg_downtime_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("work_order_operation_id", sa.Integer(), nullable=False),
        sa.Column("reason_code", sa.String(length=32), nullable=False),
        sa.Column("reason_note", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_minutes", sa.Numeric(12, 2), nullable=True),
        sa.Column("recorded_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_operation_id"], ["mfg_work_order_operations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_downtime_events_tenant_id", "mfg_downtime_events", ["tenant_id"])
    op.create_index("ix_mfg_downtime_events_work_order_operation_id", "mfg_downtime_events", ["work_order_operation_id"])
    op.create_index("ix_mfg_downtime_events_reason_code", "mfg_downtime_events", ["reason_code"])
    op.create_index("ix_mfg_downtime_events_recorded_by_user_id", "mfg_downtime_events", ["recorded_by_user_id"])

    op.create_table(
        "mfg_ncrs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("ncr_code", sa.String(length=32), nullable=False),
        sa.Column("work_order_id", sa.Integer(), nullable=False),
        sa.Column("work_order_operation_id", sa.Integer(), nullable=True),
        sa.Column("defect_code", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="minor"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["mfg_work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_operation_id"], ["mfg_work_order_operations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "ncr_code", name="uq_mfg_ncrs_tenant_code"),
    )
    op.create_index("ix_mfg_ncrs_tenant_id", "mfg_ncrs", ["tenant_id"])
    op.create_index("ix_mfg_ncrs_ncr_code", "mfg_ncrs", ["ncr_code"])
    op.create_index("ix_mfg_ncrs_work_order_id", "mfg_ncrs", ["work_order_id"])
    op.create_index("ix_mfg_ncrs_work_order_operation_id", "mfg_ncrs", ["work_order_operation_id"])
    op.create_index("ix_mfg_ncrs_status", "mfg_ncrs", ["status"])

    op.create_table(
        "mfg_capas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("ncr_id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column("corrective_action", sa.Text(), nullable=False),
        sa.Column("preventive_action", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("closure_note", sa.Text(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ncr_id"], ["mfg_ncrs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_mfg_capas_tenant_id", "mfg_capas", ["tenant_id"])
    op.create_index("ix_mfg_capas_ncr_id", "mfg_capas", ["ncr_id"])
    op.create_index("ix_mfg_capas_owner_user_id", "mfg_capas", ["owner_user_id"])
    op.create_index("ix_mfg_capas_status", "mfg_capas", ["status"])


def downgrade() -> None:
    op.drop_index("ix_mfg_capas_status", table_name="mfg_capas")
    op.drop_index("ix_mfg_capas_owner_user_id", table_name="mfg_capas")
    op.drop_index("ix_mfg_capas_ncr_id", table_name="mfg_capas")
    op.drop_index("ix_mfg_capas_tenant_id", table_name="mfg_capas")
    op.drop_table("mfg_capas")

    op.drop_index("ix_mfg_ncrs_status", table_name="mfg_ncrs")
    op.drop_index("ix_mfg_ncrs_work_order_operation_id", table_name="mfg_ncrs")
    op.drop_index("ix_mfg_ncrs_work_order_id", table_name="mfg_ncrs")
    op.drop_index("ix_mfg_ncrs_ncr_code", table_name="mfg_ncrs")
    op.drop_index("ix_mfg_ncrs_tenant_id", table_name="mfg_ncrs")
    op.drop_table("mfg_ncrs")

    op.drop_index("ix_mfg_downtime_events_recorded_by_user_id", table_name="mfg_downtime_events")
    op.drop_index("ix_mfg_downtime_events_reason_code", table_name="mfg_downtime_events")
    op.drop_index("ix_mfg_downtime_events_work_order_operation_id", table_name="mfg_downtime_events")
    op.drop_index("ix_mfg_downtime_events_tenant_id", table_name="mfg_downtime_events")
    op.drop_table("mfg_downtime_events")

    op.drop_index("ix_mfg_operation_assignments_assigned_user_id", table_name="mfg_operation_assignments")
    op.drop_index("ix_mfg_operation_assignments_work_order_operation_id", table_name="mfg_operation_assignments")
    op.drop_index("ix_mfg_operation_assignments_tenant_id", table_name="mfg_operation_assignments")
    op.drop_table("mfg_operation_assignments")
