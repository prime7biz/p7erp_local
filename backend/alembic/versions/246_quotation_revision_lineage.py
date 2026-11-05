"""Quotation revision lineage: root / previous revision links and superseded marker.

Additive only (nullable columns, no backfill). Existing rows keep NULL root_quotation_id,
which means "this row is the root (version 1) of its own lineage".

Rollback: `alembic downgrade 245` drops the new indexes and columns.

Revision ID: 246
Revises: 245
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "246"
down_revision: Union[str, None] = "245"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quotations",
        sa.Column(
            "root_quotation_id",
            sa.Integer(),
            sa.ForeignKey("quotations.id", ondelete="SET NULL", name="fk_quotations_root_quotation_id"),
            nullable=True,
        ),
    )
    op.add_column(
        "quotations",
        sa.Column(
            "revision_of_id",
            sa.Integer(),
            sa.ForeignKey("quotations.id", ondelete="SET NULL", name="fk_quotations_revision_of_id"),
            nullable=True,
        ),
    )
    op.add_column("quotations", sa.Column("superseded_at", sa.DateTime(), nullable=True))

    op.create_index("ix_quotations_root_quotation_id", "quotations", ["root_quotation_id"])
    op.create_index("ix_quotations_revision_of_id", "quotations", ["revision_of_id"])
    op.create_index(
        "uq_quotations_tenant_root_version",
        "quotations",
        ["tenant_id", "root_quotation_id", "version_no"],
        unique=True,
        postgresql_where=sa.text("root_quotation_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_quotations_tenant_root_version", table_name="quotations")
    op.drop_index("ix_quotations_revision_of_id", table_name="quotations")
    op.drop_index("ix_quotations_root_quotation_id", table_name="quotations")
    op.drop_constraint("fk_quotations_revision_of_id", "quotations", type_="foreignkey")
    op.drop_constraint("fk_quotations_root_quotation_id", "quotations", type_="foreignkey")
    op.drop_column("quotations", "superseded_at")
    op.drop_column("quotations", "revision_of_id")
    op.drop_column("quotations", "root_quotation_id")
