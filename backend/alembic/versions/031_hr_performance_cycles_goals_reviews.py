"""Add HR performance cycles, goals, and reviews

Revision ID: 031
Revises: 030
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_performance_cycles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "name", "start_date", name="uq_hr_perf_cycles_tenant_name_start"),
    )
    op.create_index("ix_hr_perf_cycles_tenant_id", "hr_performance_cycles", ["tenant_id"])
    op.create_index("ix_hr_perf_cycles_name", "hr_performance_cycles", ["name"])
    op.create_index("ix_hr_perf_cycles_status", "hr_performance_cycles", ["status"])
    op.create_index("ix_hr_perf_cycles_created_by_user_id", "hr_performance_cycles", ["created_by_user_id"])

    op.create_table(
        "hr_performance_goals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("cycle_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("weight", sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column("target_value", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("manager_comment", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cycle_id"], ["hr_performance_cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_perf_goals_tenant_id", "hr_performance_goals", ["tenant_id"])
    op.create_index("ix_hr_perf_goals_cycle_id", "hr_performance_goals", ["cycle_id"])
    op.create_index("ix_hr_perf_goals_employee_id", "hr_performance_goals", ["employee_id"])
    op.create_index("ix_hr_perf_goals_status", "hr_performance_goals", ["status"])
    op.create_index("ix_hr_perf_goals_created_by_user_id", "hr_performance_goals", ["created_by_user_id"])

    op.create_table(
        "hr_performance_reviews",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("cycle_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("reviewer_employee_id", sa.Integer(), nullable=True),
        sa.Column("reviewer_user_id", sa.Integer(), nullable=True),
        sa.Column("review_type", sa.String(length=32), nullable=False, server_default=sa.text("'manager'")),
        sa.Column("self_rating", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("manager_rating", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("final_rating", sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column("employee_comment", sa.Text(), nullable=True),
        sa.Column("manager_comment", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cycle_id"], ["hr_performance_cycles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint(
            "tenant_id",
            "cycle_id",
            "employee_id",
            "review_type",
            name="uq_hr_perf_reviews_cycle_employee_type",
        ),
    )
    op.create_index("ix_hr_perf_reviews_tenant_id", "hr_performance_reviews", ["tenant_id"])
    op.create_index("ix_hr_perf_reviews_cycle_id", "hr_performance_reviews", ["cycle_id"])
    op.create_index("ix_hr_perf_reviews_employee_id", "hr_performance_reviews", ["employee_id"])
    op.create_index("ix_hr_perf_reviews_reviewer_employee_id", "hr_performance_reviews", ["reviewer_employee_id"])
    op.create_index("ix_hr_perf_reviews_reviewer_user_id", "hr_performance_reviews", ["reviewer_user_id"])
    op.create_index("ix_hr_perf_reviews_status", "hr_performance_reviews", ["status"])


def downgrade() -> None:
    op.drop_index("ix_hr_perf_reviews_status", table_name="hr_performance_reviews")
    op.drop_index("ix_hr_perf_reviews_reviewer_user_id", table_name="hr_performance_reviews")
    op.drop_index("ix_hr_perf_reviews_reviewer_employee_id", table_name="hr_performance_reviews")
    op.drop_index("ix_hr_perf_reviews_employee_id", table_name="hr_performance_reviews")
    op.drop_index("ix_hr_perf_reviews_cycle_id", table_name="hr_performance_reviews")
    op.drop_index("ix_hr_perf_reviews_tenant_id", table_name="hr_performance_reviews")
    op.drop_table("hr_performance_reviews")

    op.drop_index("ix_hr_perf_goals_created_by_user_id", table_name="hr_performance_goals")
    op.drop_index("ix_hr_perf_goals_status", table_name="hr_performance_goals")
    op.drop_index("ix_hr_perf_goals_employee_id", table_name="hr_performance_goals")
    op.drop_index("ix_hr_perf_goals_cycle_id", table_name="hr_performance_goals")
    op.drop_index("ix_hr_perf_goals_tenant_id", table_name="hr_performance_goals")
    op.drop_table("hr_performance_goals")

    op.drop_index("ix_hr_perf_cycles_created_by_user_id", table_name="hr_performance_cycles")
    op.drop_index("ix_hr_perf_cycles_status", table_name="hr_performance_cycles")
    op.drop_index("ix_hr_perf_cycles_name", table_name="hr_performance_cycles")
    op.drop_index("ix_hr_perf_cycles_tenant_id", table_name="hr_performance_cycles")
    op.drop_table("hr_performance_cycles")
