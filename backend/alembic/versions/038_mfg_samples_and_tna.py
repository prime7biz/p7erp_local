"""Add manufacturing samples and TNA tables

Revision ID: 038
Revises: 037
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "038"
down_revision: Union[str, None] = "037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfg_sample_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sample_no", sa.String(length=32), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("sample_type", sa.String(length=32), nullable=False, server_default="fit"),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("requested_date", sa.Date(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("assigned_user_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "sample_no", name="uq_mfg_sample_requests_tenant_sample_no"),
    )
    op.create_index("ix_mfg_sample_requests_tenant_id", "mfg_sample_requests", ["tenant_id"])
    op.create_index("ix_mfg_sample_requests_sample_no", "mfg_sample_requests", ["sample_no"])
    op.create_index("ix_mfg_sample_requests_order_id", "mfg_sample_requests", ["order_id"])
    op.create_index("ix_mfg_sample_requests_item_id", "mfg_sample_requests", ["item_id"])
    op.create_index("ix_mfg_sample_requests_status", "mfg_sample_requests", ["status"])
    op.create_index("ix_mfg_sample_requests_target_date", "mfg_sample_requests", ["target_date"])

    op.create_table(
        "mfg_tna_templates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("template_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("applies_to", sa.String(length=32), nullable=False, server_default="order"),
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "template_code", "version_no", name="uq_mfg_tna_templates_tenant_code_ver"),
    )
    op.create_index("ix_mfg_tna_templates_tenant_id", "mfg_tna_templates", ["tenant_id"])
    op.create_index("ix_mfg_tna_templates_template_code", "mfg_tna_templates", ["template_code"])

    op.create_table(
        "mfg_tna_template_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("seq_no", sa.Integer(), nullable=False),
        sa.Column("task_code", sa.String(length=32), nullable=True),
        sa.Column("task_name", sa.String(length=128), nullable=False),
        sa.Column("department", sa.String(length=64), nullable=True),
        sa.Column("offset_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_days", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("depends_on_seq", sa.Integer(), nullable=True),
        sa.Column("owner_role", sa.String(length=32), nullable=True),
        sa.Column("is_milestone", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["mfg_tna_templates.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "template_id", "seq_no", name="uq_mfg_tna_template_tasks_tenant_tpl_seq"),
    )
    op.create_index("ix_mfg_tna_template_tasks_tenant_id", "mfg_tna_template_tasks", ["tenant_id"])
    op.create_index("ix_mfg_tna_template_tasks_template_id", "mfg_tna_template_tasks", ["template_id"])

    op.create_table(
        "mfg_tna_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("plan_code", sa.String(length=32), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("target_end_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["mfg_tna_templates.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "plan_code", name="uq_mfg_tna_plans_tenant_plan_code"),
    )
    op.create_index("ix_mfg_tna_plans_tenant_id", "mfg_tna_plans", ["tenant_id"])
    op.create_index("ix_mfg_tna_plans_plan_code", "mfg_tna_plans", ["plan_code"])
    op.create_index("ix_mfg_tna_plans_template_id", "mfg_tna_plans", ["template_id"])
    op.create_index("ix_mfg_tna_plans_order_id", "mfg_tna_plans", ["order_id"])
    op.create_index("ix_mfg_tna_plans_item_id", "mfg_tna_plans", ["item_id"])
    op.create_index("ix_mfg_tna_plans_status", "mfg_tna_plans", ["status"])

    op.create_table(
        "mfg_tna_plan_tasks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("template_task_id", sa.Integer(), nullable=True),
        sa.Column("seq_no", sa.Integer(), nullable=False),
        sa.Column("task_name", sa.String(length=128), nullable=False),
        sa.Column("department", sa.String(length=64), nullable=True),
        sa.Column("planned_date", sa.Date(), nullable=False),
        sa.Column("actual_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="not_started"),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["mfg_tna_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_task_id"], ["mfg_tna_template_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "plan_id", "seq_no", name="uq_mfg_tna_plan_tasks_tenant_plan_seq"),
    )
    op.create_index("ix_mfg_tna_plan_tasks_tenant_id", "mfg_tna_plan_tasks", ["tenant_id"])
    op.create_index("ix_mfg_tna_plan_tasks_plan_id", "mfg_tna_plan_tasks", ["plan_id"])
    op.create_index("ix_mfg_tna_plan_tasks_template_task_id", "mfg_tna_plan_tasks", ["template_task_id"])
    op.create_index("ix_mfg_tna_plan_tasks_planned_date", "mfg_tna_plan_tasks", ["planned_date"])
    op.create_index("ix_mfg_tna_plan_tasks_status", "mfg_tna_plan_tasks", ["status"])
    op.create_index("ix_mfg_tna_plan_tasks_owner_user_id", "mfg_tna_plan_tasks", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_mfg_tna_plan_tasks_owner_user_id", table_name="mfg_tna_plan_tasks")
    op.drop_index("ix_mfg_tna_plan_tasks_status", table_name="mfg_tna_plan_tasks")
    op.drop_index("ix_mfg_tna_plan_tasks_planned_date", table_name="mfg_tna_plan_tasks")
    op.drop_index("ix_mfg_tna_plan_tasks_template_task_id", table_name="mfg_tna_plan_tasks")
    op.drop_index("ix_mfg_tna_plan_tasks_plan_id", table_name="mfg_tna_plan_tasks")
    op.drop_index("ix_mfg_tna_plan_tasks_tenant_id", table_name="mfg_tna_plan_tasks")
    op.drop_table("mfg_tna_plan_tasks")

    op.drop_index("ix_mfg_tna_plans_status", table_name="mfg_tna_plans")
    op.drop_index("ix_mfg_tna_plans_item_id", table_name="mfg_tna_plans")
    op.drop_index("ix_mfg_tna_plans_order_id", table_name="mfg_tna_plans")
    op.drop_index("ix_mfg_tna_plans_template_id", table_name="mfg_tna_plans")
    op.drop_index("ix_mfg_tna_plans_plan_code", table_name="mfg_tna_plans")
    op.drop_index("ix_mfg_tna_plans_tenant_id", table_name="mfg_tna_plans")
    op.drop_table("mfg_tna_plans")

    op.drop_index("ix_mfg_tna_template_tasks_template_id", table_name="mfg_tna_template_tasks")
    op.drop_index("ix_mfg_tna_template_tasks_tenant_id", table_name="mfg_tna_template_tasks")
    op.drop_table("mfg_tna_template_tasks")

    op.drop_index("ix_mfg_tna_templates_template_code", table_name="mfg_tna_templates")
    op.drop_index("ix_mfg_tna_templates_tenant_id", table_name="mfg_tna_templates")
    op.drop_table("mfg_tna_templates")

    op.drop_index("ix_mfg_sample_requests_target_date", table_name="mfg_sample_requests")
    op.drop_index("ix_mfg_sample_requests_status", table_name="mfg_sample_requests")
    op.drop_index("ix_mfg_sample_requests_item_id", table_name="mfg_sample_requests")
    op.drop_index("ix_mfg_sample_requests_order_id", table_name="mfg_sample_requests")
    op.drop_index("ix_mfg_sample_requests_sample_no", table_name="mfg_sample_requests")
    op.drop_index("ix_mfg_sample_requests_tenant_id", table_name="mfg_sample_requests")
    op.drop_table("mfg_sample_requests")
