import { useCallback, useState } from "react";
import { Calculator, Loader2 } from "lucide-react";
import { api, type QuotationDetailResponse } from "@/api/client";
import { quotationCostingReasonLabel } from "@/lib/quotationCostingReasonLabels";
import { cn } from "@/lib/utils";
import { logApiError } from "@/utils/logApiError";

type Props = {
  quotation: QuotationDetailResponse | null;
  className?: string;
};

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border-strong px-2.5 py-1.5 text-left text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function QuotationCostingIntelligencePanel({ quotation, className }: Props) {
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [payload, setPayload] = useState<unknown>(null);

  const qid = quotation?.id;
  const ind = quotation?.ai_indicators;

  const run = useCallback(
    async (kind: string, fn: () => Promise<unknown>) => {
      if (!qid) return;
      setBusy(true);
      setPanelError(null);
      setSection(kind);
      try {
        const out = await fn();
        setPayload(out);
      } catch (e) {
        logApiError("QuotationCostingIntelligencePanel", e);
        setPanelError(e instanceof Error ? e.message : "Request failed");
        setPayload(null);
      } finally {
        setBusy(false);
      }
    },
    [qid],
  );

  if (!quotation?.id) {
    return (
      <aside
        className={cn(
          "rounded-xl border border-border bg-surface-raised p-4 text-xs text-text-muted",
          className,
        )}
      >
        Save the quotation to enable costing intelligence checks.
      </aside>
    );
  }

  return (
    <aside className={cn("rounded-xl border border-border bg-surface-raised p-4 space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Calculator className="h-4 w-4 text-status-info-foreground" />
        Costing intelligence
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" /> : null}
      </div>
      <p className="text-xs text-text-muted leading-snug">
        <span className="font-medium text-status-warning-foreground">Advisory only</span> — rules-based read-out. Does
        not change materials, manufacturing, other costs, totals, or prices. Requires permission{" "}
        <code className="rounded bg-surface-subtle px-0.5">quotations.ai.costing_intelligence</code>.
      </p>

      {ind && ind.costing_phase1_enabled === false ? (
        <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 px-2 py-1.5 text-xs text-text-secondary">
          Costing intelligence Phase 1 is disabled (global or tenant flag). Indicators are not shown.
        </div>
      ) : null}

      {ind && ind.costing_phase1_enabled !== false ? (
        <div className="rounded-lg border border-border-subtle bg-surface-subtle/40 p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">Snapshot indicators</div>
          <div className="flex flex-wrap gap-1">
            <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
              {ind.signal_scope === "full_costing" ? "Full costing (detail)" : "Header-based (list-style)"}
            </span>
            {ind.limited_confidence || ind.confidence_basis === "partial" ? (
              <span className="rounded bg-status-warning-subtle px-1.5 py-0.5 text-[10px] font-medium text-status-warning-foreground">
                Limited confidence
              </span>
            ) : (
              <span className="rounded bg-status-success-subtle/80 px-1.5 py-0.5 text-[10px] font-medium text-status-success-foreground">
                Full confidence basis
              </span>
            )}
            <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-[10px] text-text-muted">
              Deterministic rules
            </span>
          </div>
          <div className="text-text-secondary flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Cost complete: {ind.cost_completeness_score ?? "—"}%</span>
            <span>Confidence: {ind.costing_confidence_score ?? "—"}%</span>
            <span>Anomaly: {ind.anomaly_severity ?? "—"}</span>
            <span>Margin: {ind.margin_pressure ?? "—"}</span>
            {ind.fx_sensitivity ? <span className="text-status-warning-foreground">FX sensitive</span> : null}
            {ind.urgent_costing_review ? (
              <span className="text-status-danger-foreground font-medium">Urgent review</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Btn
          disabled={busy}
          onClick={() =>
            void run("completeness", () => api.quotationCostingCompletenessCheck({ quotation_id: qid! }))
          }
        >
          Cost completeness
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void run("anomaly", () => api.quotationCostingAnomalyScan({ quotation_id: qid! }))}
        >
          Anomaly scan
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void run("margin", () => api.quotationCostingMarginRisk({ quotation_id: qid! }))}
        >
          Margin risk
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void run("fx", () => api.quotationCostingFxSensitivity({ quotation_id: qid! }))}
        >
          FX sensitivity
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void run("summary", () => api.quotationCostingSummary({ quotation_id: qid! }))}
        >
          Costing summary
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void run("next", () => api.quotationCostingNextActions({ quotation_id: qid! }))}
        >
          Next actions
        </Btn>
      </div>

      {panelError ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-2 py-1.5 text-xs text-status-danger-foreground">
          {panelError}
        </div>
      ) : null}

      {payload && section ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs max-h-56 overflow-y-auto space-y-2">
          {section === "completeness" && typeof payload === "object" && payload !== null && "items" in payload ? (
            <>
              <MetaStrip payload={payload} />
              <p className="text-text-muted">{(payload as { advisory_notice?: string }).advisory_notice}</p>
              <ul className="space-y-1 text-text-secondary">
                {(
                  (payload as { items: { reason_code?: string; code: string; severity: string; message: string }[] })
                    .items || []
                ).map((it, i) => (
                  <li key={`${it.code}-${i}`}>
                    <span className="font-medium text-text-primary">[{it.severity}]</span>{" "}
                    <span className="text-text-muted">({quotationCostingReasonLabel(it.reason_code || it.code)})</span>{" "}
                    {it.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {section === "anomaly" && typeof payload === "object" && payload !== null && "items" in payload ? (
            <>
              <MetaStrip payload={payload} />
              <p className="font-medium text-text-primary">
                Severity: {(payload as { anomaly_severity?: string }).anomaly_severity}
              </p>
              <ul className="space-y-1 text-text-secondary">
                {(
                  (payload as { items: { reason_code?: string; code: string; message: string }[] }).items || []
                ).map((it, i) => (
                  <li key={i}>
                    <span className="text-text-muted">({quotationCostingReasonLabel(it.reason_code || it.code)})</span>{" "}
                    {it.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {section === "margin" && typeof payload === "object" && payload !== null ? (
            <div className="text-text-secondary space-y-1">
              <MetaStrip payload={payload} />
              <p className="font-medium text-text-primary">
                Pressure: {(payload as { margin_pressure?: string }).margin_pressure}
              </p>
              {(
                ((payload as { context?: { bullets?: string[] } }).context?.bullets || []) as string[]
              ).map((b, i) => (
                <p key={i}>{b}</p>
              ))}
            </div>
          ) : null}
          {section === "fx" && typeof payload === "object" && payload !== null ? (
            <div className="text-text-secondary space-y-1">
              <MetaStrip payload={payload} />
              <p>
                FX sensitivity:{" "}
                {(payload as { fx_sensitivity?: boolean }).fx_sensitivity ? (
                  <span className="text-status-warning-foreground font-medium">yes</span>
                ) : (
                  "no"
                )}
              </p>
              {(
                ((payload as { context?: { bullets?: string[] } }).context?.bullets || []) as string[]
              ).map((b, i) => (
                <p key={i}>{b}</p>
              ))}
            </div>
          ) : null}
          {section === "summary" && typeof payload === "object" && payload !== null ? (
            <>
              <MetaStrip payload={payload} />
            <ul className="text-text-secondary space-y-0.5">
              {((payload as { summary_lines?: string[] }).summary_lines || []).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            </>
          ) : null}
          {section === "next" && typeof payload === "object" && payload !== null ? (
            <>
              <MetaStrip payload={payload} />
            <ul className="text-text-secondary space-y-1">
              {((payload as { actions?: { title: string; description: string; category: string }[] }).actions || []).map(
                (a, i) => (
                  <li key={i}>
                    <span className="font-medium text-text-primary">{a.title}</span>{" "}
                    <span className="text-text-muted">({a.category})</span> — {a.description}
                  </li>
                ),
              )}
            </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer text-text-secondary font-medium">Costing audit history</summary>
        {qid != null ? <CostingAuditSnippet quotationId={qid} /> : null}
      </details>
    </aside>
  );
}

function MetaStrip({ payload }: { payload: object }) {
  const p = payload as {
    signal_scope?: string;
    confidence_basis?: string;
    limited_confidence?: boolean;
    reason_codes?: string[];
  };
  const codes = (p.reason_codes || []).slice(0, 8);
  return (
    <div className="flex flex-wrap gap-1 pb-1 border-b border-border-subtle/60 mb-1">
      <span className="text-[10px] rounded bg-surface-subtle px-1.5 py-0.5 text-text-muted">
        {p.signal_scope === "full_costing" ? "Full costing" : "Header-based"}
      </span>
      {p.limited_confidence || p.confidence_basis === "partial" ? (
        <span className="text-[10px] rounded bg-status-warning-subtle px-1.5 py-0.5 text-status-warning-foreground">
          Limited confidence
        </span>
      ) : null}
      {codes.length > 0 ? (
        <span className="text-[10px] text-text-muted truncate max-w-full" title={codes.join(", ")}>
          Codes: {codes.map((c) => quotationCostingReasonLabel(c)).join(" · ")}
        </span>
      ) : null}
    </div>
  );
}

function CostingAuditSnippet({ quotationId }: { quotationId: number }) {
  const [items, setItems] = useState<{ summary?: string | null; event_label?: string | null; created_at?: string }[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void api
      .quotationCostingAuditLog({ quotation_id: quotationId, limit: 15 })
      .then((r) => setItems(r.items))
      .catch((e) => {
        logApiError("CostingAuditSnippet", e);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [quotationId]);

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        onClick={load}
        disabled={loading}
        className="rounded border border-border px-2 py-1 text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
      >
        {loading ? "Loading…" : "Load recent traces"}
      </button>
      {items && items.length === 0 ? <p className="text-text-muted">No costing intelligence traces yet.</p> : null}
      {items && items.length > 0
        ? items.map((row, idx) => (
            <div key={idx} className="border-b border-border-subtle/60 pb-1 last:border-0">
              <div className="text-text-primary">{row.event_label || row.summary}</div>
              <div className="text-text-muted">{row.created_at}</div>
            </div>
          ))
        : null}
    </div>
  );
}
