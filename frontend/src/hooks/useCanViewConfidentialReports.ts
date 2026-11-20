import { useAuth } from "@/context/AuthContext";

/**
 * Profit & Loss / Balance Sheet navigation and pages.
 * Undefined/`true` = allow (flag OFF or Class 1 / Super). Explicit `false` on `/me` denies.
 */
export function useCanViewConfidentialReports(): boolean {
  return useAuth().me?.can_view_pnl_balance_sheet !== false;
}

export const CONFIDENTIAL_REPORTS_DENIED =
  "Profit & Loss and Balance Sheet are limited to Class 1 (with Finance) and Super Admin.";
