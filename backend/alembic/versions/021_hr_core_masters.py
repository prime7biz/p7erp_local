"""Add HR core master tables

Revision ID: 021
Revises: 020
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_departments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_departments_tenant_code"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_hr_departments_tenant_name"),
    )
    op.create_index("ix_hr_departments_tenant_id", "hr_departments", ["tenant_id"])
    op.create_index("ix_hr_departments_code", "hr_departments", ["code"])
    op.create_index("ix_hr_departments_name", "hr_departments", ["name"])
    op.create_index("ix_hr_departments_is_active", "hr_departments", ["is_active"])

    op.create_table(
        "hr_designations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["hr_departments.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_designations_tenant_code"),
        sa.UniqueConstraint("tenant_id", "title", name="uq_hr_designations_tenant_title"),
    )
    op.create_index("ix_hr_designations_tenant_id", "hr_designations", ["tenant_id"])
    op.create_index("ix_hr_designations_department_id", "hr_designations", ["department_id"])
    op.create_index("ix_hr_designations_code", "hr_designations", ["code"])
    op.create_index("ix_hr_designations_title", "hr_designations", ["title"])
    op.create_index("ix_hr_designations_is_active", "hr_designations", ["is_active"])

    op.create_table(
        "hr_employees",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_code", sa.String(length=32), nullable=False),
        sa.Column("first_name", sa.String(length=128), nullable=False),
        sa.Column("last_name", sa.String(length=128), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("joining_date", sa.Date(), nullable=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("designation_id", sa.Integer(), nullable=True),
        sa.Column("reporting_manager_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["hr_departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["designation_id"], ["hr_designations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reporting_manager_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "employee_code", name="uq_hr_employees_tenant_employee_code"),
    )
    op.create_index("ix_hr_employees_tenant_id", "hr_employees", ["tenant_id"])
    op.create_index("ix_hr_employees_employee_code", "hr_employees", ["employee_code"])
    op.create_index("ix_hr_employees_department_id", "hr_employees", ["department_id"])
    op.create_index("ix_hr_employees_designation_id", "hr_employees", ["designation_id"])
    op.create_index("ix_hr_employees_reporting_manager_id", "hr_employees", ["reporting_manager_id"])
    op.create_index("ix_hr_employees_user_id", "hr_employees", ["user_id"])
    op.create_index("ix_hr_employees_email", "hr_employees", ["email"])
    op.create_index("ix_hr_employees_is_active", "hr_employees", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_hr_employees_is_active", table_name="hr_employees")
    op.drop_index("ix_hr_employees_email", table_name="hr_employees")
    op.drop_index("ix_hr_employees_user_id", table_name="hr_employees")
    op.drop_index("ix_hr_employees_reporting_manager_id", table_name="hr_employees")
    op.drop_index("ix_hr_employees_designation_id", table_name="hr_employees")
    op.drop_index("ix_hr_employees_department_id", table_name="hr_employees")
    op.drop_index("ix_hr_employees_employee_code", table_name="hr_employees")
    op.drop_index("ix_hr_employees_tenant_id", table_name="hr_employees")
    op.drop_table("hr_employees")

    op.drop_index("ix_hr_designations_is_active", table_name="hr_designations")
    op.drop_index("ix_hr_designations_title", table_name="hr_designations")
    op.drop_index("ix_hr_designations_code", table_name="hr_designations")
    op.drop_index("ix_hr_designations_department_id", table_name="hr_designations")
    op.drop_index("ix_hr_designations_tenant_id", table_name="hr_designations")
    op.drop_table("hr_designations")

    op.drop_index("ix_hr_departments_is_active", table_name="hr_departments")
    op.drop_index("ix_hr_departments_name", table_name="hr_departments")
    op.drop_index("ix_hr_departments_code", table_name="hr_departments")
    op.drop_index("ix_hr_departments_tenant_id", table_name="hr_departments")
    op.drop_table("hr_departments")
