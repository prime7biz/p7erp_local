"""Recommendation columns on ai_agent_decisions (Manufacturing Intelligence Phase 4, B1).

Additive only: three nullable columns, one index and one partial unique index on ``ai_agent_decisions``. The
existing RLS policy of 270 is unchanged. Existing rows keep NULL; other agents never set the new columns.

* ``recommendation_json`` (JSONB): server-side copy of the recommendation that was decided on.
* ``deadline_date`` (Date): the date by which the recommendation needed a decision.
* ``finding_id`` (FK ``mfg_predictive_findings`` ON DELETE SET NULL, indexed): the only link between a decision
  and a finding (plan section 17.9).
* partial UNIQUE (tenant_id, finding_id) WHERE finding_id IS NOT NULL AND decision IN ('ACCEPTED', 'REJECTED'):
  a finding gets at most one human decision (double submit = IntegrityError, the writer then re-reads).

Rollback: ``alembic downgrade 300`` drops the index, FK and columns. ACCEPTED / REJECTED rows stay (governed AI
reads them as 7-day hides).

Revision ID: 301
Revises: 300
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "301"
down_revision: Union[str, None] = "300"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "ai_agent_decisions"
FK_NAME = "fk_ai_agent_decisions_finding_id"
INDEX = "ix_ai_agent_decisions_finding_id"
UNIQUE = "uq_ai_agent_decisions_finding_decided"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column(TABLE, sa.Column("recommendation_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column(TABLE, sa.Column("deadline_date", sa.Date(), nullable=True))
    op.add_column(TABLE, sa.Column("finding_id", sa.Integer(), nullable=True))
    op.create_foreign_key(FK_NAME, TABLE, "mfg_predictive_findings", ["finding_id"], ["id"], ondelete="SET NULL")
    op.create_index(INDEX, TABLE, ["finding_id"])
    op.execute(
        f"CREATE UNIQUE INDEX {UNIQUE} ON {TABLE} (tenant_id, finding_id) "
        f"WHERE finding_id IS NOT NULL AND decision IN ('ACCEPTED', 'REJECTED')"
    )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP INDEX IF EXISTS {UNIQUE}")
    op.drop_index(INDEX, table_name=TABLE)
    op.drop_constraint(FK_NAME, TABLE, type_="foreignkey")
    op.drop_column(TABLE, "finding_id")
    op.drop_column(TABLE, "deadline_date")
    op.drop_column(TABLE, "recommendation_json")
