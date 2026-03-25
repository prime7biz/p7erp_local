"""Platform plans, subscriptions, invoices, payments.

Revision ID: 118
Revises: 117
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "118"
down_revision: Union[str, None] = "117"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("max_users", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_storage_gb", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_ai_tokens_monthly", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("features_included", sa.JSON(), nullable=True),
        sa.Column("price_monthly_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("price_yearly_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_platform_plans_code"),
    )

    op.create_table(
        "tenant_subscriptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="trial",
        ),
        sa.Column("trial_ends_at", sa.DateTime(), nullable=True),
        sa.Column("current_period_start", sa.DateTime(), nullable=True),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column(
            "billing_cycle",
            sa.String(length=16),
            nullable=False,
            server_default="monthly",
        ),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["platform_plans.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_subscriptions_tenant_id"),
    )
    op.create_index("ix_tenant_subscriptions_plan_id", "tenant_subscriptions", ["plan_id"], unique=False)

    op.create_table(
        "billing_invoices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("subscription_id", sa.Integer(), nullable=True),
        sa.Column("invoice_number", sa.String(length=64), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=True),
        sa.Column("period_end", sa.Date(), nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("line_items", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["tenant_subscriptions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_number", name="uq_billing_invoices_invoice_number"),
    )
    op.create_index("ix_billing_invoices_tenant_id", "billing_invoices", ["tenant_id"], unique=False)
    op.create_index("ix_billing_invoices_status", "billing_invoices", ["status"], unique=False)

    op.create_table(
        "billing_payments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column(
            "method",
            sa.String(length=32),
            nullable=False,
            server_default="bank_transfer",
        ),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="completed",
        ),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["invoice_id"], ["billing_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_billing_payments_invoice_id", "billing_payments", ["invoice_id"], unique=False)
    op.create_index("ix_billing_payments_tenant_id", "billing_payments", ["tenant_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_billing_payments_tenant_id", table_name="billing_payments")
    op.drop_index("ix_billing_payments_invoice_id", table_name="billing_payments")
    op.drop_table("billing_payments")

    op.drop_index("ix_billing_invoices_status", table_name="billing_invoices")
    op.drop_index("ix_billing_invoices_tenant_id", table_name="billing_invoices")
    op.drop_table("billing_invoices")

    op.drop_index("ix_tenant_subscriptions_plan_id", table_name="tenant_subscriptions")
    op.drop_table("tenant_subscriptions")

    op.drop_table("platform_plans")
