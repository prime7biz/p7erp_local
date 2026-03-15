"""Settlement audit shared presets.

Revision ID: 069
Revises: 068
Create Date: 2026-03-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "069"
down_revision: Union[str, None] = "068"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settlement_audit_presets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("from_date", sa.Date(), nullable=True),
        sa.Column("to_date", sa.Date(), nullable=True),
        sa.Column("status_filter", sa.String(length=32), nullable=True),
        sa.Column("source_currency", sa.String(length=10), nullable=True),
        sa.Column("party_query", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_settlement_audit_presets_tenant_id",
        "settlement_audit_presets",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_settlement_audit_presets_name",
        "settlement_audit_presets",
        ["name"],
        unique=False,
    )
    op.create_index(
        "ix_settlement_audit_presets_created_by",
        "settlement_audit_presets",
        ["created_by"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_settlement_audit_presets_created_by", table_name="settlement_audit_presets")
    op.drop_index("ix_settlement_audit_presets_name", table_name="settlement_audit_presets")
    op.drop_index("ix_settlement_audit_presets_tenant_id", table_name="settlement_audit_presets")
    op.drop_table("settlement_audit_presets")
