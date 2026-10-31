"""Create voucher_classes and link vouchers / voucher_types (Sprint 4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "207"
down_revision: Union[str, None] = "206"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voucher_classes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("voucher_type", sa.String(length=32), nullable=False),
        sa.Column("default_ledger_id", sa.Integer(), nullable=True),
        sa.Column("default_narration", sa.Text(), nullable=True),
        sa.Column("default_cost_center_id", sa.Integer(), nullable=True),
        sa.Column("line_templates", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("auto_tax", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auto_round_off", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("auto_bill_allocation", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["default_ledger_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["default_cost_center_id"], ["cost_centers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_voucher_classes_tenant_name"),
    )
    op.create_index("ix_voucher_classes_tenant_id", "voucher_classes", ["tenant_id"])
    op.create_index("ix_voucher_classes_voucher_type", "voucher_classes", ["voucher_type"])

    op.add_column(
        "voucher_types",
        sa.Column("voucher_class_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_voucher_types_voucher_class_id",
        "voucher_types",
        "voucher_classes",
        ["voucher_class_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_vouchers_voucher_class_id",
        "vouchers",
        "voucher_classes",
        ["voucher_class_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_vouchers_original_party_bill_id",
        "vouchers",
        "party_ledger_bills",
        ["original_party_bill_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_vouchers_original_party_bill_id", "vouchers", type_="foreignkey")
    op.drop_constraint("fk_vouchers_voucher_class_id", "vouchers", type_="foreignkey")
    op.drop_constraint("fk_voucher_types_voucher_class_id", "voucher_types", type_="foreignkey")
    op.drop_column("voucher_types", "voucher_class_id")
    op.drop_index("ix_voucher_classes_voucher_type", table_name="voucher_classes")
    op.drop_index("ix_voucher_classes_tenant_id", table_name="voucher_classes")
    op.drop_table("voucher_classes")
