"""Human decisions on AI exception-agent findings.

Revision ID: 243
Revises: 242
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "243"
down_revision: Union[str, None] = "242"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_agent_decisions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent", sa.String(32), nullable=False),
        sa.Column("exception_key", sa.String(160), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("recipients_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ai_agent_decisions_tenant_id", "ai_agent_decisions", ["tenant_id"])
    op.create_index("ix_ai_agent_decisions_tenant_key", "ai_agent_decisions", ["tenant_id", "exception_key"])


def downgrade() -> None:
    op.drop_index("ix_ai_agent_decisions_tenant_key", table_name="ai_agent_decisions")
    op.drop_index("ix_ai_agent_decisions_tenant_id", table_name="ai_agent_decisions")
    op.drop_table("ai_agent_decisions")
