/**
 * Small pure helpers for the "Explain this report" panel (no React, easy to test).
 * Fact values are decimal strings and stay strings.
 */
import type { CommentaryFact, CommentaryResponse } from "@/api/financeAiInsights";
import { formatIndian, formatPlain } from "@/components/finance/statements/statementFormat";

/** Fallback reason codes from backend `ai_insights/constants.py` turned into plain words. */
const REASON_TEXT: Record<string, string> = {
  no_facts: "There were no figures to explain for this period.",
  ai_policy_denied: "Your company's AI settings do not allow AI for this request.",
  provider_error: "The AI service returned an error.",
  provider_unavailable_or_budget_exhausted: "The AI service is not available, or your company's AI budget is used up.",
  provider_timeout: "The AI service took too long to answer.",
};

const VALIDATION_TEXT =
  "The AI answer used a number that could not be checked against the report, so it was not shown.";

/** Why the calculated (non-AI) commentary is shown. Empty text when AI was used. */
export function fallbackReasonText(res: Pick<CommentaryResponse, "source" | "reason">): string {
  if (res.source === "ai") return "";
  const reason = res.reason ?? "";
  if (reason.startsWith("validation_failed:")) return VALIDATION_TEXT;
  return REASON_TEXT[reason] ?? "AI was not used for this answer.";
}

/** Badge text: "AI" or "Calculated (no AI)". */
export function sourceBadgeText(source: CommentaryResponse["source"]): string {
  return source === "ai" ? "AI" : "Calculated (no AI)";
}

/** A fact value for a chip: money with lakh/crore grouping, percent with "%", days and counts as whole numbers. */
export function formatFactValue(fact: Pick<CommentaryFact, "value" | "unit">, currency = ""): string {
  switch (fact.unit) {
    case "currency":
      return `${currency ? `${currency} ` : ""}${formatIndian(fact.value)}`;
    case "percent":
      return `${formatPlain(fact.value, 2)}%`;
    case "count":
      return formatPlain(fact.value, 0);
    case "days":
      return `${formatPlain(fact.value, 0)} days`;
    default:
      return formatPlain(fact.value, 2);
  }
}

/** The facts a finding cites, in the order it cites them. Unknown ids are skipped. */
export function citedFacts(factIds: readonly string[], facts: readonly CommentaryFact[]): CommentaryFact[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const out: CommentaryFact[] = [];
  for (const id of factIds) {
    const fact = byId.get(id);
    if (fact) out.push(fact);
  }
  return out;
}
