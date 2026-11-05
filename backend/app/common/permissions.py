"""Canonical internal RBAC registry and permission checks (tenant staff roles)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.tenant_feature_keys import RBAC_MODE_ENFORCE, RBAC_MODE_OFF, get_tenant_rbac_mode
from app.database import get_db
from app.models import Role, Tenant, User

logger = logging.getLogger(__name__)

# --- Material control & AP governance (optional JSON on Role.permissions) ---
PERMISSION_BOM_PRICE_OVERRIDE = "bom.price_override"
PERMISSION_INVENTORY_NON_PO_RECEIPT_APPROVE = "inventory.non_po_receipt_approve"
PERMISSION_INVENTORY_OVER_RECEIPT_APPROVE = "inventory.over_receipt_approve"
PERMISSION_INVENTORY_OVER_ISSUE_APPROVE = "inventory.over_issue_approve"
PERMISSION_INVENTORY_PROCESS_ORDER_APPROVE = "inventory.process_order_approve"
PERMISSION_FINANCE_AP_POSTING_APPROVE = "finance.ap_posting_approve"
PERMISSION_FINANCE_RECEIPT_FROM_PROFORMA = "finance.receipt_from_proforma"
PERMISSION_FINANCE_BUDGET_OVERRIDE = "finance.budget_override"
PERMISSION_PARTY_LEDGER_VIEW = "finance.party_ledger.view"
PERMISSION_PARTY_LEDGER_CREATE = "finance.party_ledger.create"
PERMISSION_PARTY_LEDGER_EDIT = "finance.party_ledger.edit"
PERMISSION_PARTY_LEDGER_DELETE = "finance.party_ledger.delete"
PERMISSION_PARTY_LEDGER_ALLOCATE = "finance.party_ledger.allocate"
PERMISSION_PARTY_LEDGER_STATEMENT = "finance.party_ledger.statement"
PERMISSION_PARTY_LEDGER_AGING = "finance.party_ledger.aging"
PERMISSION_PARTY_LEDGER_INTEREST = "finance.party_ledger.interest"
PERMISSION_TAX_LEDGER_VIEW = "finance.tax_ledger.view"
PERMISSION_TAX_LEDGER_CREATE = "finance.tax_ledger.create"
PERMISSION_TAX_LEDGER_EDIT = "finance.tax_ledger.edit"
PERMISSION_TAX_LEDGER_DELETE = "finance.tax_ledger.delete"
PERMISSION_GST_RETURN_VIEW = "finance.gst_return.view"
PERMISSION_GST_RETURN_EXPORT = "finance.gst_return.export"
PERMISSION_TAX_SETTINGS_VIEW = "finance.tax_settings.view"
PERMISSION_TAX_SETTINGS_EDIT = "finance.tax_settings.edit"
PERMISSION_VOUCHER_TYPE_CONFIG = "finance.voucher_type.config"
PERMISSION_VOUCHER_CLASS_VIEW = "finance.voucher_class.view"
PERMISSION_VOUCHER_CLASS_CREATE = "finance.voucher_class.create"
PERMISSION_VOUCHER_CLASS_EDIT = "finance.voucher_class.edit"
PERMISSION_VOUCHER_CLASS_DELETE = "finance.voucher_class.delete"
PERMISSION_RECURRING_VOUCHER_VIEW = "finance.recurring_voucher.view"
PERMISSION_RECURRING_VOUCHER_CREATE = "finance.recurring_voucher.create"
PERMISSION_RECURRING_VOUCHER_EDIT = "finance.recurring_voucher.edit"
PERMISSION_RECURRING_VOUCHER_DELETE = "finance.recurring_voucher.delete"
PERMISSION_CREDIT_NOTE_CREATE = "finance.credit_note.create"
PERMISSION_DEBIT_NOTE_CREATE = "finance.debit_note.create"
PERMISSION_STOCK_TRANSFER_VOUCHER_CREATE = "finance.stock_transfer.create"
PERMISSION_TDS_VIEW = "finance.tds.view"
PERMISSION_TDS_CREATE = "finance.tds.create"
PERMISSION_TDS_EDIT = "finance.tds.edit"
PERMISSION_TDS_RETURN_EXPORT = "finance.tds_return.export"
PERMISSION_HR_PAYROLL_STATUTORY_VIEW = "hr.payroll.statutory.view"
PERMISSION_HR_PAYROLL_STATUTORY_EDIT = "hr.payroll.statutory.edit"
PERMISSION_MIS_REPORT_VIEW = "finance.mis_report.view"
PERMISSION_MIS_REPORT_EXPORT = "finance.mis_report.export"
PERMISSION_SCENARIO_ANALYSIS_VIEW = "finance.scenario_analysis.view"
PERMISSION_INVENTORY_STOCK_GROUP_VIEW = "inventory.stock_group.view"
PERMISSION_INVENTORY_STOCK_GROUP_CREATE = "inventory.stock_group.create"
PERMISSION_INVENTORY_STOCK_GROUP_EDIT = "inventory.stock_group.edit"
PERMISSION_INVENTORY_STOCK_GROUP_DELETE = "inventory.stock_group.delete"
PERMISSION_INVENTORY_STOCK_ITEM_VIEW = "inventory.stock_item.view"
PERMISSION_INVENTORY_STOCK_ITEM_CREATE = "inventory.stock_item.create"
PERMISSION_INVENTORY_STOCK_ITEM_EDIT = "inventory.stock_item.edit"
PERMISSION_INVENTORY_STOCK_ITEM_DELETE = "inventory.stock_item.delete"
PERMISSION_INVENTORY_BATCH_VIEW = "inventory.batch.view"
PERMISSION_INVENTORY_BATCH_CREATE = "inventory.batch.create"
PERMISSION_INVENTORY_BATCH_EDIT = "inventory.batch.edit"
PERMISSION_INVENTORY_GODOWN_VIEW = "inventory.godown.view"
PERMISSION_INVENTORY_GODOWN_CREATE = "inventory.godown.create"
PERMISSION_INVENTORY_GODOWN_EDIT = "inventory.godown.edit"
PERMISSION_INVENTORY_GODOWN_DELETE = "inventory.godown.delete"
PERMISSION_INVENTORY_STOCK_TRANSFER_VIEW = "inventory.stock_transfer.view"
PERMISSION_INVENTORY_STOCK_TRANSFER_CREATE = "inventory.stock_transfer.create"
# Sprint I1 MRP / IDT / process loss
PERMISSION_INVENTORY_MRP_RUN = "inventory.mrp.run"
PERMISSION_INVENTORY_PLANNED_ORDER_VIEW = "inventory.planned_order.view"
PERMISSION_INVENTORY_PLANNED_ORDER_FIRM = "inventory.planned_order.firm"
PERMISSION_INVENTORY_PLANNED_ORDER_RELEASE = "inventory.planned_order.release"
PERMISSION_INVENTORY_REORDER_SUGGESTION_VIEW = "inventory.reorder_suggestion.view"
PERMISSION_INVENTORY_REORDER_SUGGESTION_APPROVE = "inventory.reorder_suggestion.approve"
PERMISSION_INVENTORY_REORDER_SUGGESTION_CONVERT = "inventory.reorder_suggestion.convert"
PERMISSION_INVENTORY_IDT_VIEW = "inventory.idt.view"
PERMISSION_INVENTORY_IDT_CREATE = "inventory.idt.create"
PERMISSION_INVENTORY_IDT_RECEIVE = "inventory.idt.receive"
PERMISSION_INVENTORY_PROCESS_LOSS_VIEW = "inventory.process_loss.view"
PERMISSION_INVENTORY_PROCESS_LOSS_CONFIG = "inventory.process_loss.config"
PERMISSION_INVENTORY_POST_COSTING_VIEW = "inventory.post_costing.view"
PERMISSION_INVENTORY_QC_INSPECT = "inventory.qc.inspect"
PERMISSION_INVENTORY_QC_VIEW = "inventory.qc.view"
PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW = "inventory.vendor_scorecard.view"
PERMISSION_INVENTORY_ABC_ANALYSIS_VIEW = "inventory.abc_analysis.view"
PERMISSION_INVENTORY_ABC_ANALYSIS_RUN = "inventory.abc_analysis.run"
PERMISSION_INVENTORY_EOQ_VIEW = "inventory.eoq.view"
PERMISSION_INVENTORY_STOCK_AGING_VIEW = "inventory.stock_aging.view"
PERMISSION_INVENTORY_CYCLE_COUNT_VIEW = "inventory.cycle_count.view"
PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM = "inventory.cycle_count.perform"
PERMISSION_INVENTORY_SERIAL_VIEW = "inventory.serial.view"
PERMISSION_INVENTORY_SERIAL_CREATE = "inventory.serial.create"
PERMISSION_INVENTORY_KIT_VIEW = "inventory.kit.view"
PERMISSION_INVENTORY_KIT_CREATE = "inventory.kit.create"
PERMISSION_INVENTORY_KIT_EDIT = "inventory.kit.edit"
PERMISSION_INVENTORY_CONSIGNMENT_VIEW = "inventory.consignment.view"
PERMISSION_INVENTORY_CONSIGNMENT_CREATE = "inventory.consignment.create"
PERMISSION_INVENTORY_CONSIGNMENT_SETTLE = "inventory.consignment.settle"
PERMISSION_COMMERCIAL_INVOICE_CREATE = "commercial.invoice.create"
PERMISSION_COMMERCIAL_INVOICE_ISSUE = "commercial.invoice.issue"
PERMISSION_COMMERCIAL_EXPORT_CASE_CREATE = "commercial.export_case.create"
PERMISSION_COMMERCIAL_EXPORT_CASE_EDIT = "commercial.export_case.edit"
PERMISSION_HR_PAYROLL_AUTO_CALCULATE = "hr.payroll.auto_calculate"
# Fail-closed: pay setup, run lines and pay-affecting HR edits need admin/manager or an explicit grant.
PERMISSION_HR_PAYROLL_MANAGE = "hr.payroll.manage"
PERMISSION_HR_ATTENDANCE_MANAGE = "hr.attendance.manage"
PERMISSION_HR_LEAVE_TYPES_MANAGE = "hr.leave.types.manage"
PERMISSION_HR_COMPLIANCE_VIEW = "hr.compliance.view"
PERMISSION_HR_COMPLIANCE_MANAGE = "hr.compliance.manage"
PERMISSION_HR_OCR_USE = "hr.ocr.use"
PERMISSION_HR_AI_INSIGHTS_VIEW = "hr.ai.insights.view"
PERMISSION_HR_DOCUMENTS_GENERATE = "hr.documents.generate"
PERMISSION_HR_AGE_VERIFY = "hr.age_verification.verify"
PERMISSION_HR_MEDICAL_MANAGE = "hr.medical.manage"
PERMISSION_AI_HR_EXTRACT = "ai.hr_extract"
PERMISSION_AI_LC_EXTRACT = "ai.lc_extract"
PERMISSION_AI_SHIPPING_EXTRACT = "ai.shipping_extract"
PERMISSION_AI_FINANCE_FORECAST = "ai.finance_forecast"
PERMISSION_AI_DEFECT_PREDICT = "ai.defect_predict"
PERMISSION_AI_MAINTENANCE_PREDICT = "ai.maintenance_predict"
PERMISSION_AI_LINE_BALANCE = "ai.line_balance"

MATERIAL_CONTROL_GOVERNANCE_KEYS: list[dict[str, str]] = [
    {
        "key": PERMISSION_HR_PAYROLL_MANAGE,
        "label": "Edit payroll setup and run lines (components, structures, periods, runs, assignments)",
        "group": "HR & payroll",
    },
    {
        "key": PERMISSION_HR_ATTENDANCE_MANAGE,
        "label": "Edit attendance entries directly (outside regularization)",
        "group": "HR & payroll",
    },
    {
        "key": PERMISSION_HR_LEAVE_TYPES_MANAGE,
        "label": "Create or change leave types (incl. approval requirement)",
        "group": "HR & payroll",
    },
    {
        "key": PERMISSION_BOM_PRICE_OVERRIDE,
        "label": "Override BOM expected unit price after BOM is approved/frozen",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_NON_PO_RECEIPT_APPROVE,
        "label": "Post goods receipt (receive) for non-PO GRNs",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_OVER_RECEIPT_APPROVE,
        "label": "Receive quantities above PO line pending balance",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_OVER_ISSUE_APPROVE,
        "label": "Approve production material issues above standard tolerance",
        "group": "Material control",
    },
    {
        "key": PERMISSION_INVENTORY_PROCESS_ORDER_APPROVE,
        "label": "Approve received process orders (final sign-off)",
        "group": "Material control",
    },
    {
        "key": PERMISSION_FINANCE_AP_POSTING_APPROVE,
        "label": "Post vendor bills to AP (book GRNI clearing)",
        "group": "Finance",
    },
    {
        "key": PERMISSION_FINANCE_RECEIPT_FROM_PROFORMA,
        "label": "Record payment from export proforma invoice",
        "group": "Finance",
    },
    {
        "key": PERMISSION_FINANCE_BUDGET_OVERRIDE,
        "label": "Override budget block when posting vouchers over budget",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_VIEW,
        "label": "View party ledgers, bills, and balances",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_CREATE,
        "label": "Create party ledgers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_EDIT,
        "label": "Edit party ledger credit terms and settings",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_DELETE,
        "label": "Deactivate party ledgers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_ALLOCATE,
        "label": "Allocate receipts/payments against party bills",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_STATEMENT,
        "label": "View party ledger statements",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_AGING,
        "label": "View party ledger aging reports",
        "group": "Finance",
    },
    {
        "key": PERMISSION_PARTY_LEDGER_INTEREST,
        "label": "Calculate interest on overdue party bills",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TAX_LEDGER_VIEW,
        "label": "View tax ledgers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TAX_LEDGER_CREATE,
        "label": "Create tax ledgers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TAX_LEDGER_EDIT,
        "label": "Edit tax ledgers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TAX_LEDGER_DELETE,
        "label": "Deactivate tax ledgers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_GST_RETURN_VIEW,
        "label": "View GST returns (GSTR1/2/3B/ITC)",
        "group": "Finance",
    },
    {
        "key": PERMISSION_GST_RETURN_EXPORT,
        "label": "Export GST returns for portal upload",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TAX_SETTINGS_VIEW,
        "label": "View GST/tax settings",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TAX_SETTINGS_EDIT,
        "label": "Edit GST/tax settings",
        "group": "Finance",
    },
    {
        "key": PERMISSION_VOUCHER_TYPE_CONFIG,
        "label": "Configure advanced voucher types",
        "group": "Finance",
    },
    {
        "key": PERMISSION_VOUCHER_CLASS_VIEW,
        "label": "View voucher classes",
        "group": "Finance",
    },
    {
        "key": PERMISSION_VOUCHER_CLASS_CREATE,
        "label": "Create voucher classes",
        "group": "Finance",
    },
    {
        "key": PERMISSION_VOUCHER_CLASS_EDIT,
        "label": "Edit voucher classes",
        "group": "Finance",
    },
    {
        "key": PERMISSION_VOUCHER_CLASS_DELETE,
        "label": "Delete voucher classes",
        "group": "Finance",
    },
    {
        "key": PERMISSION_RECURRING_VOUCHER_VIEW,
        "label": "View recurring voucher templates",
        "group": "Finance",
    },
    {
        "key": PERMISSION_RECURRING_VOUCHER_CREATE,
        "label": "Create recurring voucher templates",
        "group": "Finance",
    },
    {
        "key": PERMISSION_RECURRING_VOUCHER_EDIT,
        "label": "Edit recurring voucher templates",
        "group": "Finance",
    },
    {
        "key": PERMISSION_RECURRING_VOUCHER_DELETE,
        "label": "Delete recurring voucher templates",
        "group": "Finance",
    },
    {
        "key": PERMISSION_CREDIT_NOTE_CREATE,
        "label": "Create credit notes",
        "group": "Finance",
    },
    {
        "key": PERMISSION_DEBIT_NOTE_CREATE,
        "label": "Create debit notes",
        "group": "Finance",
    },
    {
        "key": PERMISSION_STOCK_TRANSFER_VOUCHER_CREATE,
        "label": "Create stock transfer vouchers",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TDS_VIEW,
        "label": "View TDS sections and deductions",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TDS_CREATE,
        "label": "Create TDS sections and deductions",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TDS_EDIT,
        "label": "Edit TDS sections and deductions",
        "group": "Finance",
    },
    {
        "key": PERMISSION_TDS_RETURN_EXPORT,
        "label": "Export TDS returns (Form 26Q/24Q)",
        "group": "Finance",
    },
    {
        "key": PERMISSION_HR_PAYROLL_STATUTORY_VIEW,
        "label": "View payroll statutory config",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_PAYROLL_STATUTORY_EDIT,
        "label": "Edit payroll statutory config",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_COMPLIANCE_VIEW,
        "label": "View BSCI/WRAP/SEDEX compliance dashboard",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_COMPLIANCE_MANAGE,
        "label": "Manage compliance requirements and evidence",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_OCR_USE,
        "label": "Upload and OCR HR documents (CV, NID, medical)",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_AI_INSIGHTS_VIEW,
        "label": "View HR AI insights (attendance, turnover, anomalies)",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_DOCUMENTS_GENERATE,
        "label": "Generate HR PDFs (ID card, letters, payslip)",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_AGE_VERIFY,
        "label": "Verify employee age for child-labor compliance",
        "group": "HR",
    },
    {
        "key": PERMISSION_HR_MEDICAL_MANAGE,
        "label": "Track employee medical certificates",
        "group": "HR",
    },
    {
        "key": PERMISSION_MIS_REPORT_VIEW,
        "label": "View MIS reports (fund flow, ratios, comparative)",
        "group": "Finance",
    },
    {
        "key": PERMISSION_MIS_REPORT_EXPORT,
        "label": "Export MIS reports",
        "group": "Finance",
    },
    {
        "key": PERMISSION_SCENARIO_ANALYSIS_VIEW,
        "label": "View cash-flow scenario analysis",
        "group": "Finance",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_GROUP_VIEW,
        "label": "View stock groups hierarchy",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_GROUP_CREATE,
        "label": "Create stock groups",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_GROUP_EDIT,
        "label": "Edit stock groups",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_GROUP_DELETE,
        "label": "Delete stock groups",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_ITEM_VIEW,
        "label": "View stock items and valuation",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_ITEM_CREATE,
        "label": "Create stock items",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_ITEM_EDIT,
        "label": "Edit stock items and price lists",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_ITEM_DELETE,
        "label": "Delete / deactivate stock items",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_BATCH_VIEW,
        "label": "View stock batches",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_BATCH_CREATE,
        "label": "Create stock batches",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_BATCH_EDIT,
        "label": "Edit stock batches",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_GODOWN_VIEW,
        "label": "View godown / warehouse stock",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_GODOWN_CREATE,
        "label": "Create godowns / warehouses",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_GODOWN_EDIT,
        "label": "Edit godowns / warehouses",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_GODOWN_DELETE,
        "label": "Delete godowns / warehouses",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_TRANSFER_VIEW,
        "label": "View stock transfers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_TRANSFER_CREATE,
        "label": "Create stock transfers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_MRP_RUN,
        "label": "Run inventory MRP engine",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_PLANNED_ORDER_VIEW,
        "label": "View planned orders",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_PLANNED_ORDER_FIRM,
        "label": "Firm planned orders",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_PLANNED_ORDER_RELEASE,
        "label": "Release planned orders to PO/MO",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_REORDER_SUGGESTION_VIEW,
        "label": "View reorder suggestions",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_REORDER_SUGGESTION_APPROVE,
        "label": "Approve reorder suggestions",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_REORDER_SUGGESTION_CONVERT,
        "label": "Convert reorder suggestions to PO",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_IDT_VIEW,
        "label": "View inter-department transfers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_IDT_CREATE,
        "label": "Create / issue inter-department transfers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_IDT_RECEIVE,
        "label": "Receive inter-department transfers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_PROCESS_LOSS_VIEW,
        "label": "View process loss reports",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_PROCESS_LOSS_CONFIG,
        "label": "Configure process loss standards",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_POST_COSTING_VIEW,
        "label": "View post-costing reports",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_QC_VIEW,
        "label": "View GRN quality inspections",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_QC_INSPECT,
        "label": "Perform GRN quality inspections",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_VENDOR_SCORECARD_VIEW,
        "label": "View vendor quality scorecard",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_ABC_ANALYSIS_VIEW,
        "label": "View ABC analysis report",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_ABC_ANALYSIS_RUN,
        "label": "Run ABC analysis and update item classes",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_EOQ_VIEW,
        "label": "View EOQ calculations",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_STOCK_AGING_VIEW,
        "label": "View stock aging report",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_CYCLE_COUNT_VIEW,
        "label": "View cycle count schedule",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM,
        "label": "Perform and submit cycle counts",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_SERIAL_VIEW,
        "label": "View stock serial numbers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_SERIAL_CREATE,
        "label": "Create and assign stock serial numbers",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_KIT_VIEW,
        "label": "View item kits",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_KIT_CREATE,
        "label": "Create item kits",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_KIT_EDIT,
        "label": "Edit item kits",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_CONSIGNMENT_VIEW,
        "label": "View consignment stock",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_CONSIGNMENT_CREATE,
        "label": "Receive and consume consignment stock",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_INVENTORY_CONSIGNMENT_SETTLE,
        "label": "Settle consignment stock (create PO)",
        "group": "Inventory",
    },
    {
        "key": PERMISSION_COMMERCIAL_INVOICE_CREATE,
        "label": "Create commercial invoice from delivery challan",
        "group": "Commercial",
    },
    {
        "key": PERMISSION_COMMERCIAL_INVOICE_ISSUE,
        "label": "Issue commercial invoice (creates draft AR voucher)",
        "group": "Commercial",
    },
    {
        "key": PERMISSION_COMMERCIAL_EXPORT_CASE_CREATE,
        "label": "Create export cases",
        "group": "Commercial",
    },
    {
        "key": PERMISSION_COMMERCIAL_EXPORT_CASE_EDIT,
        "label": "Edit export cases",
        "group": "Commercial",
    },
    {
        "key": PERMISSION_HR_PAYROLL_AUTO_CALCULATE,
        "label": "Auto-calculate payroll run lines from structure assignments",
        "group": "HR",
    },
    {
        "key": PERMISSION_AI_LC_EXTRACT,
        "label": "Extract Letter of Credit fields from uploaded documents",
        "group": "AI",
    },
    {
        "key": PERMISSION_AI_SHIPPING_EXTRACT,
        "label": "Extract BL / AWB / packing list fields from shipping documents",
        "group": "AI",
    },
    {
        "key": PERMISSION_AI_FINANCE_FORECAST,
        "label": "Run AI finance cash-flow / P&L forecast",
        "group": "AI",
    },
    {
        "key": PERMISSION_AI_DEFECT_PREDICT,
        "label": "View defect-risk predictive suggestions",
        "group": "AI",
    },
    {
        "key": PERMISSION_AI_MAINTENANCE_PREDICT,
        "label": "View predictive maintenance risk alerts",
        "group": "AI",
    },
    {
        "key": PERMISSION_AI_LINE_BALANCE,
        "label": "View AI line-balancing suggestions",
        "group": "AI",
    },
]

# Module id -> { label, access_key, submodules: { sub_id -> { label, levels } } }
PERMISSION_REGISTRY: dict[str, Any] = {
    "merch": {
        "label": "Merchandising",
        "access_key": "merch.access",
        "submodules": {
            "inquiries": {"label": "Inquiries", "levels": ["read", "write", "edit", "approve"]},
            "quotations": {"label": "Quotations", "levels": ["read", "write", "edit", "approve"]},
            "orders": {"label": "Orders", "levels": ["read", "write", "edit", "approve"]},
            "pi": {"label": "Proforma invoices", "levels": ["read", "write", "edit", "approve"]},
            "styles": {"label": "Styles / BOM", "levels": ["read", "write", "edit", "approve"]},
            "customers": {"label": "Customers", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "inventory": {
        "label": "Inventory",
        "access_key": "inventory.access",
        "submodules": {
            "items": {"label": "Items", "levels": ["read", "write", "edit", "approve"]},
            "warehouses": {"label": "Warehouses", "levels": ["read", "write", "edit"]},
            "transfers": {"label": "Transfers", "levels": ["read", "write", "edit", "approve"]},
            "adjustments": {"label": "Adjustments", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "production": {
        "label": "Production",
        "access_key": "production.access",
        "submodules": {
            "planning": {"label": "Planning", "levels": ["read", "write", "edit", "approve"]},
            "lines": {"label": "Lines / operations", "levels": ["read", "write", "edit"]},
            "reports": {"label": "Reports", "levels": ["read"]},
        },
    },
    "finance": {
        "label": "Finance",
        "access_key": "finance.access",
        "submodules": {
            "accounts": {"label": "Accounts", "levels": ["read", "write", "edit", "approve"]},
            "journals": {"label": "Journals", "levels": ["read", "write", "edit", "approve"]},
            "invoices": {"label": "Invoices", "levels": ["read", "write", "edit", "approve"]},
            "payments": {"label": "Payments", "levels": ["read", "write", "edit", "approve"]},
            "reports": {"label": "Reports", "levels": ["read"]},
        },
    },
    "hr": {
        "label": "HR",
        "access_key": "hr.access",
        "submodules": {
            "employees": {"label": "Employees", "levels": ["read", "write", "edit", "approve"]},
            "attendance": {"label": "Attendance", "levels": ["read", "write", "edit"]},
            "payroll": {"label": "Payroll", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "trade": {
        "label": "Trade",
        "access_key": "trade.access",
        "submodules": {
            "cases": {"label": "Trade cases", "levels": ["read", "write", "edit", "approve"]},
            "documents": {"label": "Documents", "levels": ["read", "write", "edit"]},
            "lc": {"label": "Letters of credit", "levels": ["read", "write", "edit", "approve"]},
        },
    },
    "settings": {
        "label": "Settings",
        "access_key": "settings.access",
        "submodules": {
            "users": {"label": "Users", "levels": ["read", "write", "edit"]},
            "roles": {"label": "Roles", "levels": ["read", "write", "edit"]},
            "company": {"label": "Company profile", "levels": ["read", "edit"]},
            "external": {"label": "External access", "levels": ["read", "write", "edit"]},
        },
    },
    "reports": {
        "label": "Reports",
        "access_key": "reports.access",
        "submodules": {
            "all": {"label": "All reports", "levels": ["read", "export"]},
        },
    },
    "ai": {
        "label": "AI tools",
        "access_key": "ai.access",
        "submodules": {
            "all": {"label": "AI features", "levels": ["read", "write"]},
            "lc_extract": {"label": "LC document extract", "levels": ["read", "write"]},
            "shipping_extract": {"label": "Shipping document extract", "levels": ["read", "write"]},
            "finance_forecast": {"label": "Finance forecast", "levels": ["read", "write"]},
            "defect_predict": {"label": "Defect prediction", "levels": ["read"]},
            "maintenance_predict": {"label": "Maintenance prediction", "levels": ["read"]},
            "line_balance": {"label": "Line balance suggestions", "levels": ["read"]},
        },
    },
    "facility": {
        "label": "Loans & Facilities",
        "access_key": "facility.access",
        "submodules": {
            "facilities": {"label": "Facilities", "levels": ["read", "write", "edit", "approve"]},
            "utilizations": {"label": "Utilizations / Drawdowns", "levels": ["read", "write", "edit", "approve"]},
            "accrual": {"label": "Interest Accrual", "levels": ["read", "write"]},
            "repayments": {"label": "Repayments", "levels": ["read", "write", "approve"]},
            "reports": {"label": "Facility Reports", "levels": ["read", "export"]},
        },
    },
    "business_overview": {
        "label": "Business Overview",
        "access_key": "business_overview.access",
        "submodules": {
            "dashboard": {"label": "Dashboard", "levels": ["read"]},
            "ai_insights": {"label": "AI Insights", "levels": ["read"]},
            "reports": {"label": "Reports", "levels": ["read", "export"]},
        },
    },
}


def permissions_registry_api_payload() -> dict[str, Any]:
    """JSON-safe tree for GET /settings/permissions-registry."""
    modules_out: list[dict[str, Any]] = []
    for mid, m in PERMISSION_REGISTRY.items():
        subs_out: list[dict[str, Any]] = []
        for sid, sm in (m.get("submodules") or {}).items():
            subs_out.append(
                {
                    "id": sid,
                    "label": sm.get("label", sid),
                    "levels": list(sm.get("levels") or []),
                }
            )
        modules_out.append(
            {
                "id": mid,
                "label": m.get("label", mid),
                "access_key": m.get("access_key"),
                "submodules": subs_out,
            }
        )
    return {
        "modules": modules_out,
        "governance_toggle_keys": list(MATERIAL_CONTROL_GOVERNANCE_KEYS),
    }


async def assert_delegate_manager_or_permission(
    db: AsyncSession,
    user: User,
    tenant_id: int,
    *,
    permission_key: str,
) -> None:
    """Allow if user is admin/manager, or role.permissions grants the boolean key."""
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    rn = (role.name if role else "").strip().lower()
    if rn in {"admin", "manager"}:
        return
    if internal_permission_granted(role=role, permission_key=permission_key):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Requires admin/manager role or permission '{permission_key}'",
    )


HR_SETUP_BYPASS_ROLES = frozenset({"admin", "manager", "super_admin", "superadmin", "owner"})


async def assert_hr_manager_or_permission(
    db: AsyncSession,
    user: User,
    tenant_id: int,
    *,
    permission_key: str,
) -> None:
    """Fail-closed gate for pay-affecting HR writes: manager-type role or an explicit True grant."""
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    rn = (role.name if role else "").strip().lower()
    if rn in HR_SETUP_BYPASS_ROLES:
        return
    if internal_permission_granted(role=role, permission_key=permission_key):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Requires manager/admin role or permission '{permission_key}'",
    )


def soft_permission_denied(*, role: Role | None, permission_key: str) -> bool:
    """Soft-deny convention: missing key ⇒ allow; explicit False ⇒ deny.

    Also deny when a broader deny is not used; wildcards ``*`` / ``hr.*`` as True
    still allow. Admin role always allowed.
    """
    if role is None:
        return False
    if (role.name or "").strip().lower() == "admin":
        return False
    perms = role.permissions if isinstance(role.permissions, dict) else {}
    if perms.get(permission_key) is False:
        return True
    return False


async def assert_soft_permission_allowed(
    db: AsyncSession,
    user: User,
    tenant_id: int,
    *,
    permission_key: str,
) -> None:
    """Raise 403 only when role.permissions explicitly sets permission_key to false."""
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if soft_permission_denied(role=role, permission_key=permission_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {permission_key}",
        )


async def get_user_role_for_tenant(db: AsyncSession, user: User, tenant_id: int) -> Role | None:
    if user.tenant_id != tenant_id:
        return None
    return await get_user_role_scoped_to_tenant(db, user, tenant_id)


def internal_permission_granted(*, role: Role | None, permission_key: str) -> bool:
    """Return True if role grants permission_key (admin always True)."""
    if role is None:
        return False
    if (role.name or "").lower() == "admin":
        return True
    perms = role.permissions if isinstance(role.permissions, dict) else {}
    if perms.get("*") is True:
        return True
    if perms.get(permission_key) is True:
        return True
    parts = permission_key.split(".")
    if len(parts) >= 1:
        if perms.get(f"{parts[0]}.*") is True:
            return True
    return False


def require_internal_permission(permission_key: str):
    """FastAPI Depends() factory for a single permission key on internal JWT users."""

    async def _dep(
        request: Request,
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        if getattr(request.state, "tenant_feature_flags_cached", False):
            tenant_feature_flags = getattr(request.state, "tenant_feature_flags", None)
        else:
            tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
            tenant = tenant_result.scalar_one_or_none()
            tenant_feature_flags = tenant.feature_flags if tenant else None
            request.state.tenant_feature_flags = tenant_feature_flags
            request.state.tenant_feature_flags_cached = True
        rbac_mode = get_tenant_rbac_mode(tenant_feature_flags)
        if rbac_mode == RBAC_MODE_OFF:
            return

        role = await get_user_role_for_tenant(db, user, user.tenant_id)
        granted = internal_permission_granted(role=role, permission_key=permission_key)
        if granted:
            return

        role_name = (role.name if role else "").strip().lower() or "unknown"
        if rbac_mode != RBAC_MODE_ENFORCE:
            logger.warning(
                "rbac_shadow_denial tenant_id=%s user_id=%s role=%s permission=%s method=%s path=%s request_id=%s",
                user.tenant_id,
                user.id,
                role_name,
                permission_key,
                request.method,
                request.url.path,
                request.headers.get("X-Request-Id"),
            )
            return
        if not granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission_key}",
            )

    return _dep
