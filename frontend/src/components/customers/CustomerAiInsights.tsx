import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import type { CustomerHealthResponse } from "@/api/client";
import { CustomerAiAuditHistory } from "@/components/customers/CustomerAiAuditHistory";
import type { useCustomerAi } from "@/hooks/useCustomerAi";
import { cn } from "@/lib/utils";

type AiHook = ReturnType<typeof useCustomerAi>;

type Props = {
  customerId: number;
  health: CustomerHealthResponse | null;
  healthLoading: boolean;
  ai: AiHook;
};

export function CustomerAiInsights({ customerId, health, healthLoading, ai }: Props) {
  const [openSummary, setOpenSummary] = useState(false);
  const [openNext, setOpenNext] = useState(false);

  const busy = ai.status === "processing";

  const dupScore = health?.duplicate_risk_score ?? 0;
  const dupLabel =
    dupScore >= 0.75 ? "High duplicate risk" : dupScore >= 0.45 ? "Possible duplicates" : "Low duplicate risk";

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-info-foreground">
        <Sparkles className="h-4 w-4" />
        AI insights
      </div>

      {healthLoading ? (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading health snapshot…
        </div>
      ) : health ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 px-3 py-2">
            <div className="text-xs text-text-muted">Profile completeness</div>
            <div className="text-lg font-semibold text-text-primary">{health.profile_completeness}%</div>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 px-3 py-2">
            <div className="text-xs text-text-muted">Related records</div>
            <div className="text-text-secondary">
              O {health.orders_count} · I {health.inquiries_count} · Q {health.quotations_count}
            </div>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 px-3 py-2">
            <div className="text-xs text-text-muted">Last activity</div>
            <div className="font-medium text-text-primary">
              {health.last_activity_at ? new Date(health.last_activity_at).toLocaleDateString() : "None recorded"}
            </div>
          </div>
          <div
            className={cn(
              "rounded-lg border px-3 py-2",
              dupScore >= 0.75
                ? "border-status-danger/40 bg-status-danger-subtle/30"
                : dupScore >= 0.45
                  ? "border-status-warning/40 bg-status-warning-subtle/30"
                  : "border-border-subtle bg-surface-subtle/40",
            )}
          >
            <div className="text-xs text-text-muted">Duplicate signal</div>
            <div className="font-medium text-text-primary">{dupLabel}</div>
            <div className="text-xs text-text-muted">Score {Math.round(dupScore * 100)}%</div>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-text-muted">Health data unavailable.</p>
      )}

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpenSummary((o) => !o);
            if (!openSummary && !ai.summary) void ai.runSummary(customerId);
          }}
          className="flex w-full items-center justify-between rounded-lg border border-border-strong px-3 py-2 text-left text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          <span>AI company summary</span>
          {openSummary ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {openSummary ? (
          <div className="rounded-lg border border-border-subtle bg-surface-subtle/30 px-3 py-2 text-xs text-text-secondary">
            {busy && !ai.summary ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Generating…
              </span>
            ) : ai.summary ? (
              <>
                <div className="mb-1 font-semibold text-text-primary">
                  {ai.summary.profile_grade} · key facts
                </div>
                <p className="whitespace-pre-wrap">{ai.summary.summary_text}</p>
                {ai.summary.risk_indicators.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-status-warning-foreground">
                    {ai.summary.risk_indicators.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <span>No summary yet.</span>
            )}
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpenNext((o) => !o);
            if (!openNext && !ai.nextActions) void ai.runNextActions(customerId);
          }}
          className="flex w-full items-center justify-between rounded-lg border border-border-strong px-3 py-2 text-left text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          <span>Recommended next actions</span>
          {openNext ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {openNext ? (
          <div className="rounded-lg border border-border-subtle bg-surface-subtle/30 px-3 py-2 text-xs text-text-secondary space-y-2">
            {busy && !ai.nextActions ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </span>
            ) : ai.nextActions && ai.nextActions.actions.length > 0 ? (
              ai.nextActions.actions.map((a, idx) => (
                <div key={idx} className="border-b border-border-subtle pb-2 last:border-0">
                  <div className="font-medium text-text-primary">{a.title}</div>
                  <div>{a.description}</div>
                  {a.target_url ? (
                    <Link to={a.target_url} className="mt-1 inline-block text-brand-primary hover:underline">
                      Open
                    </Link>
                  ) : null}
                </div>
              ))
            ) : (
              <span>No suggestions.</span>
            )}
          </div>
        ) : null}
      </div>

      {ai.error ? (
        <div className="mt-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-2 py-1.5 text-xs text-status-danger-foreground">
          {ai.error}
        </div>
      ) : null}

      <CustomerAiAuditHistory customerId={customerId} />
    </section>
  );
}
