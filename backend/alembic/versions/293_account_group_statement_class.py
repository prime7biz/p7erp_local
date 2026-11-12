"""account_groups.statement_class (nullable) + deterministic backfill (finance statements, PLAN 2A).

Phase 1 of the phased change: add a nullable column, add the allowlist check as NOT VALID, backfill only
exact matches, then validate the check. The column stays nullable on purpose: NULL means "Unclassified"
and is shown as such in the statements. Nothing is renamed or dropped. No new RLS policy is needed
(existing tenant table).

Backfill rules (only rows whose statement_class is still NULL):
- system groups: exact `system_code` match (map below; mixed groups such as CASH_AND_BANK stay NULL);
- the 10 groups created by POST /finance/account-groups/seed have no system_code, so they match on exact
  `code` AND the expected `nature`; "Loans (Liability)" stays NULL (long/short/OD cannot be told apart).

Rollback: `alembic downgrade 292` drops the check and the column (classification choices are lost; export
them first with GET /finance/account-groups if they matter).

Revision ID: 293
Revises: 292
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "293"
down_revision: Union[str, None] = "292"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECK_NAME = "ck_account_groups_statement_class"

ALLOWED = (
    "CAPITAL_ACCOUNT",
    "LONG_TERM_LOANS",
    "SHORT_TERM_BORROWINGS",
    "BANK_OD",
    "CURRENT_LIABILITIES",
    "SUNDRY_CREDITORS",
    "FIXED_ASSETS",
    "INVESTMENTS",
    "CURRENT_ASSETS",
    "SUNDRY_DEBTORS",
    "CASH_IN_HAND",
    "BANK_ACCOUNTS",
    "STOCK_IN_HAND",
    "SALES_ACCOUNTS",
    "PURCHASE_ACCOUNTS",
    "DIRECT_INCOMES",
    "DIRECT_EXPENSES",
    "INDIRECT_INCOMES",
    "INDIRECT_EXPENSES",
    "COGS",
)

# Frozen copy of SYSTEM_GROUP_STATEMENT_CLASS (app/modules/finance/system_coa_templates.py).
# tests/test_finance_statements_core.py fails if the two drift apart.
SYSTEM_CODE_CLASS = {
    "TRADE_RECEIVABLES": "SUNDRY_DEBTORS",
    "OTHER_RECEIVABLES": "CURRENT_ASSETS",
    "ADVANCES_AND_DEPOSITS": "CURRENT_ASSETS",
    "INVENTORY_GROUP": "STOCK_IN_HAND",
    "GOODS_IN_TRANSIT": "CURRENT_ASSETS",
    "IMPORT_PURCHASE_CLEARING": "CURRENT_ASSETS",
    "PREPAID_EXPENSES": "CURRENT_ASSETS",
    "TAX_RECEIVABLES_RECOVERABLE": "CURRENT_ASSETS",
    "TRADE_PAYABLES": "SUNDRY_CREDITORS",
    "ACCOUNTS_PAYABLE": "SUNDRY_CREDITORS",
    "ACCRUED_EXPENSES": "CURRENT_LIABILITIES",
    "PAYROLL_LIABILITIES": "CURRENT_LIABILITIES",
    "TAX_AND_VAT_PAYABLES": "CURRENT_LIABILITIES",
    "STATUTORY_DEDUCTIONS_PAYABLE": "CURRENT_LIABILITIES",
    "UTILITY_PAYABLES": "CURRENT_LIABILITIES",
    "SHORT_TERM_BORROWINGS": "SHORT_TERM_BORROWINGS",
    "CURRENT_PORTION_LTD": "CURRENT_LIABILITIES",
    "LC_BTB_LIABILITIES": "CURRENT_LIABILITIES",
    "GRNI_RECEIPT_CLEARING": "CURRENT_LIABILITIES",
    "TERM_LOANS": "LONG_TERM_LOANS",
    "LONG_TERM_BORROWINGS": "LONG_TERM_LOANS",
    "RAW_MATERIAL_COGS": "COGS",
    "DIRECT_WAGES": "DIRECT_EXPENSES",
    "FACTORY_UTILITIES": "DIRECT_EXPENSES",
    "DIRECT_PRODUCTION_COST": "DIRECT_EXPENSES",
    "IMPORT_COST_ADJUSTMENT": "DIRECT_EXPENSES",
    "WASTAGE_PROCESS_LOSS": "DIRECT_EXPENSES",
    "FACTORY_OVERHEAD": "DIRECT_EXPENSES",
    "ADMIN_EXPENSE": "INDIRECT_EXPENSES",
    "SELLING_DISTRIBUTION": "INDIRECT_EXPENSES",
    "GENERAL_EXPENSES": "INDIRECT_EXPENSES",
    "OFFICE_UTILITY_EXPENSES": "INDIRECT_EXPENSES",
    "TRAVEL_CONVEYANCE": "INDIRECT_EXPENSES",
    "COMMUNICATION_INTERNET": "INDIRECT_EXPENSES",
    "REPAIR_MAINTENANCE": "INDIRECT_EXPENSES",
    "FINANCE_COSTS": "INDIRECT_EXPENSES",
    "INTEREST_EXPENSE_GROUP": "INDIRECT_EXPENSES",
    "LC_COMMISSION_GROUP": "INDIRECT_EXPENSES",
    "BANK_CHARGES_GROUP": "INDIRECT_EXPENSES",
    "SALES_REVENUE": "SALES_ACCOUNTS",
    "OTHER_INCOME": "INDIRECT_INCOMES",
    "NON_OPERATING_INCOME": "INDIRECT_INCOMES",
}

# (code, lower-case nature, class) for groups seeded by POST /finance/account-groups/seed.
TALLY_SEED_CODE_CLASS = (
    ("CAPITAL", "equity", "CAPITAL_ACCOUNT"),
    ("CURRENT_LIABILITIES", "liability", "CURRENT_LIABILITIES"),
    ("CURRENT_ASSETS", "asset", "CURRENT_ASSETS"),
    ("FIXED_ASSETS", "asset", "FIXED_ASSETS"),
    ("INVESTMENTS", "asset", "INVESTMENTS"),
    ("DIRECT_EXPENSES", "expense", "DIRECT_EXPENSES"),
    ("INDIRECT_EXPENSES", "expense", "INDIRECT_EXPENSES"),
    ("DIRECT_INCOME", "income", "DIRECT_INCOMES"),
    ("INDIRECT_INCOME", "income", "INDIRECT_INCOMES"),
)


def upgrade() -> None:
    op.add_column("account_groups", sa.Column("statement_class", sa.String(length=40), nullable=True))

    allowed_sql = ", ".join(f"'{c}'" for c in ALLOWED)
    op.execute(
        f"ALTER TABLE account_groups ADD CONSTRAINT {CHECK_NAME} "
        f"CHECK (statement_class IS NULL OR statement_class IN ({allowed_sql})) NOT VALID"
    )

    bind = op.get_bind()
    for system_code, cls in SYSTEM_CODE_CLASS.items():
        bind.execute(
            sa.text(
                "UPDATE account_groups SET statement_class = :cls "
                "WHERE system_code = :sc AND statement_class IS NULL"
            ),
            {"cls": cls, "sc": system_code},
        )
    for code, nature, cls in TALLY_SEED_CODE_CLASS:
        bind.execute(
            sa.text(
                "UPDATE account_groups SET statement_class = :cls "
                "WHERE system_code IS NULL AND code = :code AND lower(nature) = :nature "
                "AND statement_class IS NULL"
            ),
            {"cls": cls, "code": code, "nature": nature},
        )

    op.execute(f"ALTER TABLE account_groups VALIDATE CONSTRAINT {CHECK_NAME}")


def downgrade() -> None:
    op.execute(f"ALTER TABLE account_groups DROP CONSTRAINT IF EXISTS {CHECK_NAME}")
    op.drop_column("account_groups", "statement_class")
