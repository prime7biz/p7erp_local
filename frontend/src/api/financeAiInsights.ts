/**
 * "Explain this report" finance AI commentary (Finance modernization, Phase 5).
 * Backend: backend/app/modules/finance/ai_insights/ (router.py, schemas.py, constants.py).
 * Read-only: the server works out every figure first and only lets the AI quote those facts.
 * Tenant flag `finance_ai_insights_v2` (otherwise 404); permission `ai.tools.finance.read` (otherwise 403).
 * Fact values are decimal STRINGS.
 */
import { request } from "@/api/core";

const BASE = "/api/v1/finance";

/** Mirror of `MAX_QUESTION_CHARS` in backend constants.py. */
export const MAX_COMMENTARY_QUESTION_CHARS = 300;

export type CommentaryReport =
  | "trial_balance"
  | "balance_sheet"
  | "profit_loss"
  | "cash_flow_monthly"
  | "funds_flow_monthly"
  | "ratio_analysis"
  | "budget_analytics"
  | "expense_analysis"
  | "control_tower";

export type CommentaryComparison = "none" | "previous_period" | "previous_year";

/** The report period: either a whole financial year (start year, e.g. 2026) or From / To dates. Never both. */
export interface CommentaryPeriodQuery {
  fiscal_year?: number;
  from_date?: string;
  to_date?: string;
}

export interface CommentaryRequest extends CommentaryPeriodQuery {
  report: CommentaryReport;
  comparison: CommentaryComparison;
  question?: string;
  use_ai?: boolean;
}

export interface CommentaryFinding {
  text: string;
  fact_ids: string[];
}

export type FactUnit = "currency" | "percent" | "count" | "days" | "ratio";

export interface CommentaryFact {
  id: string;
  label: string;
  value: string;
  unit: FactUnit;
}

export interface CommentaryPeriod {
  from_date?: string | null;
  to_date?: string | null;
  fiscal_year?: number | null;
  comparison: CommentaryComparison;
  previous_from_date?: string | null;
  previous_to_date?: string | null;
}

export interface CommentaryResponse {
  report: string;
  summary: string;
  findings: CommentaryFinding[];
  source: "ai" | "deterministic";
  deterministic_fallback: boolean;
  /** Short reason code when AI was not used (never provider text). */
  reason?: string | null;
  facts: CommentaryFact[];
  period: CommentaryPeriod;
  base_currency: string;
  notes: string[];
  data_as_of: string;
}

export const financeAiInsightsApi = {
  getCommentary: (body: CommentaryRequest) =>
    request<CommentaryResponse>(`${BASE}/statements/commentary`, { method: "POST", body: JSON.stringify(body) }),
};
