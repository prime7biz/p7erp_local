"""Vendor supplier master extensions for Supplier AI readiness.

Revision ID: 131
Revises: 130
Create Date: 2026-03-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "131"
down_revision: Union[str, None] = "130"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("legal_name", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("trade_name", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("website", sa.String(length=512), nullable=True))
    op.add_column("vendors", sa.Column("mobile", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("designation", sa.String(length=128), nullable=True))
    op.add_column("vendors", sa.Column("address_line1", sa.String(length=512), nullable=True))
    op.add_column("vendors", sa.Column("state_or_region", sa.String(length=128), nullable=True))
    op.add_column("vendors", sa.Column("postal_code", sa.String(length=32), nullable=True))
    op.add_column("vendors", sa.Column("registration_number", sa.String(length=128), nullable=True))
    op.add_column("vendors", sa.Column("bank_account_title", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("iban", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("payment_terms", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("incoterms", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("shipping_terms", sa.String(length=255), nullable=True))
    op.add_column("vendors", sa.Column("lead_time_notes", sa.Text(), nullable=True))
    op.add_column("vendors", sa.Column("compliance_status", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("compliance_reference_numbers", sa.Text(), nullable=True))
    op.add_column("vendors", sa.Column("certifications_summary", sa.Text(), nullable=True))
    op.add_column("vendors", sa.Column("onboarding_status", sa.String(length=64), nullable=True))
    op.add_column("vendors", sa.Column("remarks", sa.Text(), nullable=True))
    op.add_column("vendors", sa.Column("internal_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("vendors", "internal_notes")
    op.drop_column("vendors", "remarks")
    op.drop_column("vendors", "onboarding_status")
    op.drop_column("vendors", "certifications_summary")
    op.drop_column("vendors", "compliance_reference_numbers")
    op.drop_column("vendors", "compliance_status")
    op.drop_column("vendors", "lead_time_notes")
    op.drop_column("vendors", "shipping_terms")
    op.drop_column("vendors", "incoterms")
    op.drop_column("vendors", "payment_terms")
    op.drop_column("vendors", "iban")
    op.drop_column("vendors", "bank_account_title")
    op.drop_column("vendors", "registration_number")
    op.drop_column("vendors", "postal_code")
    op.drop_column("vendors", "state_or_region")
    op.drop_column("vendors", "address_line1")
    op.drop_column("vendors", "designation")
    op.drop_column("vendors", "mobile")
    op.drop_column("vendors", "website")
    op.drop_column("vendors", "trade_name")
    op.drop_column("vendors", "legal_name")
