"""HR enterprise: sections, employee category, overtime, bonuses, advances, compliance, payroll extras.

Revision ID: 089
Revises: 088
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "089"
down_revision: Union[str, None] = "088"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hr_sections",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("section_type", sa.String(length=24), nullable=False, server_default="SECTION"),
        sa.Column("parent_section_id", sa.Integer(), nullable=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("head_employee_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_section_id"], ["hr_sections.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["department_id"], ["hr_departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["head_employee_id"], ["hr_employees.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_sections_tenant_code"),
    )
    op.create_index("ix_hr_sections_tenant_id", "hr_sections", ["tenant_id"])
    op.create_index("ix_hr_sections_parent_section_id", "hr_sections", ["parent_section_id"])
    op.create_index("ix_hr_sections_department_id", "hr_sections", ["department_id"])

    op.add_column("hr_employees", sa.Column("employee_category", sa.String(length=24), nullable=True))
    op.add_column(
        "hr_employees",
        sa.Column("section_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_hr_employees_section_id",
        "hr_employees",
        "hr_sections",
        ["section_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_hr_employees_section_id", "hr_employees", ["section_id"])

    op.add_column("hr_payroll_components", sa.Column("formula", sa.Text(), nullable=True))
    op.add_column(
        "hr_payroll_components",
        sa.Column("applies_to", sa.String(length=16), nullable=False, server_default="ALL"),
    )

    op.add_column(
        "hr_payroll_run_lines",
        sa.Column("overtime_amount", sa.String(length=16), nullable=False, server_default="0"),
    )

    op.create_table(
        "hr_overtime_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("employee_category", sa.String(length=24), nullable=True),
        sa.Column("max_ot_hours_per_day", sa.String(length=16), nullable=True),
        sa.Column("weekday_multiplier", sa.String(length=16), nullable=False, server_default="1.5"),
        sa.Column("weekend_multiplier", sa.String(length=16), nullable=False, server_default="2"),
        sa.Column("holiday_multiplier", sa.String(length=16), nullable=False, server_default="2"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("tenant_id", "code", name="uq_hr_overtime_rules_tenant_code"),
    )
    op.create_index("ix_hr_overtime_rules_tenant_id", "hr_overtime_rules", ["tenant_id"])

    op.create_table(
        "hr_overtime_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("ot_hours", sa.String(length=16), nullable=False, server_default="0"),
        sa.Column("ot_type", sa.String(length=24), nullable=False, server_default="WEEKDAY"),
        sa.Column("rate_multiplier", sa.String(length=16), nullable=False, server_default="1.5"),
        sa.Column("amount", sa.String(length=16), nullable=True),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="PENDING"),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rule_id"], ["hr_overtime_rules.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_overtime_entries_tenant_id", "hr_overtime_entries", ["tenant_id"])
    op.create_index("ix_hr_overtime_entries_employee_id", "hr_overtime_entries", ["employee_id"])
    op.create_index("ix_hr_overtime_entries_work_date", "hr_overtime_entries", ["work_date"])

    op.create_table(
        "hr_bonus_declarations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("bonus_type", sa.String(length=32), nullable=False),
        sa.Column("period_code", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("eligibility_criteria", sa.JSON(), nullable=True),
        sa.Column("amount_or_pct", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="DRAFT"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_hr_bonus_declarations_tenant_id", "hr_bonus_declarations", ["tenant_id"])

    op.create_table(
        "hr_employee_advances",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("advance_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.String(length=24), nullable=False),
        sa.Column("monthly_deduction", sa.String(length=24), nullable=False),
        sa.Column("total_recovered", sa.String(length=24), nullable=False, server_default="0"),
        sa.Column("outstanding", sa.String(length=24), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="ACTIVE"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("disbursement_voucher_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["disbursement_voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_hr_employee_advances_tenant_id", "hr_employee_advances", ["tenant_id"])
    op.create_index("ix_hr_employee_advances_employee_id", "hr_employee_advances", ["employee_id"])

    op.create_table(
        "hr_payroll_accounting_config",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("salary_expense_account_id", sa.Integer(), nullable=True),
        sa.Column("salary_payable_account_id", sa.Integer(), nullable=True),
        sa.Column("bank_account_id", sa.Integer(), nullable=True),
        sa.Column("cash_account_id", sa.Integer(), nullable=True),
        sa.Column("tax_payable_account_id", sa.Integer(), nullable=True),
        sa.Column("pf_payable_account_id", sa.Integer(), nullable=True),
        sa.Column("advance_receivable_account_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["salary_expense_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["salary_payable_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["bank_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["cash_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tax_payable_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["pf_payable_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["advance_receivable_account_id"], ["chart_of_accounts.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("tenant_id", name="uq_hr_payroll_accounting_config_tenant"),
    )

    op.create_table(
        "hr_compliance_checks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("check_type", sa.String(length=48), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="OPEN"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["hr_employees.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_hr_compliance_checks_tenant_id", "hr_compliance_checks", ["tenant_id"])
    op.create_index("ix_hr_compliance_checks_employee_id", "hr_compliance_checks", ["employee_id"])


def downgrade() -> None:
    op.drop_index("ix_hr_compliance_checks_employee_id", table_name="hr_compliance_checks")
    op.drop_index("ix_hr_compliance_checks_tenant_id", table_name="hr_compliance_checks")
    op.drop_table("hr_compliance_checks")

    op.drop_table("hr_payroll_accounting_config")

    op.drop_index("ix_hr_employee_advances_employee_id", table_name="hr_employee_advances")
    op.drop_index("ix_hr_employee_advances_tenant_id", table_name="hr_employee_advances")
    op.drop_table("hr_employee_advances")

    op.drop_index("ix_hr_bonus_declarations_tenant_id", table_name="hr_bonus_declarations")
    op.drop_table("hr_bonus_declarations")

    op.drop_index("ix_hr_overtime_entries_work_date", table_name="hr_overtime_entries")
    op.drop_index("ix_hr_overtime_entries_employee_id", table_name="hr_overtime_entries")
    op.drop_index("ix_hr_overtime_entries_tenant_id", table_name="hr_overtime_entries")
    op.drop_table("hr_overtime_entries")

    op.drop_index("ix_hr_overtime_rules_tenant_id", table_name="hr_overtime_rules")
    op.drop_table("hr_overtime_rules")

    op.drop_column("hr_payroll_run_lines", "overtime_amount")

    op.drop_column("hr_payroll_components", "applies_to")
    op.drop_column("hr_payroll_components", "formula")

    op.drop_index("ix_hr_employees_section_id", table_name="hr_employees")
    op.drop_constraint("fk_hr_employees_section_id", "hr_employees", type_="foreignkey")
    op.drop_column("hr_employees", "section_id")
    op.drop_column("hr_employees", "employee_category")

    op.drop_index("ix_hr_sections_department_id", table_name="hr_sections")
    op.drop_index("ix_hr_sections_parent_section_id", table_name="hr_sections")
    op.drop_index("ix_hr_sections_tenant_id", table_name="hr_sections")
    op.drop_table("hr_sections")
