"""System chart-of-accounts templates (Bangladesh garment / trade ERP).

Seeded per tenant with INSERT-if-missing only. Posting logic resolves ledgers by mapping_key / system_code.
"""

from __future__ import annotations

from typing import TypedDict


class SystemGroupTemplate(TypedDict, total=False):
    system_code: str
    name: str
    code: str
    nature: str
    sort_order: int
    affects_gross_profit: bool
    is_bank_group: bool
    default_normal_balance: str
    allow_posting: bool
    is_summary_group: bool
    description: str


class SystemLedgerTemplate(TypedDict, total=False):
    system_code: str
    name: str
    group_system_code: str
    normal_balance: str
    module: str
    usage_purpose: str


def _nb_for_nature(nature: str) -> str:
    if nature in ("Liability", "Equity", "Income"):
        return "credit"
    return "debit"


def _g(
    system_code: str,
    name: str,
    nature: str,
    sort_order: int,
    *,
    affects_gross_profit: bool = False,
    is_bank_group: bool = False,
    default_normal_balance: str | None = None,
    allow_posting: bool = True,
    is_summary_group: bool = False,
    description: str = "",
) -> SystemGroupTemplate:
    nb = default_normal_balance or _nb_for_nature(nature)
    # Prefix avoids collisions with tenant default groups (CAPITAL, CURRENT_ASSETS, …)
    code = ("SC_" + system_code)[:32]
    return {
        "system_code": system_code,
        "name": name,
        "code": code,
        "nature": nature,
        "sort_order": sort_order,
        "affects_gross_profit": affects_gross_profit,
        "is_bank_group": is_bank_group,
        "default_normal_balance": nb,
        "allow_posting": allow_posting,
        "is_summary_group": is_summary_group,
        "description": description or f"System group: {name}",
    }


def _l(
    system_code: str,
    name: str,
    group_system_code: str,
    *,
    normal_balance: str | None = None,
    module: str = "GENERAL",
    usage_purpose: str = "",
) -> SystemLedgerTemplate:
    return {
        "system_code": system_code,
        "name": name,
        "group_system_code": group_system_code,
        "normal_balance": normal_balance or "",
        "module": module,
        "usage_purpose": usage_purpose or name,
    }


