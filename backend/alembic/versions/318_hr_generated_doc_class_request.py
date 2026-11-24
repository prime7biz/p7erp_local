"""Nullable hr_class_request_id on generated employee documents (Phase 2 letters).

Additive only. Rollback: ``alembic downgrade 317``.

Revision ID: 318
Revises: 317
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "318"
down_revision: Union[str, None] = "317"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column(
        "hr_generated_employee_documents",
        sa.Column(
            "hr_class_request_id",
            sa.Integer(),
            sa.ForeignKey("hr_class_requests.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_hr_generated_docs_class_request",
        "hr_generated_employee_documents",
        ["tenant_id", "hr_class_request_id"],
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.drop_index("ix_hr_generated_docs_class_request", table_name="hr_generated_employee_documents")
    op.drop_column("hr_generated_employee_documents", "hr_class_request_id")
