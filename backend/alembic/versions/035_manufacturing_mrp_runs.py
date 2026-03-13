"""Add manufacturing MRP run tables

Revision ID: 035
Revises: 034
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfg_mrp_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("run_code", sa.String(length=32), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=True),
        sa.Column("horizon_start", sa.Date(), nullable=False),
        sa.Column("horizon_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="completed"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["mfg_production_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "run_code", name="uq_mfg_mrp_runs_tenant_code"),
    )
    op.create_index("ix_mfg_mrp_runs_tenant_id", "mfg_mrp_runs", ["tenant_id"])
    op.create_index("ix_mfg_mrp_runs_run_code", "mfg_mrp_runs", ["run_code"])
    op.create_index("ix_mfg_mrp_runs_plan_id", "mfg_mrp_runs", ["plan_id"])
    op.create_index("ix_mfg_mrp_runs_status", "mfg_mrp_runs", ["status"])
    op.create_index("ix_mfg_mrp_runs_created_by_user_id", "mfg_mrp_runs", ["created_by_user_id"])

    op.create_table(
        "mfg_mrp_recommendations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("recommendation_type", sa.String(length=32), nullable=False, server_default="manufacture"),
        sa.Column("suggested_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["run_id"], ["mfg_mrp_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_mfg_mrp_recommendations_tenant_id", "mfg_mrp_recommendations", ["tenant_id"])
    op.create_index("ix_mfg_mrp_recommendations_run_id", "mfg_mrp_recommendations", ["run_id"])
    op.create_index("ix_mfg_mrp_recommendations_item_id", "mfg_mrp_recommendations", ["item_id"])
    op.create_index(
        "ix_mfg_mrp_recommendations_recommendation_type",
        "mfg_mrp_recommendations",
        ["recommendation_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_mfg_mrp_recommendations_recommendation_type", table_name="mfg_mrp_recommendations")
    op.drop_index("ix_mfg_mrp_recommendations_item_id", table_name="mfg_mrp_recommendations")
    op.drop_index("ix_mfg_mrp_recommendations_run_id", table_name="mfg_mrp_recommendations")
    op.drop_index("ix_mfg_mrp_recommendations_tenant_id", table_name="mfg_mrp_recommendations")
    op.drop_table("mfg_mrp_recommendations")

    op.drop_index("ix_mfg_mrp_runs_created_by_user_id", table_name="mfg_mrp_runs")
    op.drop_index("ix_mfg_mrp_runs_status", table_name="mfg_mrp_runs")
    op.drop_index("ix_mfg_mrp_runs_plan_id", table_name="mfg_mrp_runs")
    op.drop_index("ix_mfg_mrp_runs_run_code", table_name="mfg_mrp_runs")
    op.drop_index("ix_mfg_mrp_runs_tenant_id", table_name="mfg_mrp_runs")
    op.drop_table("mfg_mrp_runs")
