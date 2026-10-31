"""Add export case logistics fields (Phase 5) — all nullable."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "194"
down_revision: Union[str, None] = "193"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("export_cases", sa.Column("export_license_number", sa.String(length=64), nullable=True))
    op.add_column("export_cases", sa.Column("destination_country", sa.String(length=64), nullable=True))
    op.add_column("export_cases", sa.Column("shipping_mode", sa.String(length=16), nullable=True))
    op.add_column("export_cases", sa.Column("incoterms", sa.String(length=16), nullable=True))
    op.add_column("export_cases", sa.Column("expected_shipment_date", sa.Date(), nullable=True))
    op.add_column("export_cases", sa.Column("actual_shipment_date", sa.Date(), nullable=True))
    op.add_column("export_cases", sa.Column("customs_agent", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("export_cases", "customs_agent")
    op.drop_column("export_cases", "actual_shipment_date")
    op.drop_column("export_cases", "expected_shipment_date")
    op.drop_column("export_cases", "incoterms")
    op.drop_column("export_cases", "shipping_mode")
    op.drop_column("export_cases", "destination_country")
    op.drop_column("export_cases", "export_license_number")
