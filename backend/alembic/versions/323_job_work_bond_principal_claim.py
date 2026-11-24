"""Phase 5: job-work bond transfers + principal material claims + RLS.

Behind ``material_physical_v1`` (+ ``inbound_job_work_v1`` for bond). Qty-only — never
FIFO / inventory GL / BondedWarehouseEntry FK.
Rollback: ``alembic downgrade 322``.

Revision ID: 323
Revises: 322
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "323"
down_revision: Union[str, None] = "322"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "job_work_bond_transfers",
    "job_work_bond_transfer_lines",
    "principal_material_claims",
    "principal_material_claim_settlements",
)


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "job_work_bond_transfers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transfer_no", sa.String(32), nullable=False),
        sa.Column(
            "contract_id",
            sa.Integer(),
            sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "transfer_no", name="uq_jw_bond_transfer_no"),
    )
    op.create_index("ix_jw_bond_tenant_id", "job_work_bond_transfers", ["tenant_id"])
    op.create_index("ix_jw_bond_contract_id", "job_work_bond_transfers", ["contract_id"])
    op.create_index("ix_jw_bond_created_by", "job_work_bond_transfers", ["created_by_user_id"])

    op.create_table(
        "job_work_bond_transfer_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "transfer_id",
            sa.Integer(),
            sa.ForeignKey("job_work_bond_transfers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "material_id",
            sa.Integer(),
            sa.ForeignKey("job_work_materials.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_jw_bond_line_tenant", "job_work_bond_transfer_lines", ["tenant_id"])
    op.create_index("ix_jw_bond_line_transfer", "job_work_bond_transfer_lines", ["transfer_id"])
    op.create_index("ix_jw_bond_line_material", "job_work_bond_transfer_lines", ["material_id"])

    op.create_table(
        "principal_material_claims",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("claim_no", sa.String(32), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column(
            "contract_id",
            sa.Integer(),
            sa.ForeignKey("job_work_contracts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="OPEN"),
        sa.Column("amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="BDT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "claim_no", name="uq_principal_mat_claim_no"),
    )
    op.create_index("ix_pmc_tenant_id", "principal_material_claims", ["tenant_id"])
    op.create_index("ix_pmc_customer_id", "principal_material_claims", ["customer_id"])
    op.create_index("ix_pmc_created_by", "principal_material_claims", ["created_by_user_id"])

    op.create_table(
        "principal_material_claim_settlements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "claim_id",
            sa.Integer(),
            sa.ForeignKey("principal_material_claims.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_kind", sa.String(24), nullable=False, server_default="SETTLE"),
        sa.Column("amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_pmcs_tenant_id", "principal_material_claim_settlements", ["tenant_id"])
    op.create_index("ix_pmcs_claim_id", "principal_material_claim_settlements", ["claim_id"])

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _disable_rls(table)
    op.drop_table("principal_material_claim_settlements")
    op.drop_table("principal_material_claims")
    op.drop_table("job_work_bond_transfer_lines")
    op.drop_table("job_work_bond_transfers")
