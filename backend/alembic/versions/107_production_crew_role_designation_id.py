"""Add designation_id to production_crew_roles for stable HR linkage.

Revision ID: 107
Revises: 106
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "107"
down_revision: Union[str, None] = "106"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "production_crew_roles",
        sa.Column("designation_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_production_crew_roles_designation_id",
        "production_crew_roles",
        "hr_designations",
        ["designation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_production_crew_roles_designation_id",
        "production_crew_roles",
        ["designation_id"],
        unique=False,
    )
    # Backfill from hr_designations title match (case-insensitive)
    op.execute(
        """
        UPDATE production_crew_roles pcr
        SET designation_id = d.id
        FROM hr_designations d
        WHERE pcr.designation_filter IS NOT NULL
          AND trim(pcr.designation_filter) <> ''
          AND pcr.tenant_id = d.tenant_id
          AND lower(trim(pcr.designation_filter)) = lower(trim(d.title))
          AND d.is_active = true
        """
    )


def downgrade() -> None:
    op.drop_index("ix_production_crew_roles_designation_id", table_name="production_crew_roles")
    op.drop_constraint("fk_production_crew_roles_designation_id", "production_crew_roles", type_="foreignkey")
    op.drop_column("production_crew_roles", "designation_id")
