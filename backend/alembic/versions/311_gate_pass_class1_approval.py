"""Enhanced gate pass Class 1 post-approval columns (user_authority_classes_v1).

Additive only. Existing rows stay NULL = not in the Class 1 queue.

Revision ID: 311
Revises: 310
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "311"
down_revision: Union[str, None] = "310"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUSES = ("PENDING_CLASS1", "APPROVED", "REJECTED")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("enhanced_gate_passes", sa.Column("class1_approval_status", sa.String(16), nullable=True))
    op.add_column(
        "enhanced_gate_passes",
        sa.Column(
            "class1_approved_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("enhanced_gate_passes", sa.Column("class1_approved_at", sa.DateTime(), nullable=True))
    op.add_column(
        "enhanced_gate_passes",
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_enhanced_gate_passes_class1_approval_status",
        "enhanced_gate_passes",
        "class1_approval_status IS NULL OR class1_approval_status IN ("
        + ", ".join(f"'{s}'" for s in STATUSES)
        + ")",
    )
    op.create_index(
        "ix_enhanced_gate_passes_tenant_class1_approval_status",
        "enhanced_gate_passes",
        ["tenant_id", "class1_approval_status"],
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_enhanced_gate_passes_tenant_class1_approval_status", table_name="enhanced_gate_passes")
    op.drop_constraint("ck_enhanced_gate_passes_class1_approval_status", "enhanced_gate_passes", type_="check")
    op.drop_column("enhanced_gate_passes", "created_by_user_id")
    op.drop_column("enhanced_gate_passes", "class1_approved_at")
    op.drop_column("enhanced_gate_passes", "class1_approved_by")
    op.drop_column("enhanced_gate_passes", "class1_approval_status")
