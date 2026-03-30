"""AI controlled automation proposals (Phase 20).

Revision ID: 139
Revises: 138
Create Date: 2026-03-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "139"
down_revision: Union[str, None] = "138"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_controlled_action_proposals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("rule_code", sa.String(64), nullable=False),
        sa.Column("payload_json", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="proposed"),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("executed_at", sa.DateTime(), nullable=True),
        sa.Column("rolled_back_at", sa.DateTime(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("audit_ref", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "idempotency_key", name="uq_ai_cap_tenant_idempotency"),
    )
    op.create_index("ix_ai_cap_tenant_id", "ai_controlled_action_proposals", ["tenant_id"])
    op.create_index("ix_ai_cap_status", "ai_controlled_action_proposals", ["status"])


def downgrade() -> None:
    op.drop_index("ix_ai_cap_status", table_name="ai_controlled_action_proposals")
    op.drop_index("ix_ai_cap_tenant_id", table_name="ai_controlled_action_proposals")
    op.drop_table("ai_controlled_action_proposals")
