"""Stable keys and helpers for ``tenants.feature_flags`` JSON."""

from __future__ import annotations

from typing import Any, Literal

# When true, PO/GRN paths that tie to an order require Order.master_contract_id (409 if missing).
REQUIRE_MASTER_CONTRACT_FOR_RM = "require_master_contract_for_rm"

# When true, Knitting APIs and UI are enabled (optional production unit hub + finance hooks).
KNITTING_ENABLED = "knitting_enabled"

# RBAC rollout mode: "off" (no checks), "shadow" (log-only), "enforce" (deny on miss).
RBAC_ENFORCEMENT = "rbac_enforcement"
RBAC_MODE_OFF: Literal["off"] = "off"
RBAC_MODE_SHADOW: Literal["shadow"] = "shadow"
RBAC_MODE_ENFORCE: Literal["enforce"] = "enforce"
RBAC_MODES: tuple[str, str, str] = (RBAC_MODE_OFF, RBAC_MODE_SHADOW, RBAC_MODE_ENFORCE)

# Internal single-session policy toggle.
SINGLE_SESSION_ENFORCED = "single_session_enforced"

# true: finance.* / hr.* fine-grained keys need an explicit grant (manager-type roles bypass)
# instead of "missing key = allowed". Default off; turn on per tenant after granting roles.
STRICT_SENSITIVE_PERMISSIONS = "strict_sensitive_permissions"

# When true, read stock summary rows from `inventory_stock_balance_snapshots` if populated (see stock_snapshot_service).
STOCK_SNAPSHOT_READS = "stock_snapshot_reads"

# Order execution spine (default off — additive / reversible).
TNA_EVENT_SYNC = "tna_event_sync"
REQUIRE_ORDER_ID_ON_SHOP_FLOOR = "require_order_id_on_shop_floor"
LINE_ALLOCATION_CONFIRM_ENABLED = "line_allocation_confirm_enabled"
SAMPLE_APPROVAL_GATES_FOR_PO = "sample_approval_gates_for_po"
CAPA_BLOCKS_CHALLAN = "capa_blocks_challan"

# When true, payroll run auto-calculate apply is allowed (default off — strict True check).
PAYROLL_AUTO_CALCULATE_ENABLED = "payroll_auto_calculate_enabled"

# Phase 1.5 demo mode banner + seed marker (seed writes marker object; banner uses bool).
DEMO_MODE_ENABLED = "demo_mode_enabled"
DEMO_SEED_PHASE1_V1 = "demo_seed_phase1_v1"

# Budget posting enforcement: "off" | "warn" | "block" (default off).
BUDGET_ENFORCEMENT_MODE = "budget_enforcement_mode"
BUDGET_MODE_OFF: Literal["off"] = "off"
BUDGET_MODE_WARN: Literal["warn"] = "warn"
BUDGET_MODE_BLOCK: Literal["block"] = "block"
BUDGET_ENFORCEMENT_MODES: tuple[str, str, str] = (BUDGET_MODE_OFF, BUDGET_MODE_WARN, BUDGET_MODE_BLOCK)

# When not explicitly false, auto-post WIP journals from inventory/manufacturing paths (default on).
AUTO_POST_WIP_JOURNAL = "auto_post_wip_journal"

# Bill-wise party ledger (Sprint 1) — master flag default off.
PARTY_LEDGER_ENABLED = "party_ledger_enabled"
# When parent enabled: auto-allocate RECEIPT/PAYMENT FIFO unless explicitly false.
PARTY_LEDGER_AUTO_ALLOCATE = "party_ledger_auto_allocate"
# Interest accrual on overdue bills (default off).
PARTY_LEDGER_INTEREST_CALC = "party_ledger_interest_calc"

# Sprint 2 stock hierarchy / batch / godown (default off).
STOCK_HIERARCHY_ENABLED = "stock_hierarchy_enabled"
BATCH_TRACKING_ENABLED = "batch_tracking_enabled"

