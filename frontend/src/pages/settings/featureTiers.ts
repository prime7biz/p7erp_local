/**
 * Tally F11-style progressive features for Settings → Configuration.
 * "Essential" shows what most companies need; "More" and "All" reveal advanced switches.
 * Hidden switches keep their saved values — the tier only changes what is shown.
 */

export type FeatureTier = "essential" | "more" | "all";

export const FEATURE_TIER_LABEL: Record<FeatureTier, string> = {
  essential: "Essential",
  more: "More features",
  all: "All features",
};

const RANK: Record<FeatureTier, number> = { essential: 0, more: 1, all: 2 };

export function tierVisible(section: FeatureTier, view: FeatureTier): boolean {
  return RANK[section] <= RANK[view];
}

/** Switch keys that live in "More" and "All" sections (used to warn about switches that are on but hidden). */
export const TIER_KEYS: Record<Exclude<FeatureTier, "essential">, string[]> = {
  more: [
    "require_master_contract_for_rm",
    "knitting_enabled",
    "control_tower_enabled",
    "auto_line_booking_enabled",
    "credit_debit_note_enabled",
    "stock_transfer_voucher_enabled",
    "memorandum_voucher_enabled",
    "optional_voucher_enabled",
    "post_dated_voucher_enabled",
    "recurring_voucher_enabled",
    "voucher_class_enabled",
    "direct_post_vouchers",
    "tna_event_sync",
    "require_order_id_on_shop_floor",
    "line_allocation_confirm_enabled",
    "sample_approval_gates_for_po",
    "capa_blocks_challan",
    "procurement_cs_enabled",
    "payroll_auto_calculate_enabled",
    "payroll_four_eyes_approval",
    "mobile_ui_v2",
    "finance_hubs_v2",
  ],
  all: [
    "tds_system_enabled",
    "finance_statements_v2",
    "finance_control_tower_v2",
    "statutory_payroll_enabled",
    "compliance_tracking_enabled",
    "age_verification_required",
    "medical_certificate_tracking_enabled",
    "ocr_cv_extraction_enabled",
    "ocr_id_extraction_enabled",
    "ocr_medical_extraction_enabled",
    "auto_document_generation_enabled",
    "hr_onboarding_workspace_v2",
    "ai_attendance_analysis_enabled",
    "ai_turnover_prediction_enabled",
    "ai_payroll_anomaly_detection_enabled",
    "ai_compliance_risk_prediction_enabled",
  ],
};

/** How many switches are ON in sections the current view hides. */
export function hiddenEnabledCount(flags: Record<string, unknown>, view: FeatureTier): number {
  const hidden = (["more", "all"] as const).filter((t) => !tierVisible(t, view)).flatMap((t) => TIER_KEYS[t]);
  return hidden.filter((k) => flags[k] === true).length;
}

const STORAGE_KEY = "p7_settings_feature_tier";

export function readStoredTier(): FeatureTier {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return v === "more" || v === "all" ? v : "essential";
}

export function storeTier(t: FeatureTier): void {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* private mode — selection just isn't remembered */
  }
}
