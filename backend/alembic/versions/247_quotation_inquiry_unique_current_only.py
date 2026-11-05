"""One *current* quotation per inquiry (superseded revisions may share the inquiry).

Before: UNIQUE (tenant_id, inquiry_id) WHERE inquiry_id IS NOT NULL -> revising an
inquiry-linked quotation always failed with 409.
After:  UNIQUE (tenant_id, inquiry_id) WHERE inquiry_id IS NOT NULL AND superseded_at IS NULL.

The new index is created first, so there is never a moment without a guard.

Rollback: `alembic downgrade 246`. This refuses to run while any inquiry has more than one
quotation (i.e. revisions exist), because the old index cannot be rebuilt on that data.

Revision ID: 247
Revises: 246
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "247"
down_revision: Union[str, None] = "246"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_quotations_tenant_inquiry_current",
        "quotations",
        ["tenant_id", "inquiry_id"],
        unique=True,
        postgresql_where=sa.text("inquiry_id IS NOT NULL AND superseded_at IS NULL"),
    )
    op.drop_index("uq_quotations_tenant_inquiry_id", table_name="quotations")


def downgrade() -> None:
    bind = op.get_bind()
    duplicate_groups = bind.execute(
        sa.text(
            """
            SELECT count(*) FROM (
                SELECT tenant_id, inquiry_id
                FROM quotations
                WHERE inquiry_id IS NOT NULL
                GROUP BY tenant_id, inquiry_id
                HAVING count(*) > 1
            ) AS dup
            """
        )
    ).scalar_one()
    if duplicate_groups:
        raise RuntimeError(
            f"Cannot downgrade 247: {duplicate_groups} inquiry(ies) have more than one quotation "
            "(quotation revisions). The old index UNIQUE (tenant_id, inquiry_id) cannot be rebuilt. "
            "Manual steps: back up the database, then for each listed (tenant_id, inquiry_id) keep the "
            "current row (superseded_at IS NULL) and set inquiry_id = NULL on the superseded rows "
            "(SELECT tenant_id, inquiry_id, id, version_no, superseded_at FROM quotations "
            "WHERE inquiry_id IS NOT NULL ORDER BY tenant_id, inquiry_id, version_no). "
            "Then re-run the downgrade."
        )
    op.create_index(
        "uq_quotations_tenant_inquiry_id",
        "quotations",
        ["tenant_id", "inquiry_id"],
        unique=True,
        postgresql_where=sa.text("inquiry_id IS NOT NULL"),
    )
    op.drop_index("uq_quotations_tenant_inquiry_current", table_name="quotations")
