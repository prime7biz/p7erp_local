"""Create item_kits and item_kit_components (Sprint I4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "222"
down_revision: Union[str, None] = "221"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "item_kits",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("kit_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("kit_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "kit_code", name="uq_item_kits_tenant_code"),
    )
    op.create_index("ix_item_kits_tenant_id", "item_kits", ["tenant_id"])
    op.create_index("ix_item_kits_is_active", "item_kits", ["is_active"])

    op.create_table(
        "item_kit_components",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("kit_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["kit_id"], ["item_kits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kit_id", "item_id", name="uq_item_kit_components_kit_item"),
    )
    op.create_index("ix_item_kit_components_tenant_id", "item_kit_components", ["tenant_id"])
    op.create_index("ix_item_kit_components_kit_id", "item_kit_components", ["kit_id"])
    op.create_index("ix_item_kit_components_item_id", "item_kit_components", ["item_id"])


def downgrade() -> None:
    op.drop_index("ix_item_kit_components_item_id", table_name="item_kit_components")
    op.drop_index("ix_item_kit_components_kit_id", table_name="item_kit_components")
    op.drop_index("ix_item_kit_components_tenant_id", table_name="item_kit_components")
    op.drop_table("item_kit_components")
    op.drop_index("ix_item_kits_is_active", table_name="item_kits")
    op.drop_index("ix_item_kits_tenant_id", table_name="item_kits")
    op.drop_table("item_kits")