# Sprint 3 GST / tax ledger (default off).
GST_SYSTEM_ENABLED = "gst_system_enabled"
AUTO_TAX_CALCULATION = "auto_tax_calculation"
GST_SETTINGS_KEY = "gst_settings"

# Sprint 4 advanced vouchers (all default off).
CREDIT_DEBIT_NOTE_ENABLED = "credit_debit_note_enabled"
STOCK_TRANSFER_VOUCHER_ENABLED = "stock_transfer_voucher_enabled"
MEMORANDUM_VOUCHER_ENABLED = "memorandum_voucher_enabled"
OPTIONAL_VOUCHER_ENABLED = "optional_voucher_enabled"
POST_DATED_VOUCHER_ENABLED = "post_dated_voucher_enabled"
RECURRING_VOUCHER_ENABLED = "recurring_voucher_enabled"
VOUCHER_CLASS_ENABLED = "voucher_class_enabled"

# Sprint 5 statutory compliance (default off).
TDS_SYSTEM_ENABLED = "tds_system_enabled"
STATUTORY_PAYROLL_ENABLED = "statutory_payroll_enabled"
# When true (default off), posting a PAYMENT with auto TDS splits it inside the payment:
# Dr Vendor (gross) / Cr Bank (net) / Cr TDS payable (tds).
TDS_SPLIT_IN_PAYMENT = "tds_split_in_payment"
# When true (default off), payroll posting books gross salary: Dr Salary expense (gross + employer
# contributions) / Cr PF, ESI, PT and other deduction liabilities / Cr Salary payable (net).
PAYROLL_GROSS_POSTING = "payroll_gross_posting"
# Loss of pay in payroll auto-calculate (default ON — explicit False switches off): fixed salary is
# prorated by payable days (unpaid absences / unpaid leave / joining or leaving mid-period).
# Runs that were already auto-calculated without it keep their old numbers.
PAYROLL_LOP_ENABLED = "payroll_lop_enabled"

# Sprint H1 compliance / OCR / AI / documents (all default off).
COMPLIANCE_TRACKING_ENABLED = "compliance_tracking_enabled"
AGE_VERIFICATION_REQUIRED = "age_verification_required"
MEDICAL_CERTIFICATE_TRACKING_ENABLED = "medical_certificate_tracking_enabled"
OCR_CV_EXTRACTION_ENABLED = "ocr_cv_extraction_enabled"
OCR_ID_EXTRACTION_ENABLED = "ocr_id_extraction_enabled"
OCR_MEDICAL_EXTRACTION_ENABLED = "ocr_medical_extraction_enabled"
AI_ATTENDANCE_ANALYSIS_ENABLED = "ai_attendance_analysis_enabled"
AI_TURNOVER_PREDICTION_ENABLED = "ai_turnover_prediction_enabled"
AI_PAYROLL_ANOMALY_DETECTION_ENABLED = "ai_payroll_anomaly_detection_enabled"
AI_COMPLIANCE_RISK_PREDICTION_ENABLED = "ai_compliance_risk_prediction_enabled"
AUTO_DOCUMENT_GENERATION_ENABLED = "auto_document_generation_enabled"

# Sprint 6 MIS reports (default ON — read-only).
MIS_REPORTS_ENABLED = "mis_reports_enabled"

# Sprint I1 MRP / IDT / process loss (all default off).
MRP_ENGINE_ENABLED = "mrp_engine_enabled"
AUTO_REORDER_ENABLED = "auto_reorder_enabled"
INTER_DEPARTMENT_TRANSFER_ENABLED = "inter_department_transfer_enabled"
PROCESS_LOSS_TRACKING_ENABLED = "process_loss_tracking_enabled"
JOB_WORK_COSTING_ENABLED = "job_work_costing_enabled"

