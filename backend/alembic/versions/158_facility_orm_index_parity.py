"""Facility tables: add FK/index parity with SQLAlchemy models (migration 151 follow-up).

Revision ID: 158
Revises: 157
"""

from typing import Sequence, Union

from alembic import op


revision: str = "158"
down_revision: Union[str, None] = "157"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # facilities — link + GL + bank FKs (ORM index=True)
    op.create_index(
        "ix_facilities_linked_master_contract_id",
        "facilities",
        ["linked_master_contract_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_linked_btb_lc_id",
        "facilities",
        ["linked_btb_lc_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_gl_liability_account_id",
        "facilities",
        ["gl_liability_account_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_gl_interest_expense_account_id",
        "facilities",
        ["gl_interest_expense_account_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_gl_interest_payable_account_id",
        "facilities",
        ["gl_interest_payable_account_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_gl_penalty_expense_account_id",
        "facilities",
        ["gl_penalty_expense_account_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_linked_bank_account_id",
        "facilities",
        ["linked_bank_account_id"],
        unique=False,
    )
    op.create_index(
        "ix_facilities_repayment_source_account_id",
        "facilities",
        ["repayment_source_account_id"],
        unique=False,
    )
    op.create_index("ix_facilities_created_by", "facilities", ["created_by"], unique=False)

    # facility_utilizations
    op.create_index(
        "ix_facility_utilizations_utilization_type",
        "facility_utilizations",
        ["utilization_type"],
        unique=False,
    )
    op.create_index(
        "ix_facility_utilizations_repayment_policy",
        "facility_utilizations",
        ["repayment_policy"],
        unique=False,
    )
    op.create_index(
        "ix_facility_utilizations_linked_btb_lc_id",
        "facility_utilizations",
        ["linked_btb_lc_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_utilizations_linked_purchase_order_id",
        "facility_utilizations",
        ["linked_purchase_order_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_utilizations_disbursement_voucher_id",
        "facility_utilizations",
        ["disbursement_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_utilizations_created_by",
        "facility_utilizations",
        ["created_by"],
        unique=False,
    )

    # repayment_schedule_lines — voucher FKs
    op.create_index(
        "ix_repayment_schedule_lines_payment_voucher_id",
        "repayment_schedule_lines",
        ["payment_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_repayment_schedule_lines_draft_voucher_id",
        "repayment_schedule_lines",
        ["draft_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_repayment_schedule_lines_penalty_voucher_id",
        "repayment_schedule_lines",
        ["penalty_voucher_id"],
        unique=False,
    )

    # interest_accruals — standalone util id + voucher lookups
    op.create_index(
        "ix_interest_accruals_facility_utilization_id",
        "interest_accruals",
        ["facility_utilization_id"],
        unique=False,
    )
    op.create_index(
        "ix_interest_accruals_journal_voucher_id",
        "interest_accruals",
        ["journal_voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_interest_accruals_reversal_voucher_id",
        "interest_accruals",
        ["reversal_voucher_id"],
        unique=False,
    )

    # facility_transactions
    op.create_index(
        "ix_facility_transactions_facility_utilization_id",
        "facility_transactions",
        ["facility_utilization_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_transactions_voucher_id",
        "facility_transactions",
        ["voucher_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_transactions_created_by",
        "facility_transactions",
        ["created_by"],
        unique=False,
    )

    # repayment_allocations — only tenant_id was indexed in 151
    op.create_index(
        "ix_repayment_allocations_facility_utilization_id",
        "repayment_allocations",
        ["facility_utilization_id"],
        unique=False,
    )
    op.create_index(
        "ix_repayment_allocations_repayment_schedule_line_id",
        "repayment_allocations",
        ["repayment_schedule_line_id"],
        unique=False,
    )
    op.create_index(
        "ix_repayment_allocations_voucher_id",
        "repayment_allocations",
        ["voucher_id"],
        unique=False,
    )

    # facility_snapshots
    op.create_index(
        "ix_facility_snapshots_facility_id",
        "facility_snapshots",
        ["facility_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_snapshots_facility_utilization_id",
        "facility_snapshots",
        ["facility_utilization_id"],
        unique=False,
    )
    op.create_index(
        "ix_facility_snapshots_generated_by_user_id",
        "facility_snapshots",
        ["generated_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_facility_snapshots_generated_by_user_id", table_name="facility_snapshots")
    op.drop_index("ix_facility_snapshots_facility_utilization_id", table_name="facility_snapshots")
    op.drop_index("ix_facility_snapshots_facility_id", table_name="facility_snapshots")

    op.drop_index("ix_repayment_allocations_voucher_id", table_name="repayment_allocations")
    op.drop_index(
        "ix_repayment_allocations_repayment_schedule_line_id",
        table_name="repayment_allocations",
    )
    op.drop_index(
        "ix_repayment_allocations_facility_utilization_id",
        table_name="repayment_allocations",
    )

    op.drop_index("ix_facility_transactions_created_by", table_name="facility_transactions")
    op.drop_index("ix_facility_transactions_voucher_id", table_name="facility_transactions")
    op.drop_index(
        "ix_facility_transactions_facility_utilization_id",
        table_name="facility_transactions",
    )

    op.drop_index("ix_interest_accruals_reversal_voucher_id", table_name="interest_accruals")
    op.drop_index("ix_interest_accruals_journal_voucher_id", table_name="interest_accruals")
    op.drop_index(
        "ix_interest_accruals_facility_utilization_id",
        table_name="interest_accruals",
    )

    op.drop_index(
        "ix_repayment_schedule_lines_penalty_voucher_id",
        table_name="repayment_schedule_lines",
    )
    op.drop_index(
        "ix_repayment_schedule_lines_draft_voucher_id",
        table_name="repayment_schedule_lines",
    )
    op.drop_index(
        "ix_repayment_schedule_lines_payment_voucher_id",
        table_name="repayment_schedule_lines",
    )

    op.drop_index("ix_facility_utilizations_created_by", table_name="facility_utilizations")
    op.drop_index(
        "ix_facility_utilizations_disbursement_voucher_id",
        table_name="facility_utilizations",
    )
    op.drop_index(
        "ix_facility_utilizations_linked_purchase_order_id",
        table_name="facility_utilizations",
    )
    op.drop_index(
        "ix_facility_utilizations_linked_btb_lc_id",
        table_name="facility_utilizations",
    )
    op.drop_index(
        "ix_facility_utilizations_repayment_policy",
        table_name="facility_utilizations",
    )
    op.drop_index(
        "ix_facility_utilizations_utilization_type",
        table_name="facility_utilizations",
    )

    op.drop_index("ix_facilities_created_by", table_name="facilities")
    op.drop_index(
        "ix_facilities_repayment_source_account_id",
        table_name="facilities",
    )
    op.drop_index("ix_facilities_linked_bank_account_id", table_name="facilities")
    op.drop_index(
        "ix_facilities_gl_penalty_expense_account_id",
        table_name="facilities",
    )
    op.drop_index(
        "ix_facilities_gl_interest_payable_account_id",
        table_name="facilities",
    )
    op.drop_index(
        "ix_facilities_gl_interest_expense_account_id",
        table_name="facilities",
    )
    op.drop_index(
        "ix_facilities_gl_liability_account_id",
        table_name="facilities",
    )
    op.drop_index("ix_facilities_linked_btb_lc_id", table_name="facilities")
    op.drop_index("ix_facilities_linked_master_contract_id", table_name="facilities")
