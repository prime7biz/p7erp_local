"""Merch sample workspace: tasks, costing, materials, AI proposals, TNA link, subtype.

Revision ID: 172
Revises: 171
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "172"
down_revision: Union[str, None] = "171"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "merch_sample_requests",
        sa.Column("sample_subtype", sa.String(length=64), nullable=True),
    )

    op.create_table(
        "merch_sample_tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sample_request_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("step_name", sa.String(length=255), nullable=False),
        sa.Column("planned_start", sa.Date(), nullable=True),
        sa.Column("planned_end", sa.Date(), nullable=True),
        sa.Column("actual_start", sa.Date(), nullable=True),
        sa.Column("actual_end", sa.Date(), nullable=True),
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
        sa.Column("pct_complete", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_request_id"], ["merch_sample_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merch_sample_tasks_tenant_id", "merch_sample_tasks", ["tenant_id"])
    op.create_index(
        "ix_merch_sample_tasks_sample_request_id",
        "merch_sample_tasks",
        ["sample_request_id"],
    )

    op.create_table(
        "merch_sample_cost_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sample_request_id", sa.Integer(), nullable=False),
        sa.Column("line_type", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("rate", sa.Numeric(18, 4), nullable=True),
        sa.Column("amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("currency_code", sa.String(length=8), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_request_id"], ["merch_sample_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merch_sample_cost_lines_tenant_id", "merch_sample_cost_lines", ["tenant_id"])
    op.create_index(
        "ix_merch_sample_cost_lines_sample_request_id",
        "merch_sample_cost_lines",
        ["sample_request_id"],
    )

    op.create_table(
        "merch_sample_material_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sample_request_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False),
        sa.Column("uom", sa.String(length=32), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_request_id"], ["merch_sample_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merch_sample_material_lines_tenant_id", "merch_sample_material_lines", ["tenant_id"])
    op.create_index(
        "ix_merch_sample_material_lines_sample_request_id",
        "merch_sample_material_lines",
        ["sample_request_id"],
    )

    op.create_table(
        "merch_sample_ai_proposals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("sample_request_id", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("proposal_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("applied_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sample_request_id"], ["merch_sample_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["applied_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_merch_sample_ai_proposals_tenant_id", "merch_sample_ai_proposals", ["tenant_id"])
    op.create_index(
        "ix_merch_sample_ai_proposals_sample_request_id",
        "merch_sample_ai_proposals",
        ["sample_request_id"],
    )

    op.add_column(
        "order_followup_actions",
        sa.Column("merch_sample_request_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_order_followup_actions_merch_sample_request_id",
        "order_followup_actions",
        "merch_sample_requests",
        ["merch_sample_request_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_order_followup_actions_merch_sample_request_id",
        "order_followup_actions",
        ["merch_sample_request_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_order_followup_actions_merch_sample_request_id", table_name="order_followup_actions")
    op.drop_constraint(
        "fk_order_followup_actions_merch_sample_request_id",
        "order_followup_actions",
        type_="foreignkey",
    )
    op.drop_column("order_followup_actions", "merch_sample_request_id")

    op.drop_index("ix_merch_sample_ai_proposals_sample_request_id", table_name="merch_sample_ai_proposals")
    op.drop_index("ix_merch_sample_ai_proposals_tenant_id", table_name="merch_sample_ai_proposals")
    op.drop_table("merch_sample_ai_proposals")

    op.drop_index("ix_merch_sample_material_lines_sample_request_id", table_name="merch_sample_material_lines")
    op.drop_index("ix_merch_sample_material_lines_tenant_id", table_name="merch_sample_material_lines")
    op.drop_table("merch_sample_material_lines")

    op.drop_index("ix_merch_sample_cost_lines_sample_request_id", table_name="merch_sample_cost_lines")
    op.drop_index("ix_merch_sample_cost_lines_tenant_id", table_name="merch_sample_cost_lines")
    op.drop_table("merch_sample_cost_lines")

    op.drop_index("ix_merch_sample_tasks_sample_request_id", table_name="merch_sample_tasks")
    op.drop_index("ix_merch_sample_tasks_tenant_id", table_name="merch_sample_tasks")
    op.drop_table("merch_sample_tasks")

    op.drop_column("merch_sample_requests", "sample_subtype")
