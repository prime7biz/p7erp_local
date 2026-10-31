"""Create hr_compliance_frameworks (Sprint H1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "224"
down_revision: Union[str, None] = "223"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_compliance_frameworks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("framework_name", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=16), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hr_compliance_frameworks_tenant_id", "hr_compliance_frameworks", ["tenant_id"])
    op.create_index("ix_hr_compliance_frameworks_framework_name", "hr_compliance_frameworks", ["framework_name"])


def downgrade() -> None:
    op.drop_index("ix_hr_compliance_frameworks_framework_name", table_name="hr_compliance_frameworks")
    op.drop_index("ix_hr_compliance_frameworks_tenant_id", table_name="hr_compliance_frameworks")
    op.drop_table("hr_compliance_frameworks")
