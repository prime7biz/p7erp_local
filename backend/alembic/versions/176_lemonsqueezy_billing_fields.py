"""Lemon Squeezy: plan variant ids, tenant subscription provider ids, webhook audit.

Revision ID: 176
Revises: 175
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "176"
down_revision: Union[str, None] = "175"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "platform_plans",
        sa.Column("lemonsqueezy_variant_id_monthly", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "platform_plans",
        sa.Column("lemonsqueezy_variant_id_yearly", sa.String(length=64), nullable=True),
    )

    op.add_column(
        "tenant_subscriptions",
        sa.Column(
            "provider",
            sa.String(length=32),
            nullable=False,
            server_default="manual",
        ),
    )
    op.add_column(
        "tenant_subscriptions",
        sa.Column("lemonsqueezy_subscription_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "tenant_subscriptions",
        sa.Column("lemonsqueezy_customer_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "tenant_subscriptions",
        sa.Column("lemonsqueezy_order_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_tenant_subscriptions_provider",
        "tenant_subscriptions",
        ["provider"],
        unique=False,
    )
    op.create_index(
        "ix_tenant_subscriptions_lemonsqueezy_subscription_id",
        "tenant_subscriptions",
        ["lemonsqueezy_subscription_id"],
        unique=False,
    )

    op.create_table(
        "lemonsqueezy_webhook_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.String(length=64), nullable=False),
        sa.Column("event_name", sa.String(length=128), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("signature_ok", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_lemonsqueezy_webhook_events_event_id"),
    )
    op.create_index(
        "ix_lemonsqueezy_webhook_events_event_name",
        "lemonsqueezy_webhook_events",
        ["event_name"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_lemonsqueezy_webhook_events_event_name", table_name="lemonsqueezy_webhook_events")
    op.drop_table("lemonsqueezy_webhook_events")

    op.drop_index("ix_tenant_subscriptions_lemonsqueezy_subscription_id", table_name="tenant_subscriptions")
    op.drop_index("ix_tenant_subscriptions_provider", table_name="tenant_subscriptions")
    op.drop_column("tenant_subscriptions", "lemonsqueezy_order_id")
    op.drop_column("tenant_subscriptions", "lemonsqueezy_customer_id")
    op.drop_column("tenant_subscriptions", "lemonsqueezy_subscription_id")
    op.drop_column("tenant_subscriptions", "provider")

    op.drop_column("platform_plans", "lemonsqueezy_variant_id_yearly")
    op.drop_column("platform_plans", "lemonsqueezy_variant_id_monthly")
