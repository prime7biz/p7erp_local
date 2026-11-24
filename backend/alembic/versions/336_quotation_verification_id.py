"""Quotation QR verification id (nullable, unique).

Additive. quotations already has the p7_tenant_isolation RLS policy (migration 270), so no
policy change is needed. The id is issued when a quotation is SENT and cleared on
reject / cancel / supersede (app code, see quotations/verification_service.py).

Rollback: ``alembic downgrade 335``.

Revision ID: 336
Revises: 335
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "336"
down_revision: Union[str, None] = "335"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("quotations", sa.Column("verification_id", sa.String(64), nullable=True))
    op.create_index("ix_quotations_verification_id", "quotations", ["verification_id"], unique=True)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_quotations_verification_id", table_name="quotations")
    op.drop_column("quotations", "verification_id")
