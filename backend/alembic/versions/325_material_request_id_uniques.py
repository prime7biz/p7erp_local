"""Partial unique indexes on material control request_id (idempotency).

RTV / bond / claim: prevents concurrent double-submit races (MC-SEC-02 / MC-SEC-09).
Rollback: ``alembic downgrade 324``.

Revision ID: 325
Revises: 324
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "325"
down_revision: Union[str, None] = "324"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_mrtv_tenant_request_id
        ON material_rtv_documents (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_jw_bond_tenant_request_id
        ON job_work_bond_transfers (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_pmc_tenant_request_id
        ON principal_material_claims (tenant_id, request_id)
        WHERE request_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute("DROP INDEX IF EXISTS uq_pmc_tenant_request_id")
    op.execute("DROP INDEX IF EXISTS uq_jw_bond_tenant_request_id")
    op.execute("DROP INDEX IF EXISTS uq_mrtv_tenant_request_id")
