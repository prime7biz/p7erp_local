"""Add HR payroll components and structures

Revision ID: 028
Revises: 027
Create Date: 2026-03-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_payroll_components",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("component_type", sa.String(length=16), nullable=False, server_default="EARNING"),
        sa.Column("calculation_type", sa.String(length=24), nullable=False, server_default="FIXED"),
        sa.Column("default_amount", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("gl_account_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["gl_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_payroll_components_tenant_code"),
    )
    op.create_index("ix_hr_payroll_components_tenant_id", "hr_payroll_components", ["tenant_id"])
    op.create_index("ix_hr_payroll_components_code", "hr_payroll_components", ["code"])
    op.create_index("ix_hr_payroll_components_component_type", "hr_payroll_components", ["component_type"])

    op.create_table(
        "hr_payroll_structures",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=24), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_payroll_structures_tenant_code"),
    )
    op.create_index("ix_hr_payroll_structures_tenant_id", "hr_payroll_structures", ["tenant_id"])
    op.create_index("ix_hr_payroll_structures_code", "hr_payroll_structures", ["code"])

    op.create_table(
        "hr_payroll_structure_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("structure_id", sa.Integer(), nullable=False),
        sa.Column("component_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("formula", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["structure_id"], ["hr_payroll_structures.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["component_id"], ["hr_payroll_components.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_hr_payroll_structure_lines_tenant_id", "hr_payroll_structure_lines", ["tenant_id"])
    op.create_index("ix_hr_payroll_structure_lines_structure_id", "hr_payroll_structure_lines", ["structure_id"])
    op.create_index("ix_hr_payroll_structure_lines_component_id", "hr_payroll_structure_lines", ["component_id"])


def downgrade() -> None:
    op.drop_index("ix_hr_payroll_structure_lines_component_id", table_name="hr_payroll_structure_lines")
    op.drop_index("ix_hr_payroll_structure_lines_structure_id", table_name="hr_payroll_structure_lines")
    op.drop_index("ix_hr_payroll_structure_lines_tenant_id", table_name="hr_payroll_structure_lines")
    op.drop_table("hr_payroll_structure_lines")

    op.drop_index("ix_hr_payroll_structures_code", table_name="hr_payroll_structures")
    op.drop_index("ix_hr_payroll_structures_tenant_id", table_name="hr_payroll_structures")
    op.drop_table("hr_payroll_structures")

    op.drop_index("ix_hr_payroll_components_component_type", table_name="hr_payroll_components")
    op.drop_index("ix_hr_payroll_components_code", table_name="hr_payroll_components")
    op.drop_index("ix_hr_payroll_components_tenant_id", table_name="hr_payroll_components")
    op.drop_table("hr_payroll_components")
