"""Inquiry product / technical-file columns on inquiries.

Plan called this revision 328 after 327; local chain already has 328–334
(hourly slot / machine taxonomy / cutting / floor / finishing / customer
profile / cross-module FKs), so this ships as 335 after 334.

inquiries already has p7_tenant_isolation RLS from migration 270 — no new
tenant table, so no RLS policy change here.

Rollback: ``alembic downgrade 334``.

Revision ID: 335
Revises: 334
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "335"
down_revision: Union[str, None] = "334"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS: tuple[tuple[str, sa.types.TypeEngine], ...] = (
    ("inquiry_type", sa.String(64)),
    ("brand", sa.String(128)),
    ("season_year", sa.String(16)),
    ("material_composition", sa.Text()),
    ("size_range", sa.String(128)),
    ("color_options", sa.JSON()),
    ("country_of_origin", sa.String(64)),
    ("special_requirements", sa.Text()),
    ("contact_person", sa.String(128)),
    ("technical_files", sa.JSON()),
)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for name, col_type in _COLUMNS:
        op.add_column("inquiries", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for name, _ in reversed(_COLUMNS):
        op.drop_column("inquiries", name)