# --- Account groups (flat; parent_group_id left NULL) ---
SYSTEM_ACCOUNT_GROUPS: list[SystemGroupTemplate] = [
    _g("CASH_AND_BANK", "Cash and Bank", "Asset", 10, is_bank_group=True),
    _g("TRADE_RECEIVABLES", "Trade Receivables", "Asset", 20),
    _g("OTHER_RECEIVABLES", "Other Receivables", "Asset", 30),
    _g("ADVANCES_AND_DEPOSITS", "Advances and Deposits", "Asset", 40),
    _g("INVENTORY_GROUP", "Inventory", "Asset", 50),
    _g("GOODS_IN_TRANSIT", "Goods in Transit", "Asset", 60),
    _g("IMPORT_PURCHASE_CLEARING", "Import / Purchase Clearing", "Asset", 70),
    _g("PREPAID_EXPENSES", "Prepaid Expenses", "Asset", 80),
    _g("TAX_RECEIVABLES_RECOVERABLE", "Tax Receivables / Recoverable Taxes", "Asset", 90),
    _g("TRADE_PAYABLES", "Trade Payables", "Liability", 100),
    _g("ACCOUNTS_PAYABLE", "Accounts Payable", "Liability", 110),
    _g("ACCRUED_EXPENSES", "Accrued Expenses", "Liability", 120),
    _g("PAYROLL_LIABILITIES", "Payroll Liabilities", "Liability", 130),
    _g("TAX_AND_VAT_PAYABLES", "Tax and VAT Payables", "Liability", 140),
    _g("STATUTORY_DEDUCTIONS_PAYABLE", "Statutory Deductions Payable", "Liability", 150),
    _g("UTILITY_PAYABLES", "Utility Payables", "Liability", 160),
    _g("SHORT_TERM_BORROWINGS", "Short-Term Borrowings", "Liability", 170),
    _g("CURRENT_PORTION_LTD", "Current Portion of Long-Term Debt", "Liability", 180),
    _g("TRADE_FINANCE_LIABILITIES", "Trade Finance Liabilities", "Liability", 190),
    _g("LC_BTB_LIABILITIES", "LC / BTB Liabilities", "Liability", 200),
    _g("GRNI_RECEIPT_CLEARING", "GRNI / Receipt Clearing", "Liability", 210),
    _g("TERM_LOANS", "Term Loans", "Liability", 220),
    _g("LONG_TERM_BORROWINGS", "Long-Term Borrowings", "Liability", 230),
    _g("DEFERRED_LIABILITIES", "Deferred Liabilities", "Liability", 240),
    _g("RAW_MATERIAL_COGS", "Raw Material Consumption (COGS)", "Expense", 300, affects_gross_profit=True),
    _g("DIRECT_WAGES", "Direct Wages", "Expense", 310, affects_gross_profit=True),
    _g("FACTORY_UTILITIES", "Factory Utilities", "Expense", 320, affects_gross_profit=True),
    _g("DIRECT_PRODUCTION_COST", "Direct Production Cost", "Expense", 330, affects_gross_profit=True),
    _g("IMPORT_COST_ADJUSTMENT", "Import Cost Adjustment", "Expense", 340, affects_gross_profit=True),
    _g("WASTAGE_PROCESS_LOSS", "Wastage and Process Loss", "Expense", 350, affects_gross_profit=True),
    _g("FACTORY_OVERHEAD", "Factory Overhead", "Expense", 360, affects_gross_profit=True),
    _g("ADMIN_EXPENSE", "Administrative Expenses", "Expense", 400),
    _g("SELLING_DISTRIBUTION", "Selling and Distribution Expenses", "Expense", 410),
    _g("GENERAL_EXPENSES", "General Expenses", "Expense", 420),
    _g("OFFICE_UTILITY_EXPENSES", "Office and Utility Expenses", "Expense", 430),
    _g("TRAVEL_CONVEYANCE", "Travel and Conveyance", "Expense", 440),
    _g("COMMUNICATION_INTERNET", "Communication and Internet", "Expense", 450),
    _g("REPAIR_MAINTENANCE", "Repair and Maintenance", "Expense", 460),
    _g("FINANCE_COSTS", "Finance Costs", "Expense", 470),
    _g("INTEREST_EXPENSE_GROUP", "Interest Expense", "Expense", 480),
    _g("LC_COMMISSION_GROUP", "LC Commission", "Expense", 490),
    _g("BANK_CHARGES_GROUP", "Bank Charges", "Expense", 500),
    _g("SALES_REVENUE", "Sales Revenue", "Income", 600, affects_gross_profit=True),
    _g("SERVICE_REVENUE_GROUP", "Service Revenue", "Income", 610),
    _g("OTHER_INCOME", "Other Operating Income", "Income", 620),
    _g("NON_OPERATING_INCOME", "Non-Operating Income", "Income", 630),
    _g("CONTROL_ACCOUNTS", "Control / Memorandum Accounts", "Asset", 900, default_normal_balance="debit"),
]


