"""System COA: system_code on groups/ledgers, accounting_system_mappings, seed all tenants.

Revision ID: 152
Revises: 151
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.orm import sessionmaker

revision: str = "152"
down_revision: Union[str, None] = "151"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("account_groups", sa.Column("system_code", sa.String(length=64), nullable=True))
    op.add_column("account_groups", sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("account_groups", sa.Column("is_protected", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_index("ix_account_groups_system_code", "account_groups", ["system_code"], unique=False)
    op.create_unique_constraint(
        "uq_account_groups_tenant_system_code",
        "account_groups",
        ["tenant_id", "system_code"],
    )

    op.add_column("chart_of_accounts", sa.Column("system_code", sa.String(length=64), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("chart_of_accounts", sa.Column("is_protected", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("chart_of_accounts", sa.Column("usage_purpose", sa.String(length=128), nullable=True))
    op.add_column("chart_of_accounts", sa.Column("linked_module", sa.String(length=64), nullable=True))
    op.create_index("ix_chart_of_accounts_system_code", "chart_of_accounts", ["system_code"], unique=False)
    op.create_unique_constraint(
        "uq_chart_of_accounts_tenant_system_code",
        "chart_of_accounts",
        ["tenant_id", "system_code"],
    )

    op.create_table(
        "accounting_system_mappings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("mapping_key", sa.String(length=64), nullable=False),
        sa.Column("ledger_id", sa.Integer(), nullable=True),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("module", sa.String(length=64), nullable=True),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ledger_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_id"], ["account_groups.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "mapping_key", name="uq_accounting_system_mappings_tenant_key"),
    )
    op.create_index("ix_accounting_system_mappings_tenant_id", "accounting_system_mappings", ["tenant_id"])
    op.create_index("ix_accounting_system_mappings_mapping_key", "accounting_system_mappings", ["mapping_key"])
    op.create_index("ix_accounting_system_mappings_ledger_id", "accounting_system_mappings", ["ledger_id"])

    bind = op.get_bind()
    Session = sessionmaker(bind=bind)
    session = Session()
    try:
        from app.modules.finance.system_coa_seeding_service import seed_all_tenants_system_coa_sync_session

        seed_all_tenants_system_coa_sync_session(session)
        session.commit()
    finally:
        session.close()

    op.alter_column("account_groups", "is_system", server_default=None)
    op.alter_column("account_groups", "is_protected", server_default=None)
    op.alter_column("chart_of_accounts", "is_system", server_default=None)
    op.alter_column("chart_of_accounts", "is_protected", server_default=None)
    op.alter_column("accounting_system_mappings", "is_locked", server_default=None)
    op.alter_column("accounting_system_mappings", "created_at", server_default=None)
    op.alter_column("accounting_system_mappings", "updated_at", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_accounting_system_mappings_ledger_id", table_name="accounting_system_mappings")
    op.drop_index("ix_accounting_system_mappings_mapping_key", table_name="accounting_system_mappings")
    op.drop_index("ix_accounting_system_mappings_tenant_id", table_name="accounting_system_mappings")
    op.drop_table("accounting_system_mappings")

    op.drop_constraint("uq_chart_of_accounts_tenant_system_code", "chart_of_accounts", type_="unique")
    op.drop_index("ix_chart_of_accounts_system_code", table_name="chart_of_accounts")
    op.drop_column("chart_of_accounts", "linked_module")
    op.drop_column("chart_of_accounts", "usage_purpose")
    op.drop_column("chart_of_accounts", "is_protected")
    op.drop_column("chart_of_accounts", "is_system")
    op.drop_column("chart_of_accounts", "system_code")

    op.drop_constraint("uq_account_groups_tenant_system_code", "account_groups", type_="unique")
    op.drop_index("ix_account_groups_system_code", table_name="account_groups")
    op.drop_column("account_groups", "is_protected")
    op.drop_column("account_groups", "is_system")
    op.drop_column("account_groups", "system_code")
