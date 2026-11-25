"""Dozen-first quotation costing columns (all nullable, additive).

Used only when tenant flag ``quotation_costing_accuracy_v1`` is ON (strict, default OFF).
A row with ``costing_basis IS NULL`` is a legacy quotation: its stored values are never
reinterpreted. quotation_materials / quotation_manufacturing / quotation_other_costs /
quotations already have the p7_tenant_isolation RLS policy, so no policy change is needed.

Rollback: switch the flag OFF, deploy the reverted code, export the new columns if you need
them, then ``alembic downgrade 337`` (the downgrade drops the new columns and their data).

Revision ID: 338
Revises: 337
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "338"
down_revision: Union[str, None] = "337"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS: dict[str, list[sa.Column]] = {
    "quotation_materials": [
        sa.Column("wastage_pct", sa.Numeric(10, 4), nullable=True),
    ],
    "quotation_manufacturing": [
        sa.Column("cm_mode", sa.String(24), nullable=True),
        sa.Column("smv", sa.Numeric(12, 4), nullable=True),
        sa.Column("efficiency_pct", sa.Numeric(10, 4), nullable=True),
        sa.Column("cpm", sa.Numeric(18, 6), nullable=True),
        sa.Column("cpm_basis", sa.String(24), nullable=True),
        sa.Column("working_hours_per_day", sa.Numeric(8, 2), nullable=True),
        sa.Column("direct_cm_basis", sa.String(16), nullable=True),
    ],
    "quotation_other_costs": [
        sa.Column("cost_basis", sa.String(16), nullable=True),
    ],
    "quotations": [
        sa.Column("costing_basis", sa.String(16), nullable=True),
        sa.Column("margin_method", sa.String(24), nullable=True),
        sa.Column("fixed_commission_basis", sa.String(16), nullable=True),
        sa.Column("material_cost_per_dozen", sa.Numeric(18, 4), nullable=True),
        sa.Column("manufacturing_cost_per_dozen", sa.Numeric(18, 4), nullable=True),
        sa.Column("other_cost_per_dozen", sa.Numeric(18, 4), nullable=True),
        sa.Column("total_cost_per_dozen", sa.Numeric(18, 4), nullable=True),
        sa.Column("quoted_price_per_dozen", sa.Numeric(18, 4), nullable=True),
        sa.Column("quoted_price_per_piece", sa.Numeric(18, 4), nullable=True),
    ],
}


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table, columns in _COLUMNS.items():
        for column in columns:
            op.add_column(table, column)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table, columns in reversed(list(_COLUMNS.items())):
        for column in reversed(columns):
            op.drop_column(table, column.name)
