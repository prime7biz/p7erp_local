"""Trade case, logistics shipments, and trade documents.

Revision ID: 072
Revises: 071
Create Date: 2026-03-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "072"
down_revision: Union[str, None] = "071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trade_cases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False, server_default="EXPORT"),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("current_stage", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("proforma_invoice_id", sa.Integer(), nullable=True),
        sa.Column("master_contract_id", sa.Integer(), nullable=True),
        sa.Column("btb_lc_id", sa.Integer(), nullable=True),
        sa.Column("etd", sa.Date(), nullable=True),
        sa.Column("eta", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("cost_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("margin_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("margin_pct", sa.Numeric(18, 4), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proforma_invoice_id"], ["proforma_invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["master_contract_id"], ["master_contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["btb_lc_id"], ["btb_lcs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_trade_cases_tenant_id", "trade_cases", ["tenant_id"])
    op.create_index("ix_trade_cases_direction", "trade_cases", ["direction"])
    op.create_index("ix_trade_cases_reference", "trade_cases", ["reference"])
    op.create_index("ix_trade_cases_status", "trade_cases", ["status"])
    op.create_index("ix_trade_cases_current_stage", "trade_cases", ["current_stage"])
    op.create_index("ix_trade_cases_order_id", "trade_cases", ["order_id"])
    op.create_index("ix_trade_cases_customer_id", "trade_cases", ["customer_id"])
    op.create_index("ix_trade_cases_vendor_id", "trade_cases", ["vendor_id"])
    op.create_index("ix_trade_cases_proforma_invoice_id", "trade_cases", ["proforma_invoice_id"])
    op.create_index("ix_trade_cases_master_contract_id", "trade_cases", ["master_contract_id"])
    op.create_index("ix_trade_cases_btb_lc_id", "trade_cases", ["btb_lc_id"])

    op.create_table(
        "trade_case_stages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("stage_key", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("required_doc_types", sa.JSON(), nullable=True),
        sa.Column("next_stage_keys", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_trade_case_stages_tenant_id", "trade_case_stages", ["tenant_id"])
    op.create_index("ix_trade_case_stages_stage_key", "trade_case_stages", ["stage_key"])

    op.create_table(
        "trade_case_stage_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("trade_case_id", sa.Integer(), nullable=False),
        sa.Column("from_stage", sa.String(length=32), nullable=True),
        sa.Column("to_stage", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_case_id"], ["trade_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_trade_case_stage_log_tenant_id", "trade_case_stage_log", ["tenant_id"])
    op.create_index("ix_trade_case_stage_log_trade_case_id", "trade_case_stage_log", ["trade_case_id"])
    op.create_index("ix_trade_case_stage_log_user_id", "trade_case_stage_log", ["user_id"])

    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("trade_case_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="PLANNED"),
        sa.Column("carrier", sa.String(length=255), nullable=True),
        sa.Column("booking_ref", sa.String(length=128), nullable=True),
        sa.Column("bl_awb", sa.String(length=128), nullable=True),
        sa.Column("etd", sa.Date(), nullable=True),
        sa.Column("eta", sa.Date(), nullable=True),
        sa.Column("origin_port", sa.String(length=255), nullable=True),
        sa.Column("dest_port", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_case_id"], ["trade_cases.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_shipments_tenant_id", "shipments", ["tenant_id"])
    op.create_index("ix_shipments_trade_case_id", "shipments", ["trade_case_id"])
    op.create_index("ix_shipments_reference", "shipments", ["reference"])
    op.create_index("ix_shipments_status", "shipments", ["status"])
    op.create_index("ix_shipments_booking_ref", "shipments", ["booking_ref"])
    op.create_index("ix_shipments_bl_awb", "shipments", ["bl_awb"])

    op.create_table(
        "trade_documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("trade_case_id", sa.Integer(), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=True),
        sa.Column("document_type", sa.String(length=64), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=512), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("linked_entity_type", sa.String(length=64), nullable=True),
        sa.Column("linked_entity_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trade_case_id"], ["trade_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_trade_documents_tenant_id", "trade_documents", ["tenant_id"])
    op.create_index("ix_trade_documents_trade_case_id", "trade_documents", ["trade_case_id"])
    op.create_index("ix_trade_documents_shipment_id", "trade_documents", ["shipment_id"])
    op.create_index("ix_trade_documents_document_type", "trade_documents", ["document_type"])
    op.create_index("ix_trade_documents_uploaded_by_id", "trade_documents", ["uploaded_by_id"])

    op.add_column("export_cases", sa.Column("trade_case_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_export_cases_trade_case_id",
        "export_cases",
        "trade_cases",
        ["trade_case_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_export_cases_trade_case_id", "export_cases", ["trade_case_id"])


def downgrade() -> None:
    op.drop_index("ix_export_cases_trade_case_id", table_name="export_cases")
    op.drop_constraint("fk_export_cases_trade_case_id", "export_cases", type_="foreignkey")
    op.drop_column("export_cases", "trade_case_id")

    op.drop_index("ix_trade_documents_uploaded_by_id", table_name="trade_documents")
    op.drop_index("ix_trade_documents_document_type", table_name="trade_documents")
    op.drop_index("ix_trade_documents_shipment_id", table_name="trade_documents")
    op.drop_index("ix_trade_documents_trade_case_id", table_name="trade_documents")
    op.drop_index("ix_trade_documents_tenant_id", table_name="trade_documents")
    op.drop_table("trade_documents")

    op.drop_index("ix_shipments_bl_awb", table_name="shipments")
    op.drop_index("ix_shipments_booking_ref", table_name="shipments")
    op.drop_index("ix_shipments_status", table_name="shipments")
    op.drop_index("ix_shipments_reference", table_name="shipments")
    op.drop_index("ix_shipments_trade_case_id", table_name="shipments")
    op.drop_index("ix_shipments_tenant_id", table_name="shipments")
    op.drop_table("shipments")

    op.drop_index("ix_trade_case_stage_log_user_id", table_name="trade_case_stage_log")
    op.drop_index("ix_trade_case_stage_log_trade_case_id", table_name="trade_case_stage_log")
    op.drop_index("ix_trade_case_stage_log_tenant_id", table_name="trade_case_stage_log")
    op.drop_table("trade_case_stage_log")

    op.drop_index("ix_trade_case_stages_stage_key", table_name="trade_case_stages")
    op.drop_index("ix_trade_case_stages_tenant_id", table_name="trade_case_stages")
    op.drop_table("trade_case_stages")

    op.drop_index("ix_trade_cases_btb_lc_id", table_name="trade_cases")
    op.drop_index("ix_trade_cases_master_contract_id", table_name="trade_cases")
    op.drop_index("ix_trade_cases_proforma_invoice_id", table_name="trade_cases")
    op.drop_index("ix_trade_cases_vendor_id", table_name="trade_cases")
    op.drop_index("ix_trade_cases_customer_id", table_name="trade_cases")
    op.drop_index("ix_trade_cases_order_id", table_name="trade_cases")
    op.drop_index("ix_trade_cases_current_stage", table_name="trade_cases")
    op.drop_index("ix_trade_cases_status", table_name="trade_cases")
    op.drop_index("ix_trade_cases_reference", table_name="trade_cases")
    op.drop_index("ix_trade_cases_direction", table_name="trade_cases")
    op.drop_index("ix_trade_cases_tenant_id", table_name="trade_cases")
    op.drop_table("trade_cases")
