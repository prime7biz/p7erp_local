import { useEffect, useState, type FormEvent } from "react";
import { Sparkles, X } from "lucide-react";
import {
  MAX_COMMENTARY_QUESTION_CHARS,
  type CommentaryComparison,
  type CommentaryPeriodQuery,
  type CommentaryReport,
} from "@/api/financeAiInsights";
import { useFinanceAiInsightsEnabled, useFinanceCommentary } from "@/hooks/useFinanceAiInsights";
import { citedFacts, fallbackReasonText, formatFactValue, sourceBadgeText } from "./aiCommentaryLogic";

interface Props {
  /** Which report the page shows (backend `ReportName`). */
  report: CommentaryReport;
  /** The page's current period: a financial year (start year) or From / To dates, never both. */
  period: CommentaryPeriodQuery;
}

const COMPARISON_OPTIONS: { value: CommentaryComparison; label: string }[] = [
  { value: "none", label: "No comparison" },
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year", label: "Previous year" },
];

const NO_PERMISSION_TEXT = "You do not have permission to use finance AI";

const fieldClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";
const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50";

/**
 * "Explain this report": asks the server for a short commentary on the report the user is looking at.
 * Read-only. The server works out every figure first; the AI may only quote those facts (each finding
 * shows its facts as chips). When AI is not used, the calculated commentary is shown with the reason.
 * Shown only while the tenant flag `finance_ai_insights_v2` is exactly true; a 404 hides it.
 */
export function FinanceAiCommentaryPanel({ report, period }: Props) {
  const enabled = useFinanceAiInsightsEnabled();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [comparison, setComparison] = useState<CommentaryComparison>("none");
  const { data, loading, error, errorStatus, run, reset } = useFinanceCommentary();

  // A new report period makes an old answer misleading: clear it.
  const periodKey = `${report}|${period.fiscal_year ?? ""}|${period.from_date ?? ""}|${period.to_date ?? ""}`;
  useEffect(() => {
    reset();
  }, [periodKey, reset]);

  if (!enabled || errorStatus === 404) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = question.trim().slice(0, MAX_COMMENTARY_QUESTION_CHARS);
    // Only the period fields: the server refuses unknown fields (and a year together with dates).
    const when: CommentaryPeriodQuery =
      period.fiscal_year != null
        ? { fiscal_year: period.fiscal_year }
        : { from_date: period.from_date || undefined, to_date: period.to_date || undefined };
    run({ report, ...when, comparison, ...(text ? { question: text } : {}) });
  }

  if (!open) {
    return (
      <div className="no-print">
        <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Explain this report
        </button>
      </div>
    );
  }

  const facts = data?.facts ?? [];
  const currency = data?.base_currency ?? "";
  const reason = data ? fallbackReasonText(data) : "";

  return (
    <section
      aria-label="Explain this report"
      className="no-print space-y-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
            Explain this report
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Read-only. Every number in the answer is checked against the calculated report.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-border p-1.5 text-text-secondary hover:bg-surface-subtle"
          aria-label="Close explanation"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <label className="min-w-[16rem] flex-1 text-xs font-medium text-text-muted">
          Question (optional)
          <input
            type="text"
            className={`${fieldClass} mt-1 block w-full`}
            value={question}
            maxLength={MAX_COMMENTARY_QUESTION_CHARS}
            placeholder="e.g. Why did gross margin fall?"
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_COMMENTARY_QUESTION_CHARS))}
          />
          <span className="mt-0.5 block text-right font-normal" data-testid="ai-question-count">
            {question.length}/{MAX_COMMENTARY_QUESTION_CHARS}
          </span>
        </label>
        <label className="text-xs font-medium text-text-muted">
          Compare with
          <select
            className={`${fieldClass} mt-1 block`}
            value={comparison}
            onChange={(e) => setComparison(e.target.value as CommentaryComparison)}
          >
            {COMPARISON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={`${buttonClass} mb-5`} disabled={loading}>
          {loading ? "Explaining…" : "Explain"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-text-muted" aria-busy="true">
          Working out the explanation…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {errorStatus === 403 ? NO_PERMISSION_TEXT : error}
        </p>
      ) : null}

      {data ? (
        <div className="space-y-3" data-testid="ai-commentary-result">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="ai-source-badge"
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                data.source === "ai"
                  ? "border-brand-primary/30 bg-brand-primary/10 text-brand-primary"
                  : "border-border bg-surface-subtle text-text-secondary"
              }`}
            >
              {sourceBadgeText(data.source)}
            </span>
            {reason ? <span className="text-xs text-text-muted">{reason} The calculated summary is shown instead.</span> : null}
          </div>
          <p className="whitespace-pre-line text-sm text-text-primary">{data.summary}</p>
          {data.findings.length > 0 ? (
            <ul className="space-y-2">
              {data.findings.map((f, i) => (
                <li key={i} className="rounded-lg border border-border-subtle bg-surface-subtle/50 p-3 text-sm">
                  <p className="text-text-primary">{f.text}</p>
                  {f.fact_ids.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Facts used">
                      {citedFacts(f.fact_ids, facts).map((fact) => (
                        <span
                          key={fact.id}
                          data-testid={`fact-${fact.id}`}
                          className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-xs text-text-secondary"
                        >
                          {fact.label}: <b className="tabular-nums text-text-primary">{formatFactValue(fact, currency)}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {data.notes.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-text-muted">
              {data.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-text-muted">Data as of {new Date(data.data_as_of).toLocaleString()}</p>
        </div>
      ) : null}
    </section>
  );
}
