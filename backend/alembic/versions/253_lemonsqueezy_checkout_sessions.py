"""Lemon Squeezy: server-side checkout sessions.

New table ``lemonsqueezy_checkout_sessions``. When a tenant admin starts a checkout we store a random
``checkout_ref`` with the tenant and variant; the webhook resolves the tenant from this row instead
of trusting a tenant id inside the checkout's custom data.

Additive only. Downgrade drops the table (webhooks for checkouts started before the downgrade can
then no longer be matched and must be applied manually).

Revision ID: 253
Revises: 252
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "253"
down_revision: Union[str, None] = "252"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lemonsqueezy_checkout_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("checkout_ref", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("variant_id", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("lemonsqueezy_order_id", sa.String(length=64), nullable=True),
        sa.Column("lemonsqueezy_subscription_id", sa.String(length=64), nullable=True),
        sa.UniqueConstraint("checkout_ref", name="uq_lemonsqueezy_checkout_sessions_ref"),
    )
    op.create_index(
        "ix_lemonsqueezy_checkout_sessions_tenant_id",
        "lemonsqueezy_checkout_sessions",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_lemonsqueezy_checkout_sessions_tenant_id", table_name="lemonsqueezy_checkout_sessions")
    op.drop_table("lemonsqueezy_checkout_sessions")