# --- System ledgers (raw; normal_balance filled below) ---
_SYSTEM_LEDGERS_RAW: list[SystemLedgerTemplate] = [
    # BTB / trade finance
    _l("BTB_NON_ACCEPTED_LC_LIABILITY", "Non-Accepted BTB LC Liability", "LC_BTB_LIABILITIES", normal_balance="credit", module="COMMERCIAL"),
    _l("BTB_ACCEPTED_LC_LIABILITY", "Accepted BTB LC Liability", "LC_BTB_LIABILITIES", normal_balance="credit", module="COMMERCIAL"),
    _l("BTB_BILLS_PAYABLE_MATURED", "BTB Bills Payable (Matured)", "LC_BTB_LIABILITIES", normal_balance="credit", module="COMMERCIAL"),
    _l("GRNI_IMPORT_BTB", "GRNI - Import under BTB", "GRNI_RECEIPT_CLEARING", normal_balance="credit", module="COMMERCIAL"),
    _l("ACCRUED_BTB_INTEREST_PAYABLE", "Accrued BTB Interest Payable", "ACCRUED_EXPENSES", normal_balance="credit", module="COMMERCIAL"),
    _l("ACCRUED_BTB_CHARGES_PAYABLE", "Accrued BTB Charges Payable", "ACCRUED_EXPENSES", normal_balance="credit", module="COMMERCIAL"),
    _l("BTB_CREDIT_LINE_UTILIZATION_CONTROL", "BTB Credit Line Utilization Control", "CONTROL_ACCOUNTS", module="COMMERCIAL"),
    _l("BTB_DOCUMENTS_IN_TRANSIT_CONTROL", "BTB Documents in Transit Control", "CONTROL_ACCOUNTS", module="COMMERCIAL"),
    # Vendor bill / GRNI timing
    _l("IMPORT_VENDOR_BILL_PENDING", "Import Vendor Bill Pending", "TRADE_PAYABLES", normal_balance="credit", module="COMMERCIAL"),
    _l("IMPORT_VENDOR_BILL_ACCEPTED", "Import Vendor Bill Accepted", "TRADE_PAYABLES", normal_balance="credit", module="COMMERCIAL"),
    _l("GOODS_RECEIVED_NOT_BILLED_IMPORT", "Goods Received Not Billed (Import)", "GRNI_RECEIPT_CLEARING", normal_balance="credit", module="COMMERCIAL"),
    # Loan / facility
    _l("LOAN_INSTALLMENT_DUE", "Loan Installment Due", "CURRENT_PORTION_LTD", normal_balance="credit", module="FACILITY"),
    _l("CURRENT_PORTION_TERM_LOAN", "Current Portion - Term Loan", "CURRENT_PORTION_LTD", normal_balance="credit", module="FACILITY"),
    _l("ACCRUED_LOAN_INTEREST_PAYABLE", "Accrued Loan Interest Payable", "ACCRUED_EXPENSES", normal_balance="credit", module="FACILITY"),
    _l("LOAN_PENAL_INTEREST_PAYABLE", "Penal Interest Payable", "ACCRUED_EXPENSES", normal_balance="credit", module="FACILITY"),
    _l("TERM_LOAN_PRINCIPAL", "Term Loan Principal", "TERM_LOANS", normal_balance="credit", module="FACILITY"),
    _l("WORKING_CAPITAL_LOAN", "Working Capital Loan", "SHORT_TERM_BORROWINGS", normal_balance="credit", module="FACILITY"),
    _l("OD_LOAN_BALANCE", "OD / Overdraft Balance", "SHORT_TERM_BORROWINGS", normal_balance="credit", module="FACILITY"),
    _l("BANK_FINANCED_BTB_SETTLEMENT", "Bank-Financed BTB Settlement", "SHORT_TERM_BORROWINGS", normal_balance="credit", module="COMMERCIAL"),
    # Inventory / import
    _l("RAW_MATERIAL_INVENTORY", "Raw Material Inventory", "INVENTORY_GROUP", module="INVENTORY"),
    _l("PACKING_MATERIAL_INVENTORY", "Packing Material Inventory", "INVENTORY_GROUP", module="INVENTORY"),
    _l("WORK_IN_PROGRESS", "Work in Progress", "INVENTORY_GROUP", module="INVENTORY"),
    _l("FINISHED_GOODS", "Finished Goods", "INVENTORY_GROUP", module="INVENTORY"),
    _l("GOODS_IN_TRANSIT_IMPORT", "Goods in Transit - Import", "GOODS_IN_TRANSIT", module="INVENTORY"),
    _l("IMPORT_CLEARING_ACCOUNT", "Import Clearing Account", "IMPORT_PURCHASE_CLEARING", module="INVENTORY"),
    _l("SUPPLIER_ADVANCE_IMPORT", "Supplier Advance (Import)", "ADVANCES_AND_DEPOSITS", module="INVENTORY"),
    _l("STOCK_ADJUSTMENT_EXPENSE", "Stock Adjustment / Variance", "WASTAGE_PROCESS_LOSS", module="INVENTORY"),
    _l("COGS_EXPENSE", "Cost of Goods Sold", "RAW_MATERIAL_COGS", module="INVENTORY"),
    # Expense / finance charges
    _l("BTB_INTEREST_EXPENSE", "BTB Interest Expense", "INTEREST_EXPENSE_GROUP", module="COMMERCIAL"),
    _l("BTB_LC_COMMISSION_EXPENSE", "BTB LC Commission Expense", "LC_COMMISSION_GROUP", module="COMMERCIAL"),
    _l("BANK_CHARGES_BTB", "Bank Charges - BTB", "BANK_CHARGES_GROUP", module="COMMERCIAL"),
    _l("TERM_LOAN_INTEREST_EXPENSE", "Term Loan Interest Expense", "INTEREST_EXPENSE_GROUP", module="FACILITY"),
    _l("INTEREST_ON_LOAN_EXPENSE", "Interest on Loan", "INTEREST_EXPENSE_GROUP", module="FACILITY"),
    _l("INTEREST_ON_OD_EXPENSE", "Interest on Overdraft", "INTEREST_EXPENSE_GROUP", module="FACILITY"),
    _l("INTEREST_ON_BTB_EXPENSE", "Interest on BTB", "INTEREST_EXPENSE_GROUP", module="COMMERCIAL"),
    _l("LOAN_PROCESSING_FEE_EXPENSE", "Loan Processing Fee Expense", "BANK_CHARGES_GROUP", module="FACILITY"),
    _l("PENAL_INTEREST_EXPENSE", "Penal Interest Expense", "INTEREST_EXPENSE_GROUP", module="FACILITY"),
    _l("LC_COMMISSION_EXPENSE", "LC Commission Expense", "LC_COMMISSION_GROUP", module="COMMERCIAL"),
    _l("EXCHANGE_LOSS", "Exchange Loss", "FINANCE_COSTS", module="FINANCE"),
    _l("RAW_MATERIAL_CONSUMPTION", "Raw Material Consumption", "RAW_MATERIAL_COGS"),
    _l("IMPORT_DUTY_AND_CLEARING_COST", "Import Duty and Clearing Cost", "IMPORT_COST_ADJUSTMENT"),
    _l("INBOUND_FREIGHT_COST", "Inbound Freight Cost", "IMPORT_COST_ADJUSTMENT"),
    _l("WASTAGE_LOSS", "Wastage / Process Loss", "WASTAGE_PROCESS_LOSS"),
    # Receivable / proceeds / trade
    _l("EXPORT_RECEIVABLE", "Export Receivable", "TRADE_RECEIVABLES", module="COMMERCIAL"),
    _l("EXPORT_PROCEEDS_IN_TRANSIT", "Export Proceeds in Transit", "OTHER_RECEIVABLES", module="COMMERCIAL"),
    _l("CASH_INCENTIVE_RECEIVABLE", "Cash Incentive Receivable", "OTHER_RECEIVABLES", module="COMMERCIAL"),
    _l("ACCOUNTS_RECEIVABLE_TRADE", "Trade Receivable (General)", "TRADE_RECEIVABLES"),
    _l("ACCOUNTS_PAYABLE_TRADE", "Trade Payable (General)", "TRADE_PAYABLES", normal_balance="credit"),
    _l("ADVANCE_TO_SUPPLIER", "Advance to Supplier", "ADVANCES_AND_DEPOSITS"),
    _l("ADVANCE_FROM_CUSTOMER", "Advance from Customer", "TRADE_PAYABLES", normal_balance="credit"),
    _l("EMPLOYEE_ADVANCE", "Employee Advance", "ADVANCES_AND_DEPOSITS", module="HR"),
    _l("SECURITY_DEPOSIT_RECEIVABLE", "Security Deposit Receivable", "OTHER_RECEIVABLES"),
    # Statutory / tax (Bangladesh)
    _l("ADVANCE_INCOME_TAX_RECEIVABLE", "AIT / Advance Income Tax Receivable", "TAX_RECEIVABLES_RECOVERABLE", module="STATUTORY"),
    _l("VAT_RECEIVABLE_INPUT", "Input VAT Receivable", "TAX_RECEIVABLES_RECOVERABLE", module="STATUTORY"),
    _l("VDS_RECEIVABLE", "VDS Receivable", "TAX_RECEIVABLES_RECOVERABLE", module="STATUTORY"),
    _l("TDS_RECEIVABLE", "TDS Receivable", "TAX_RECEIVABLES_RECOVERABLE", module="STATUTORY"),
    _l("VAT_PAYABLE_OUTPUT", "Output VAT Payable", "TAX_AND_VAT_PAYABLES", normal_balance="credit", module="STATUTORY"),
    _l("VAT_PAYABLE_NET", "Net VAT Payable", "TAX_AND_VAT_PAYABLES", normal_balance="credit", module="STATUTORY"),
    _l("VDS_PAYABLE", "VDS Payable", "STATUTORY_DEDUCTIONS_PAYABLE", normal_balance="credit", module="STATUTORY"),
    _l("TDS_PAYABLE", "TDS Payable", "STATUTORY_DEDUCTIONS_PAYABLE", normal_balance="credit", module="STATUTORY"),
    _l("INCOME_TAX_PROVISION", "Income Tax Provision", "TAX_AND_VAT_PAYABLES", normal_balance="credit", module="STATUTORY"),
    # Payroll
    _l("DIRECT_WAGES_EXPENSE", "Direct Wages Expense", "DIRECT_WAGES", module="HR"),
    _l("DIRECT_SALARY_EXPENSE", "Direct Salary Expense", "DIRECT_WAGES", module="HR"),
    _l("PRODUCTION_OVERTIME_EXPENSE", "Production Overtime Expense", "DIRECT_WAGES", module="HR"),
    _l("MANAGEMENT_SALARY_EXPENSE", "Management Salary Expense", "ADMIN_EXPENSE", module="HR"),
    _l("INDIRECT_SALARY_EXPENSE", "Indirect Salary Expense", "ADMIN_EXPENSE", module="HR"),
    _l("STAFF_BONUS_EXPENSE", "Staff Bonus Expense", "ADMIN_EXPENSE", module="HR"),
    _l("EMPLOYEE_WELFARE_EXPENSE", "Employee Welfare Expense", "ADMIN_EXPENSE", module="HR"),
    _l("DIRECT_WAGES_PAYABLE", "Direct Wages Payable", "PAYROLL_LIABILITIES", normal_balance="credit", module="HR"),
    _l("DIRECT_SALARY_PAYABLE", "Direct Salary Payable", "PAYROLL_LIABILITIES", normal_balance="credit", module="HR"),
    _l("INDIRECT_SALARY_PAYABLE", "Indirect Salary Payable", "PAYROLL_LIABILITIES", normal_balance="credit", module="HR"),
    _l("MANAGEMENT_SALARY_PAYABLE", "Management Salary Payable", "PAYROLL_LIABILITIES", normal_balance="credit", module="HR"),
    _l("PAYROLL_TDS_PAYABLE", "Payroll TDS Payable", "PAYROLL_LIABILITIES", normal_balance="credit", module="HR"),
    _l("PAYROLL_OTHER_DEDUCTIONS_PAYABLE", "Payroll Other Deductions Payable", "PAYROLL_LIABILITIES", normal_balance="credit", module="HR"),
    # Utilities
    _l("FACTORY_ELECTRICITY_EXPENSE", "Factory Electricity Expense", "FACTORY_UTILITIES", module="PRODUCTION"),
    _l("FACTORY_GAS_EXPENSE", "Factory Gas Expense", "FACTORY_UTILITIES", module="PRODUCTION"),
    _l("FACTORY_WATER_EXPENSE", "Factory Water Expense", "FACTORY_UTILITIES", module="PRODUCTION"),
    _l("FACTORY_UTILITY_PAYABLE", "Factory Utility Payable", "UTILITY_PAYABLES", normal_balance="credit", module="PRODUCTION"),
    _l("OFFICE_ELECTRICITY_EXPENSE", "Office Electricity Expense", "OFFICE_UTILITY_EXPENSES"),
    _l("OFFICE_GAS_EXPENSE", "Office Gas Expense", "OFFICE_UTILITY_EXPENSES"),
    _l("OFFICE_WATER_EXPENSE", "Office Water Expense", "OFFICE_UTILITY_EXPENSES"),
    _l("INTERNET_EXPENSE", "Internet Expense", "COMMUNICATION_INTERNET"),
    _l("TELEPHONE_EXPENSE", "Telephone Expense", "COMMUNICATION_INTERNET"),
    _l("UTILITY_BILL_PAYABLE", "Utility Bill Payable (Office)", "UTILITY_PAYABLES", normal_balance="credit"),
    # Travel / conveyance
    _l("CONVEYANCE_EXPENSE", "Conveyance Expense", "TRAVEL_CONVEYANCE"),
    _l("TRAVEL_EXPENSE", "Travel Expense", "TRAVEL_CONVEYANCE"),
    _l("TRANSPORT_EXPENSE", "Transport Expense", "TRAVEL_CONVEYANCE"),
    _l("FUEL_EXPENSE", "Fuel Expense", "TRAVEL_CONVEYANCE"),
    _l("VEHICLE_MAINTENANCE_EXPENSE", "Vehicle Maintenance Expense", "REPAIR_MAINTENANCE"),
    # Banking (general)
    _l("BANK_CHARGES_EXPENSE", "Bank Charges Expense (General)", "BANK_CHARGES_GROUP", module="FINANCE"),
    # Revenue
    _l("SALES_REVENUE_EXPORT", "Sales Revenue - Export", "SALES_REVENUE", normal_balance="credit", module="COMMERCIAL"),
    _l("SALES_REVENUE_LOCAL", "Sales Revenue - Local", "SALES_REVENUE", normal_balance="credit"),
    _l("SERVICE_REVENUE", "Service Revenue", "SERVICE_REVENUE_GROUP", normal_balance="credit"),
    _l("OTHER_INCOME", "Other Income", "OTHER_INCOME", normal_balance="credit"),
    _l("CASH_INCENTIVE_INCOME", "Cash Incentive Income", "OTHER_INCOME", normal_balance="credit", module="COMMERCIAL"),
    _l("EXCHANGE_GAIN", "Exchange Gain", "OTHER_INCOME", normal_balance="credit", module="FINANCE"),
    _l("EXCHANGE_GAIN_INCOME", "Exchange Gain (Income)", "NON_OPERATING_INCOME", normal_balance="credit", module="FINANCE"),
    # General operations
    _l("RENT_EXPENSE", "Rent Expense (General)", "ADMIN_EXPENSE"),
    _l("OFFICE_RENT_EXPENSE", "Office Rent Expense", "ADMIN_EXPENSE"),
    _l("FACTORY_RENT_EXPENSE", "Factory Rent Expense", "FACTORY_OVERHEAD"),
    _l("REPAIR_MAINTENANCE_EXPENSE", "Repair and Maintenance Expense", "REPAIR_MAINTENANCE"),
    _l("PRINTING_STATIONERY_EXPENSE", "Printing and Stationery Expense", "GENERAL_EXPENSES"),
    _l("MISCELLANEOUS_EXPENSE", "Miscellaneous Expense", "GENERAL_EXPENSES"),
    # Cash (no generic bank ledger; user creates bank sub-ledgers separately)
    _l("CASH_IN_HAND", "Cash in Hand", "CASH_AND_BANK"),
]


def _fix_ledger_templates(ledgers: list[SystemLedgerTemplate]) -> list[SystemLedgerTemplate]:
    """Fill normal_balance from group nature when missing."""
    group_nb: dict[str, str] = {g["system_code"]: g["default_normal_balance"] for g in SYSTEM_ACCOUNT_GROUPS}
    out: list[SystemLedgerTemplate] = []
    for row in ledgers:
        gsc = row["group_system_code"]
        nb = row.get("normal_balance") or ""
        if not nb:
            nb = group_nb.get(gsc, "debit")
        out.append({**row, "normal_balance": nb})
    return out


SYSTEM_LEDGERS: list[SystemLedgerTemplate] = _fix_ledger_templates(_SYSTEM_LEDGERS_RAW)


def ledger_by_system_code() -> dict[str, SystemLedgerTemplate]:
    return {x["system_code"]: x for x in SYSTEM_LEDGERS}


def group_by_system_code() -> dict[str, SystemGroupTemplate]:
    return {x["system_code"]: x for x in SYSTEM_ACCOUNT_GROUPS}
