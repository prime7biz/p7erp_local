"""Add commercial tables: export_cases, proforma_invoices, btb_lcs

Revision ID: 039
Revises: 038
Create Date: 2026-03-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "039"
down_revision: Union[str, None] = "038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "export_cases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("case_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_export_cases_tenant_id", "export_cases", ["tenant_id"])
    op.create_index("ix_export_cases_reference", "export_cases", ["reference"])
    op.create_index("ix_export_cases_status", "export_cases", ["status"])

    op.create_table(
        "proforma_invoices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("invoice_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_proforma_invoices_tenant_id", "proforma_invoices", ["tenant_id"])
    op.create_index("ix_proforma_invoices_reference", "proforma_invoices", ["reference"])
    op.create_index("ix_proforma_invoices_status", "proforma_invoices", ["status"])

    op.create_table(
        "btb_lcs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("reference", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("lc_date", sa.Date(), nullable=True),
        sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_btb_lcs_tenant_id", "btb_lcs", ["tenant_id"])
    op.create_index("ix_btb_lcs_reference", "btb_lcs", ["reference"])
    op.create_index("ix_btb_lcs_status", "btb_lcs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_btb_lcs_status", "btb_lcs")
    op.drop_index("ix_btb_lcs_reference", "btb_lcs")
    op.drop_index("ix_btb_lcs_tenant_id", "btb_lcs")
    op.drop_table("btb_lcs")

    op.drop_index("ix_proforma_invoices_status", "proforma_invoices")
    op.drop_index("ix_proforma_invoices_reference", "proforma_invoices")
    op.drop_index("ix_proforma_invoices_tenant_id", "proforma_invoices")
    op.drop_table("proforma_invoices")

    op.drop_index("ix_export_cases_status", "export_cases")
    op.drop_index("ix_export_cases_reference", "export_cases")
    op.drop_index("ix_export_cases_tenant_id", "export_cases")
    op.drop_table("export_cases")
