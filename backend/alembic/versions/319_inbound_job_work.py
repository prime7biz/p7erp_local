"""Inbound Job Work (CMT) tables + RLS.

Additive only. Behind tenant flag ``inbound_job_work_v1`` (default OFF).
Customer materials and FG qty live here — never in stock_movements / FIFO / inventory GL.

Rollback: ``alembic downgrade 318`` (export rows first).

Revision ID: 319
Revises: 318
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "319"
down_revision: Union[str, None] = "318"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "job_work_contracts",
    "job_work_deliverables",
    "job_work_materials",
    "job_work_material_ledger",
    "job_work_deliveries",
    "job_work_delivery_lines",
    "job_work_bills",
    "job_work_receipts",
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


def _tenant_col() -> sa.Column:
    return sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)


def _stamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    ]


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "job_work_contracts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("contract_no", sa.String(32), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("cm_rate", sa.String(32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="BDT"),
        sa.Column("exchange_rate_default", sa.String(32), nullable=False, server_default="1"),
        sa.Column("vat_rate_pct", sa.String(32), nullable=False, server_default="0"),
        sa.Column("do_cutting", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("do_sewing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("do_finishing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("location_label", sa.String(128), nullable=True),
        sa.Column("contract_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("qty_ordered_total", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_produced_total", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_delivered_accepted", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_rejected_total", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_billed", sa.String(32), nullable=False, server_default="0"),
        sa.Column("amount_billed", sa.String(32), nullable=False, server_default="0"),
        sa.Column("amount_received", sa.String(32), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        *_stamps(),
        sa.UniqueConstraint("tenant_id", "contract_no", name="uq_job_work_contracts_tenant_no"),
    )
    op.create_index("ix_job_work_contracts_tenant_id", "job_work_contracts", ["tenant_id"])
    op.create_index("ix_job_work_contracts_tenant_status", "job_work_contracts", ["tenant_id", "status"])
    op.create_index("ix_job_work_contracts_tenant_customer", "job_work_contracts", ["tenant_id", "customer_id"])
    op.create_index("ix_job_work_contracts_customer_id", "job_work_contracts", ["customer_id"])
    op.create_index("ix_job_work_contracts_created_by", "job_work_contracts", ["created_by_user_id"])
    op.create_index("ix_job_work_contracts_updated_by", "job_work_contracts", ["updated_by_user_id"])

    op.create_table(
        "job_work_deliverables",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "contract_id", sa.Integer(), sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("style_ref", sa.String(128), nullable=True),
        sa.Column("color", sa.String(64), nullable=True),
        sa.Column("size", sa.String(32), nullable=True),
        sa.Column("qty_ordered", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_produced", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_delivered", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_rejected", sa.String(32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        *_stamps(),
    )
    op.create_index("ix_job_work_deliverables_tenant_id", "job_work_deliverables", ["tenant_id"])
    op.create_index("ix_job_work_deliverables_contract", "job_work_deliverables", ["tenant_id", "contract_id"])
    op.create_index("ix_job_work_deliverables_contract_id", "job_work_deliverables", ["contract_id"])

    op.create_table(
        "job_work_materials",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "contract_id", sa.Integer(), sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("item_id", sa.Integer(), sa.ForeignKey("items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("consumption_per_unit", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_planned", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_received", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_consumed", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_returned", sa.String(32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        *_stamps(),
    )
    op.create_index("ix_job_work_materials_tenant_id", "job_work_materials", ["tenant_id"])
    op.create_index("ix_job_work_materials_contract", "job_work_materials", ["tenant_id", "contract_id"])
    op.create_index("ix_job_work_materials_contract_id", "job_work_materials", ["contract_id"])
    op.create_index("ix_job_work_materials_item_id", "job_work_materials", ["item_id"])

    op.create_table(
        "job_work_material_ledger",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "contract_id", sa.Integer(), sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "material_id", sa.Integer(), sa.ForeignKey("job_work_materials.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("movement_kind", sa.String(16), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("doc_no", sa.String(64), nullable=True),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "movement_kind IN ('RECEIVE','CONSUME','RETURN','ADJUST')",
            name="ck_job_work_mat_ledger_kind",
        ),
        sa.CheckConstraint("qty > 0", name="ck_job_work_mat_ledger_qty_pos"),
    )
    op.create_index("ix_job_work_mat_ledger_tenant_id", "job_work_material_ledger", ["tenant_id"])
    op.create_index("ix_job_work_mat_ledger_contract", "job_work_material_ledger", ["tenant_id", "contract_id"])
    op.create_index("ix_job_work_mat_ledger_material", "job_work_material_ledger", ["tenant_id", "material_id"])
    op.create_index("ix_job_work_mat_ledger_contract_id", "job_work_material_ledger", ["contract_id"])
    op.create_index("ix_job_work_mat_ledger_material_id", "job_work_material_ledger", ["material_id"])
    op.create_index("ix_job_work_mat_ledger_created_by", "job_work_material_ledger", ["created_by_user_id"])

    op.create_table(
        "job_work_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "contract_id", sa.Integer(), sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("delivery_no", sa.String(32), nullable=False),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("reference_doc", sa.String(128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("qty_delivered", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_rejected", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_accepted", sa.String(32), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "delivery_no", name="uq_job_work_deliveries_tenant_no"),
    )
    op.create_index("ix_job_work_deliveries_tenant_id", "job_work_deliveries", ["tenant_id"])
    op.create_index("ix_job_work_deliveries_contract", "job_work_deliveries", ["tenant_id", "contract_id"])
    op.create_index("ix_job_work_deliveries_contract_id", "job_work_deliveries", ["contract_id"])
    op.create_index("ix_job_work_deliveries_created_by", "job_work_deliveries", ["created_by_user_id"])

    op.create_table(
        "job_work_delivery_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "delivery_id", sa.Integer(), sa.ForeignKey("job_work_deliveries.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "deliverable_id",
            sa.Integer(),
            sa.ForeignKey("job_work_deliverables.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("style_ref", sa.String(128), nullable=True),
        sa.Column("color", sa.String(64), nullable=True),
        sa.Column("size", sa.String(32), nullable=True),
        sa.Column("qty_delivered", sa.String(32), nullable=False, server_default="0"),
        sa.Column("qty_rejected", sa.String(32), nullable=False, server_default="0"),
    )
    op.create_index("ix_job_work_delivery_lines_tenant_id", "job_work_delivery_lines", ["tenant_id"])
    op.create_index(
        "ix_job_work_delivery_lines_delivery", "job_work_delivery_lines", ["tenant_id", "delivery_id"]
    )
    op.create_index("ix_job_work_delivery_lines_delivery_id", "job_work_delivery_lines", ["delivery_id"])
    op.create_index("ix_job_work_delivery_lines_deliverable_id", "job_work_delivery_lines", ["deliverable_id"])

    op.create_table(
        "job_work_bills",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "contract_id", sa.Integer(), sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("bill_no", sa.String(32), nullable=False),
        sa.Column("bill_date", sa.Date(), nullable=False),
        sa.Column("qty_billed", sa.String(32), nullable=False, server_default="0"),
        sa.Column("cm_rate", sa.String(32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="BDT"),
        sa.Column("exchange_rate", sa.String(32), nullable=False, server_default="1"),
        sa.Column("vat_rate_pct", sa.String(32), nullable=False, server_default="0"),
        sa.Column("vat_amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("net_amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("gross_amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("amount_received", sa.String(32), nullable=False, server_default="0"),
        sa.Column("status", sa.String(24), nullable=False, server_default="OPEN"),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "reverse_voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "outstanding_bill_id",
            sa.Integer(),
            sa.ForeignKey("outstanding_bills.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "bill_no", name="uq_job_work_bills_tenant_no"),
    )
    op.create_index("ix_job_work_bills_tenant_id", "job_work_bills", ["tenant_id"])
    op.create_index("ix_job_work_bills_contract", "job_work_bills", ["tenant_id", "contract_id"])
    op.create_index("ix_job_work_bills_contract_id", "job_work_bills", ["contract_id"])
    op.create_index("ix_job_work_bills_voucher_id", "job_work_bills", ["voucher_id"])
    op.create_index("ix_job_work_bills_reverse_voucher_id", "job_work_bills", ["reverse_voucher_id"])
    op.create_index("ix_job_work_bills_outstanding_bill_id", "job_work_bills", ["outstanding_bill_id"])
    op.create_index("ix_job_work_bills_created_by", "job_work_bills", ["created_by_user_id"])

    op.create_table(
        "job_work_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column(
            "contract_id", sa.Integer(), sa.ForeignKey("job_work_contracts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("bill_id", sa.Integer(), sa.ForeignKey("job_work_bills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("receipt_no", sa.String(32), nullable=False),
        sa.Column("receipt_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.String(32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="BDT"),
        sa.Column("exchange_rate", sa.String(32), nullable=False, server_default="1"),
        sa.Column(
            "cash_or_bank_account_id",
            sa.Integer(),
            sa.ForeignKey("chart_of_accounts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="POSTED"),
        sa.Column("voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "reverse_voucher_id", sa.Integer(), sa.ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("tenant_id", "receipt_no", name="uq_job_work_receipts_tenant_no"),
    )
    op.create_index("ix_job_work_receipts_tenant_id", "job_work_receipts", ["tenant_id"])
    op.create_index("ix_job_work_receipts_bill", "job_work_receipts", ["tenant_id", "bill_id"])
    op.create_index("ix_job_work_receipts_contract_id", "job_work_receipts", ["contract_id"])
    op.create_index("ix_job_work_receipts_bill_id", "job_work_receipts", ["bill_id"])
    op.create_index("ix_job_work_receipts_account_id", "job_work_receipts", ["cash_or_bank_account_id"])
    op.create_index("ix_job_work_receipts_voucher_id", "job_work_receipts", ["voucher_id"])
    op.create_index("ix_job_work_receipts_reverse_voucher_id", "job_work_receipts", ["reverse_voucher_id"])
    op.create_index("ix_job_work_receipts_created_by", "job_work_receipts", ["created_by_user_id"])

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _disable_rls(table)
        op.drop_table(table)
