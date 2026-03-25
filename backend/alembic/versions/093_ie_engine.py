"""IE engine: operations library, operation bulletins, line balance.

Revision ID: 093
Revises: 092
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "093"
down_revision: Union[str, None] = "092"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ie_operations_library",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("operation_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False, server_default="other"),
        sa.Column("default_smv", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("machine_type_required", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "operation_code", name="uq_ie_ops_lib_tenant_code"),
    )
    op.create_index("ix_ie_operations_library_tenant_id", "ie_operations_library", ["tenant_id"])

    op.create_table(
        "operation_bulletins",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_id", sa.Integer(), nullable=False),
        sa.Column("ob_code", sa.String(length=64), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("total_smv", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "ob_code", name="uq_operation_bulletins_tenant_code"),
    )
    op.create_index("ix_operation_bulletins_tenant_id", "operation_bulletins", ["tenant_id"])
    op.create_index("ix_operation_bulletins_style_id", "operation_bulletins", ["style_id"])

    op.create_table(
        "operation_bulletin_ops",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("ob_id", sa.Integer(), nullable=False),
        sa.Column("sequence_no", sa.Integer(), nullable=False),
        sa.Column("operation_id", sa.Integer(), nullable=True),
        sa.Column("operation_name", sa.String(length=255), nullable=False),
        sa.Column("smv", sa.Numeric(12, 4), nullable=False, server_default="0"),
        sa.Column("machine_type", sa.String(length=64), nullable=True),
        sa.Column("attachment_needed", sa.String(length=255), nullable=True),
        sa.Column("is_critical", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ob_id"], ["operation_bulletins.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operation_id"], ["ie_operations_library.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_operation_bulletin_ops_ob_id", "operation_bulletin_ops", ["ob_id"])

    op.create_table(
        "line_balance_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("ob_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("num_workstations", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bottleneck_cycle_time", sa.Numeric(12, 4), nullable=True),
        sa.Column("balance_efficiency_pct", sa.Numeric(12, 4), nullable=True),
        sa.Column("predicted_output_per_hour", sa.Numeric(12, 4), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("workstation_payload", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ob_id"], ["operation_bulletins.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_line_balance_runs_tenant_id", "line_balance_runs", ["tenant_id"])
    op.create_index("ix_line_balance_runs_ob_id", "line_balance_runs", ["ob_id"])

    op.create_table(
        "line_balance_workstations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("balance_run_id", sa.Integer(), nullable=False),
        sa.Column("workstation_no", sa.Integer(), nullable=False),
        sa.Column("assigned_op_ids", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("cycle_time", sa.Numeric(12, 4), nullable=True),
        sa.Column("machine_type", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["balance_run_id"], ["line_balance_runs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_line_balance_workstations_balance_run_id", "line_balance_workstations", ["balance_run_id"])


def downgrade() -> None:
    op.drop_index("ix_line_balance_workstations_balance_run_id", table_name="line_balance_workstations")
    op.drop_table("line_balance_workstations")
    op.drop_index("ix_line_balance_runs_ob_id", table_name="line_balance_runs")
    op.drop_index("ix_line_balance_runs_tenant_id", table_name="line_balance_runs")
    op.drop_table("line_balance_runs")
    op.drop_index("ix_operation_bulletin_ops_ob_id", table_name="operation_bulletin_ops")
    op.drop_table("operation_bulletin_ops")
    op.drop_index("ix_operation_bulletins_style_id", table_name="operation_bulletins")
    op.drop_index("ix_operation_bulletins_tenant_id", table_name="operation_bulletins")
    op.drop_table("operation_bulletins")
    op.drop_index("ix_ie_operations_library_tenant_id", table_name="ie_operations_library")
    op.drop_table("ie_operations_library")
