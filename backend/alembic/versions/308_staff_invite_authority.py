"""Staff invitation authority class + module grants + optional employee link.

Additive only. Used when ``user_authority_classes_v1`` is ON.

Revision ID: 308
Revises: 307
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "308"
down_revision: Union[str, None] = "307"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AUTHORITY_CLASSES = ("SUPER", "CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("staff_invitations", sa.Column("authority_class", sa.String(16), nullable=True))
    op.add_column(
        "staff_invitations",
        sa.Column("module_grants", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "staff_invitations",
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_check_constraint(
        "ck_staff_invitations_authority_class",
        "staff_invitations",
        "authority_class IS NULL OR authority_class IN ("
        + ", ".join(f"'{c}'" for c in AUTHORITY_CLASSES)
        + ")",
    )
    op.create_index("ix_staff_invitations_employee_id", "staff_invitations", ["employee_id"])


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_staff_invitations_employee_id", table_name="staff_invitations")
    op.drop_constraint("ck_staff_invitations_authority_class", "staff_invitations", type_="check")
    op.drop_column("staff_invitations", "employee_id")
    op.drop_column("staff_invitations", "module_grants")
    op.drop_column("staff_invitations", "authority_class")