# Sprint I2 GRN quality inspection (default off).
GRN_QUALITY_INSPECTION_ENABLED = "grn_quality_inspection_enabled"

# Sprint I3 ABC / EOQ / aging / cycle count.
# ABC, EOQ, aging default ON when flag missing; cycle counting defaults OFF.
ABC_ANALYSIS_ENABLED = "abc_analysis_enabled"
EOQ_CALCULATION_ENABLED = "eoq_calculation_enabled"
STOCK_AGING_ENABLED = "stock_aging_enabled"
CYCLE_COUNTING_ENABLED = "cycle_counting_enabled"
# Optional numeric EOQ settings stored in feature_flags JSON
EOQ_ORDERING_COST = "eoq_ordering_cost"
EOQ_HOLDING_COST_RATE = "eoq_holding_cost_rate"

# Sprint I4 serial / kit / consignment (all default off).
SERIAL_TRACKING_ENABLED = "serial_tracking_enabled"

# R4 RMG depth (default ON — a tenant can switch each one off with an explicit False).
ORDER_COLOR_SIZE_MATRIX_ENABLED = "order_color_size_matrix_enabled"
COMMISSION_ENGINE_ENABLED = "commission_engine_enabled"
TRACEABILITY_ENABLED = "traceability_enabled"
PACKING_LIST_CARTONS_ENABLED = "packing_list_cartons_enabled"
SHOP_FLOOR_SCAN_ENABLED = "shop_floor_scan_enabled"
BD_BOND_COMPLIANCE_ENABLED = "bd_bond_compliance_enabled"
PO_COLOR_SIZE_MATRIX_ENABLED = "po_color_size_matrix_enabled"

# R5 governed AI (default ON — explicit False switches off).
AI_EXCEPTION_AGENTS_ENABLED = "ai_exception_agents_enabled"
AI_DASHBOARD_CARDS_ENABLED = "ai_dashboard_cards_enabled"
# Read-only hints beside the voucher form (ledger balances, usual accounts, AI narration).
VOUCHER_ENTRY_ASSIST_ENABLED = "voucher_entry_assist_enabled"

# Flags that are on for every tenant (existing and new) unless explicitly set to False.
# API payloads read by the frontend (`/auth/me`, `/settings/config`) fill these in as True when missing.
DEFAULT_ON_FEATURE_FLAGS: tuple[str, ...] = (
    ORDER_COLOR_SIZE_MATRIX_ENABLED,
    COMMISSION_ENGINE_ENABLED,
    TRACEABILITY_ENABLED,
    PACKING_LIST_CARTONS_ENABLED,
    SHOP_FLOOR_SCAN_ENABLED,
    BD_BOND_COMPLIANCE_ENABLED,
    PO_COLOR_SIZE_MATRIX_ENABLED,
    AI_EXCEPTION_AGENTS_ENABLED,
    AI_DASHBOARD_CARDS_ENABLED,
    VOUCHER_ENTRY_ASSIST_ENABLED,
)

KITTING_ENABLED = "kitting_enabled"
CONSIGNMENT_STOCK_ENABLED = "consignment_stock_enabled"

# Benchmark roadmap item 8: requisition -> quotations -> comparative statement -> PO (default OFF).
PROCUREMENT_CS_ENABLED = "procurement_cs_enabled"

# Benchmark roadmap item 12: month (1-12) the financial year starts in; missing = 1 (calendar year).
# Bangladesh companies usually use 7 (July-June).
FISCAL_YEAR_START_MONTH = "fiscal_year_start_month"

# Benchmark roadmap item 13: company VAT Business Identification Number printed on Mushak forms.
VAT_BIN = "vat_bin"

# Benchmark roadmap item 15: Tally-style "save = post" for small teams (default OFF; maker-checker stays the default).
DIRECT_POST_VOUCHERS = "direct_post_vouchers"


def is_direct_post_vouchers_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, DIRECT_POST_VOUCHERS)


