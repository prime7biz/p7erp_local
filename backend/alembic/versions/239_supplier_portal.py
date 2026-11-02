"""Supplier portal: supplier→vendor access, supplier PO updates, supplier_user role.

Revision ID: 239
Revises: 238
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "239"
down_revision: Union[str, None] = "238"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "external_supplier_access",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "external_principal_id",
            sa.Integer(),
            sa.ForeignKey("external_principals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("external_principal_id", "vendor_id", name="uq_external_supplier_access"),
    )
    op.create_index("ix_external_supplier_access_tenant_id", "external_supplier_access", ["tenant_id"])
    op.create_index(
        "ix_external_supplier_access_external_principal_id", "external_supplier_access", ["external_principal_id"]
    )
    op.create_index("ix_external_supplier_access_vendor_id", "external_supplier_access", ["vendor_id"])

    op.create_table(
        "supplier_po_updates",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "external_principal_id",
            sa.Integer(),
            sa.ForeignKey("external_principals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("expected_ship_date", sa.Date(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_supplier_po_updates_tenant_id", "supplier_po_updates", ["tenant_id"])
    op.create_index("ix_supplier_po_updates_purchase_order_id", "supplier_po_updates", ["purchase_order_id"])
    op.create_index("ix_supplier_po_updates_external_principal_id", "supplier_po_updates", ["external_principal_id"])
    op.create_index("ix_supplier_po_updates_created_at", "supplier_po_updates", ["created_at"])

    op.execute(
        sa.text(
            """
            INSERT INTO external_roles (code, name, principal_type, description) VALUES
            ('supplier_user', 'Supplier User', 'supplier',
             'See own purchase orders, confirm them and post ship dates and notes')
            ON CONFLICT (code) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    # Older code does not know the supplier type; switch those logins off and invalidate their tokens.
    op.execute(
        sa.text(
            "UPDATE external_principals SET is_active = false, session_version = session_version + 1 "
            "WHERE principal_type = 'supplier'"
        )
    )
    op.execute(
        sa.text(
            "DELETE FROM external_principal_roles WHERE role_id IN "
            "(SELECT id FROM external_roles WHERE code = 'supplier_user')"
        )
    )
    op.execute(sa.text("DELETE FROM external_roles WHERE code = 'supplier_user'"))
    op.drop_table("supplier_po_updates")
    op.drop_table("external_supplier_access")
