"""Marketing-site leads table (Book a demo / Contact form).

Revision ID: 232
Revises: 231
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "232"
down_revision: Union[str, None] = "231"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "marketing_leads",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("company", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("company_size", sa.String(64), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("source_page", sa.String(255), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="NEW"),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_marketing_leads_email", "marketing_leads", ["email"])
    op.create_index("ix_marketing_leads_status", "marketing_leads", ["status"])
    op.create_index("ix_marketing_leads_created_at", "marketing_leads", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_marketing_leads_created_at", table_name="marketing_leads")
    op.drop_index("ix_marketing_leads_status", table_name="marketing_leads")
    op.drop_index("ix_marketing_leads_email", table_name="marketing_leads")
    op.drop_table("marketing_leads")