def _flag_true(feature_flags: Any, key: str) -> bool:
    if not isinstance(feature_flags, dict):
        return False
    return feature_flags.get(key) is True


def _flag_default_true(feature_flags: Any, key: str) -> bool:
    """Enabled unless explicitly set to False (Sprint I3 read-mostly flags)."""
    if not isinstance(feature_flags, dict):
        return True
    if key not in feature_flags:
        return True
    return feature_flags.get(key) is not False


def with_effective_default_flags(feature_flags: Any) -> dict[str, Any]:
    """Copy of ``feature_flags`` with each ``DEFAULT_ON_FEATURE_FLAGS`` key set to True when missing.

    The frontend checks these keys with ``=== true``; filling them here keeps that
    check correct without storing anything. Explicit False values are kept.
    """
    flags = dict(feature_flags) if isinstance(feature_flags, dict) else {}
    for key in DEFAULT_ON_FEATURE_FLAGS:
        if key not in flags:
            flags[key] = True
    # The frontend mirrors get_tenant_rbac_mode; report the effective mode when the tenant has none.
    if RBAC_ENFORCEMENT not in flags and default_rbac_mode() != RBAC_MODE_OFF:
        flags[RBAC_ENFORCEMENT] = default_rbac_mode()
    return flags


def is_order_color_size_matrix_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, ORDER_COLOR_SIZE_MATRIX_ENABLED)


def is_shop_floor_scan_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, SHOP_FLOOR_SCAN_ENABLED)


def is_bd_bond_compliance_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, BD_BOND_COMPLIANCE_ENABLED)


def is_po_color_size_matrix_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, PO_COLOR_SIZE_MATRIX_ENABLED)


def is_ai_exception_agents_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, AI_EXCEPTION_AGENTS_ENABLED)


def is_ai_dashboard_cards_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, AI_DASHBOARD_CARDS_ENABLED)


def is_voucher_entry_assist_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, VOUCHER_ENTRY_ASSIST_ENABLED)


def is_packing_list_cartons_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, PACKING_LIST_CARTONS_ENABLED)


def is_traceability_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, TRACEABILITY_ENABLED)


def is_commission_engine_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, COMMISSION_ENGINE_ENABLED)


def is_tna_event_sync_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, TNA_EVENT_SYNC)


def is_require_order_id_on_shop_floor(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, REQUIRE_ORDER_ID_ON_SHOP_FLOOR)


def is_line_allocation_confirm_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, LINE_ALLOCATION_CONFIRM_ENABLED)


def is_sample_approval_gates_for_po(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, SAMPLE_APPROVAL_GATES_FOR_PO)


def is_capa_blocks_challan(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, CAPA_BLOCKS_CHALLAN)


def is_payroll_auto_calculate_enabled(feature_flags: Any) -> bool:
    """Strict: only explicit True enables apply (missing / false / other → off)."""
    return _flag_true(feature_flags, PAYROLL_AUTO_CALCULATE_ENABLED)


def is_strict_sensitive_permissions(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, STRICT_SENSITIVE_PERMISSIONS)


def is_demo_mode_enabled(feature_flags: Any) -> bool:
    """Show Demo Mode banner when flag is explicitly true."""
    return _flag_true(feature_flags, DEMO_MODE_ENABLED)


def default_rbac_mode() -> Literal["off", "shadow", "enforce"]:
    """Mode for tenants without their own ``rbac_enforcement`` flag (env RBAC_DEFAULT_MODE, default off)."""
    from app.config import get_settings

    raw = str(getattr(get_settings(), "rbac_default_mode", "") or "").strip().lower()
    return raw if raw in RBAC_MODES else RBAC_MODE_OFF  # type: ignore[return-value]


