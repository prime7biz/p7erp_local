"""Voucher Class 1 post-approval columns (user_authority_classes_v1).

Additive only. Existing rows stay NULL = not in the Class 1 queue.

Revision ID: 309
Revises: 308
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "309"
down_revision: Union[str, None] = "308"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUSES = ("PENDING_CLASS1", "APPROVED", "REJECTED")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("vouchers", sa.Column("class1_approval_status", sa.String(16), nullable=True))
    op.add_column(
        "vouchers",
        sa.Column("class1_approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("vouchers", sa.Column("class1_approved_at", sa.DateTime(), nullable=True))
    op.create_check_constraint(
        "ck_vouchers_class1_approval_status",
        "vouchers",
        "class1_approval_status IS NULL OR class1_approval_status IN ("
        + ", ".join(f"'{s}'" for s in STATUSES)
        + ")",
    )
    op.create_index(
        "ix_vouchers_tenant_class1_approval_status",
        "vouchers",
        ["tenant_id", "class1_approval_status"],
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_vouchers_tenant_class1_approval_status", table_name="vouchers")
    op.drop_constraint("ck_vouchers_class1_approval_status", "vouchers", type_="check")
    op.drop_column("vouchers", "class1_approved_at")
    op.drop_column("vouchers", "class1_approved_by")
    op.drop_column("vouchers", "class1_approval_status")
