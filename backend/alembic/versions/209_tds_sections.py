"""Create tds_sections and link party_ledgers.tds_section_id (Sprint 5)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "209"
down_revision: Union[str, None] = "208"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tds_sections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("section_code", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("threshold_amount", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("tds_rate", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("rate_company", sa.Numeric(8, 4), nullable=True),
        sa.Column("rate_non_company", sa.Numeric(8, 4), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "section_code", name="uq_tds_sections_tenant_code"),
    )
    op.create_index("ix_tds_sections_tenant_id", "tds_sections", ["tenant_id"])
    op.create_index("ix_tds_sections_section_code", "tds_sections", ["section_code"])

    op.add_column("party_ledgers", sa.Column("tds_section_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_party_ledgers_tds_section_id",
        "party_ledgers",
        "tds_sections",
        ["tds_section_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_party_ledgers_tds_section_id", "party_ledgers", ["tds_section_id"])


def downgrade() -> None:
    op.drop_index("ix_party_ledgers_tds_section_id", table_name="party_ledgers")
    op.drop_constraint("fk_party_ledgers_tds_section_id", "party_ledgers", type_="foreignkey")
    op.drop_column("party_ledgers", "tds_section_id")
    op.drop_index("ix_tds_sections_section_code", table_name="tds_sections")
    op.drop_index("ix_tds_sections_tenant_id", table_name="tds_sections")
    op.drop_table("tds_sections")