def get_tenant_rbac_mode(feature_flags: Any) -> Literal["off", "shadow", "enforce"]:
    """Return normalized RBAC mode from tenant feature flags (fallback: ``default_rbac_mode()``)."""
    if not isinstance(feature_flags, dict):
        return default_rbac_mode()
    raw = feature_flags.get(RBAC_ENFORCEMENT)
    if isinstance(raw, str):
        normalized = raw.strip().lower()
        if normalized in RBAC_MODES:
            return normalized  # type: ignore[return-value]
    return default_rbac_mode()


def is_single_session_enforced(feature_flags: Any) -> bool:
    """Return True if single-session login enforcement applies (global setting or tenant flag)."""
    from app.config import get_settings

    if get_settings().single_session_global:
        return True
    if not isinstance(feature_flags, dict):
        return False
    return feature_flags.get(SINGLE_SESSION_ENFORCED) is True


def is_stock_snapshot_reads_enabled(feature_flags: Any) -> bool:
    """When True, inventory stock-summary helpers may read precomputed snapshot rows (default off)."""
    if not isinstance(feature_flags, dict):
        return False
    return feature_flags.get(STOCK_SNAPSHOT_READS) is True


def get_budget_enforcement_mode(feature_flags: Any) -> Literal["off", "warn", "block"]:
    """Return budget enforcement mode from tenant feature flags (safe default: off)."""
    if not isinstance(feature_flags, dict):
        return BUDGET_MODE_OFF
    raw = feature_flags.get(BUDGET_ENFORCEMENT_MODE)
    if isinstance(raw, str):
        normalized = raw.strip().lower()
        if normalized in BUDGET_ENFORCEMENT_MODES:
            return normalized  # type: ignore[return-value]
    return BUDGET_MODE_OFF


def is_auto_post_wip_journal_enabled(feature_flags: Any) -> bool:
    """WIP→GL auto-post is on unless the flag is explicitly False (missing key ⇒ True)."""
    if not isinstance(feature_flags, dict):
        return True
    return feature_flags.get(AUTO_POST_WIP_JOURNAL) is not False


def is_party_ledger_enabled(feature_flags: Any) -> bool:
    """Strict: only explicit True enables party ledger (default off)."""
    return _flag_true(feature_flags, PARTY_LEDGER_ENABLED)


def is_party_ledger_auto_allocate(feature_flags: Any) -> bool:
    """FIFO auto-allocate when party ledger is enabled, unless auto_allocate is explicitly False."""
    if not is_party_ledger_enabled(feature_flags):
        return False
    if not isinstance(feature_flags, dict):
        return True
    return feature_flags.get(PARTY_LEDGER_AUTO_ALLOCATE) is not False


def is_party_ledger_interest_calc(feature_flags: Any) -> bool:
    """Interest calc only when both master flag and interest flag are True."""
    return is_party_ledger_enabled(feature_flags) and _flag_true(feature_flags, PARTY_LEDGER_INTEREST_CALC)


def is_stock_hierarchy_enabled(feature_flags: Any) -> bool:
    """Strict: only explicit True enables stock hierarchy / godown matrix APIs (default off)."""
    return _flag_true(feature_flags, STOCK_HIERARCHY_ENABLED)


def is_batch_tracking_enabled(feature_flags: Any) -> bool:
    """Physical batch create/allocate on GRN/DC (default off). Independent of hierarchy flag."""
    return _flag_true(feature_flags, BATCH_TRACKING_ENABLED)


def is_gst_system_enabled(feature_flags: Any) -> bool:
    """Strict: only explicit True enables GST/tax ledger APIs (default off)."""
    return _flag_true(feature_flags, GST_SYSTEM_ENABLED)


def is_auto_tax_calculation(feature_flags: Any) -> bool:
    """Auto tax on voucher create/update when GST is enabled, unless explicitly False."""
    if not is_gst_system_enabled(feature_flags):
        return False
    if not isinstance(feature_flags, dict):
        return True
    return feature_flags.get(AUTO_TAX_CALCULATION) is not False


def get_gst_settings(feature_flags: Any) -> dict[str, Any]:
    """Tenant GST registration settings stored under feature_flags.gst_settings."""
    if not isinstance(feature_flags, dict):
        return {}
    raw = feature_flags.get(GST_SETTINGS_KEY)
    return dict(raw) if isinstance(raw, dict) else {}


def is_credit_debit_note_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, CREDIT_DEBIT_NOTE_ENABLED)


def is_stock_transfer_voucher_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, STOCK_TRANSFER_VOUCHER_ENABLED)


def is_memorandum_voucher_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, MEMORANDUM_VOUCHER_ENABLED)


def is_optional_voucher_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, OPTIONAL_VOUCHER_ENABLED)


def is_post_dated_voucher_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, POST_DATED_VOUCHER_ENABLED)


def is_recurring_voucher_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, RECURRING_VOUCHER_ENABLED)


def is_voucher_class_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, VOUCHER_CLASS_ENABLED)


def is_tds_system_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, TDS_SYSTEM_ENABLED)


def is_tds_split_in_payment_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, TDS_SPLIT_IN_PAYMENT)


def is_payroll_gross_posting_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, PAYROLL_GROSS_POSTING)


def is_payroll_lop_enabled(feature_flags: Any) -> bool:
    """Loss of pay is on unless the tenant explicitly sets ``payroll_lop_enabled`` to False."""
    return _flag_default_true(feature_flags, PAYROLL_LOP_ENABLED)


def is_statutory_payroll_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, STATUTORY_PAYROLL_ENABLED)


def is_compliance_tracking_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, COMPLIANCE_TRACKING_ENABLED)


def is_age_verification_required(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AGE_VERIFICATION_REQUIRED)


def is_medical_certificate_tracking_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, MEDICAL_CERTIFICATE_TRACKING_ENABLED)


def is_ocr_cv_extraction_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, OCR_CV_EXTRACTION_ENABLED)


def is_ocr_id_extraction_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, OCR_ID_EXTRACTION_ENABLED)


def is_ocr_medical_extraction_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, OCR_MEDICAL_EXTRACTION_ENABLED)


def is_ai_attendance_analysis_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AI_ATTENDANCE_ANALYSIS_ENABLED)


def is_ai_turnover_prediction_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AI_TURNOVER_PREDICTION_ENABLED)


def is_ai_payroll_anomaly_detection_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AI_PAYROLL_ANOMALY_DETECTION_ENABLED)


def is_ai_compliance_risk_prediction_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AI_COMPLIANCE_RISK_PREDICTION_ENABLED)


def is_auto_document_generation_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AUTO_DOCUMENT_GENERATION_ENABLED)


def is_mis_reports_enabled(feature_flags: Any) -> bool:
    """MIS reports are on unless explicitly set to False (missing key ⇒ True)."""
    if not isinstance(feature_flags, dict):
        return True
    return feature_flags.get(MIS_REPORTS_ENABLED) is not False


def is_mrp_engine_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, MRP_ENGINE_ENABLED)


def is_procurement_cs_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, PROCUREMENT_CS_ENABLED)


def is_auto_reorder_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, AUTO_REORDER_ENABLED)


def is_inter_department_transfer_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, INTER_DEPARTMENT_TRANSFER_ENABLED)


def is_process_loss_tracking_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, PROCESS_LOSS_TRACKING_ENABLED)


def is_job_work_costing_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, JOB_WORK_COSTING_ENABLED)


def is_grn_quality_inspection_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, GRN_QUALITY_INSPECTION_ENABLED)


def is_abc_analysis_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, ABC_ANALYSIS_ENABLED)


def is_eoq_calculation_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, EOQ_CALCULATION_ENABLED)


def is_stock_aging_enabled(feature_flags: Any) -> bool:
    return _flag_default_true(feature_flags, STOCK_AGING_ENABLED)


def is_cycle_counting_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, CYCLE_COUNTING_ENABLED)


def is_serial_tracking_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, SERIAL_TRACKING_ENABLED)


def is_kitting_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, KITTING_ENABLED)


def is_consignment_stock_enabled(feature_flags: Any) -> bool:
    return _flag_true(feature_flags, CONSIGNMENT_STOCK_ENABLED)


def get_eoq_ordering_cost(feature_flags: Any, default: float = 100.0) -> float:
    if not isinstance(feature_flags, dict):
        return default
    raw = feature_flags.get(EOQ_ORDERING_COST)
    try:
        v = float(raw)
        return v if v > 0 else default
    except (TypeError, ValueError):
        return default


def get_eoq_holding_cost_rate(feature_flags: Any, default: float = 0.10) -> float:
    if not isinstance(feature_flags, dict):
        return default
    raw = feature_flags.get(EOQ_HOLDING_COST_RATE)
    try:
        v = float(raw)
        return v if v > 0 else default
    except (TypeError, ValueError):
        return default


# --- Write-time validation -------------------------------------------------
# Whitelist of feature_flag keys whose value is an enum string. Writes go
# through ``normalize_feature_flags`` so the canonical form (``strip().lower()``)
# is what actually lands in the JSON column. Readers like
# ``get_tenant_rbac_mode`` keep tolerating legacy non-canonical values for
# backward compatibility, but new writes must be canonical.
ENUM_FEATURE_FLAG_VALUES: dict[str, frozenset[str]] = {
    RBAC_ENFORCEMENT: frozenset(RBAC_MODES),
    BUDGET_ENFORCEMENT_MODE: frozenset(BUDGET_ENFORCEMENT_MODES),
}


def normalize_feature_flag_value(key: str, value: Any) -> Any:
    """Validate + canonicalize a single feature_flag value at write-time.

    For known enum keys (currently ``rbac_enforcement``), a string value is
    trimmed and lowercased before being checked against the allowed set.
    Anything else is rejected with ``ValueError`` so the caller can surface
    a 400. Unknown keys (e.g. brand-new flags this validator hasn't been
    taught about yet) and ``None`` values pass through untouched, which keeps
    feature rollouts forward-compatible.
    """
    if key == VAT_BIN and value is not None:
        cleaned = str(value).strip().replace("-", "").replace(" ", "")
        if cleaned == "":
            return None
        if not cleaned.isdigit() or not 9 <= len(cleaned) <= 13:
            raise ValueError(f"feature_flags['{key}'] must be a 9-13 digit BIN (got {value!r})")
        return cleaned
    if key == FISCAL_YEAR_START_MONTH and value is not None:
        try:
            month = int(value)
        except (TypeError, ValueError):
            raise ValueError(f"feature_flags['{key}'] must be a month number 1-12") from None
        if isinstance(value, bool) or not 1 <= month <= 12 or float(value) != month:
            raise ValueError(f"feature_flags['{key}'] must be a month number 1-12 (got {value!r})")
        return month
    allowed = ENUM_FEATURE_FLAG_VALUES.get(key)
    if allowed is None or value is None:
        return value
    if not isinstance(value, str):
        raise ValueError(
            f"feature_flags['{key}'] must be one of {sorted(allowed)} "
            f"(got {type(value).__name__})"
        )
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(
            f"feature_flags['{key}'] must be one of {sorted(allowed)} (got '{value}')"
        )
    return normalized


def normalize_feature_flags(payload: Any) -> dict[str, Any] | None:
    """Validate + canonicalize an entire feature_flags payload.

    Returns ``None`` when ``payload`` is ``None`` (caller didn't ask to
    change flags). Raises ``ValueError`` if the payload isn't a JSON object
    or any enum-keyed value is invalid.
    """
    if payload is None:
        return None
    if not isinstance(payload, dict):
        raise ValueError("feature_flags must be a JSON object")
    return {key: normalize_feature_flag_value(key, value) for key, value in payload.items()}
