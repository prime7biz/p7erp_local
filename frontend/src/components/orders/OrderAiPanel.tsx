import { useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { useOrderAi } from "@/hooks/useOrderAi";
import { cn } from "@/lib/utils";
import { logApiError } from "@/utils/logApiError";

type AiHook = ReturnType<typeof useOrderAi>;

type Props = {
  title?: string;
  className?: string;
  ai: AiHook;
  mode: "create" | "edit";
  orderId?: number;
  formSnapshot: Record<string, unknown>;
  onPickFileExtract?: () => void;
  hiddenActions?: Array<"summary" | "next">;
  /** Merge extracted allowlisted fields into the local form (create flow). */
  onMergeExtraction?: () => void;
  /** After server-side apply (edit flow), refresh order from API. */
  onAfterApply?: () => void;
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

function fmtVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function OrderAiPanel({
  title = "Order AI",
  className,
  ai,
  mode,
  orderId,
  formSnapshot,
  onPickFileExtract,
  hiddenActions,
  onMergeExtraction,
  onAfterApply,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [whatIfShiftDays, setWhatIfShiftDays] = useState(-7);
  const busy = ai.status === "processing";
  const phaseLabel =
    ai.status === "processing"
      ? "Analyzing…"
      : ai.status === "partial"
        ? "Partial result — review suggestions before applying."
        : ai.status === "failed"
          ? "Last action did not complete."
          : ai.status === "success"
            ? "Ready — review suggestions below."
            : null;

  const hasAiPayload = Boolean(
    ai.extraction ||
      ai.enrich ||
      ai.validate ||
      ai.validateExecution ||
      ai.planningRisk ||
      ai.atpCtpSummary ||
      ai.dedupe ||
      ai.summary ||
      ai.nextActions,
  );

  const fieldsForApi = Object.fromEntries(
    Object.entries(formSnapshot).map(([k, v]) => [k, v == null ? null : String(v)]),
  ) as Record<string, string | null>;

  const applyHighConfidenceEnrich = async () => {
    if (!orderId || ai.enrichBatchId == null || !ai.enrich) return;
    const items = Object.entries(ai.enrich.suggestions)
      .filter(([, s]) => (s.confidence ?? 0) >= 0.85)
      .map(([field_key]) => ({ field_key, decision: "apply" as const }));
    if (items.length === 0) return;
    try {
      await ai.applySuggestionsToOrder(orderId, ai.enrichBatchId, items, "skip_if_different");
      onAfterApply?.();
    } catch (e) {
      logApiError("OrderAiPanel.applyHighConfidenceEnrich", e);
    }
  };

  return (
    <aside className={cn("rounded-xl border border-border bg-surface-raised p-4 space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Sparkles className="h-4 w-4 text-status-info-foreground" />
        {title}
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" /> : null}
      </div>
      {phaseLabel ? <p className="text-xs font-medium text-text-secondary">{phaseLabel}</p> : null}
      <p className="text-xs text-text-muted">
        Suggestions for header fields only (style, dates, quantity, commission, shipping, remarks). Customer,
        quotation link, status, and order code are never changed by AI apply.
      </p>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ai.runExtract(f, orderId);
          e.target.value = "";
        }}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Btn
          disabled={busy}
          onClick={() => {
            if (onPickFileExtract) onPickFileExtract();
            else fileRef.current?.click();
          }}
        >
          Extract from PO / document
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void ai.runEnrich({
              order_id: orderId,
              fields: fieldsForApi,
            })
          }
        >
          Enrich from context
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void ai.runValidate(formSnapshot, orderId)}
        >
          Validate / execution readiness
        </Btn>
        {mode === "edit" && orderId ? (
          <Btn
            disabled={busy}
            onClick={() => void ai.runValidateExecution(formSnapshot, orderId)}
          >
            Validate execution (ATP/CTP context)
          </Btn>
        ) : null}
        {mode === "edit" && orderId ? (
          <Btn disabled={busy} onClick={() => void ai.runPlanningRiskCheck(orderId)}>
            Planning risk check
          </Btn>
        ) : null}
        {mode === "edit" && orderId ? (
          <Btn disabled={busy} onClick={() => void ai.runAtpCtpSummary(orderId)}>
            ATP/CTP summary
          </Btn>
        ) : null}
        <Btn
          disabled={busy}
          onClick={() => void ai.runDedupe(formSnapshot, orderId)}
        >
          Find overlapping orders
        </Btn>
        {mode === "edit" && orderId && !hiddenActions?.includes("summary") ? (
          <Btn disabled={busy} onClick={() => void ai.runSummary(orderId)}>
            Generate summary
          </Btn>
        ) : null}
        {mode === "edit" && orderId && !hiddenActions?.includes("next") ? (
          <Btn disabled={busy} onClick={() => void ai.runNextActions(orderId, true)}>
            Next-action ideas
          </Btn>
        ) : null}
      </div>
      {mode === "edit" && orderId ? (
        <div className="rounded-lg border border-status-info/20 bg-surface-subtle/40 p-2 space-y-2">
          <div className="text-xs font-semibold text-text-primary">Planning simulation (advisory, read-only)</div>
          <p className="text-[11px] text-text-muted leading-snug">
            Does not change shipment dates, ex-factory dates, capacity, or live plans. Uses rules + line-board overlap
            heuristics only.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Btn disabled={busy} onClick={() => void ai.runCapacityBottleneckScan(orderId)}>
              Capacity bottleneck scan
            </Btn>
            <Btn disabled={busy} onClick={() => void ai.runPromiseSensitivityCheck(orderId)}>
              Promise sensitivity grid
            </Btn>
            <Btn disabled={busy} onClick={() => void ai.runExecutionPlanningSummary(orderId)}>
              Execution planning summary
            </Btn>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-text-secondary whitespace-nowrap">
              What-if delivery shift (days){" "}
              <input
                type="number"
                value={whatIfShiftDays}
                onChange={(e) => setWhatIfShiftDays(Number(e.target.value) || 0)}
                className="ml-1 w-16 rounded border border-border-strong bg-surface-raised px-1 py-0.5 text-xs"
              />
            </label>
            <Btn
              disabled={busy}
              onClick={() => void ai.runWhatIfSimulation(orderId, { delivery_date_shift_days: whatIfShiftDays })}
            >
              Run what-if scenario
            </Btn>
          </div>
        </div>
      ) : null}
      {ai.extraction && Object.keys(ai.extraction.fields).length > 0 ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-40 overflow-y-auto">
          <div className="font-semibold text-text-primary">Extracted fields</div>
          {Object.entries(ai.extraction.fields).map(([k, meta]) => (
            <div key={k} className="text-text-secondary">
              <span className="font-medium text-text-primary">{k}</span>: {fmtVal(meta.value)}{" "}
              <span className="text-text-muted">({Math.round((meta.confidence ?? 0) * 100)}%)</span>
            </div>
          ))}
          {onMergeExtraction ? (
            <Btn disabled={busy} onClick={() => onMergeExtraction()}>
              Merge into form (≥55% confidence)
            </Btn>
          ) : null}
        </div>
      ) : null}
      {ai.enrich && Object.keys(ai.enrich.suggestions).length > 0 ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-40 overflow-y-auto">
          <div className="font-semibold text-text-primary">Enrich suggestions</div>
          {Object.entries(ai.enrich.suggestions).map(([k, s]) => (
            <div key={k} className="text-text-secondary">
              <span className="font-medium text-text-primary">{k}</span>: {s.value ?? "—"}{" "}
              <span className="text-text-muted">({Math.round((s.confidence ?? 0) * 100)}%)</span>
            </div>
          ))}
          {mode === "edit" && orderId && ai.enrichBatchId != null ? (
            <Btn disabled={busy} onClick={() => void applyHighConfidenceEnrich()}>
              Apply enrich ≥85% to order (skip if different)
            </Btn>
          ) : null}
        </div>
      ) : null}
      {hasAiPayload ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void ai.discardAiResults()}
          className="w-full rounded-lg border border-border-strong px-2.5 py-1.5 text-left text-xs font-medium text-text-muted hover:bg-surface-subtle disabled:opacity-50"
        >
          Clear AI results (discard open batches)
        </button>
      ) : null}
      {ai.error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-2 py-1.5 text-xs text-status-danger-foreground">
          {ai.error}
        </div>
      ) : null}
      {ai.lastApplyConflicts.length > 0 ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle/30 p-2 text-xs space-y-0.5">
          <div className="font-semibold text-text-primary">Apply skipped (conflict)</div>
          {ai.lastApplyConflicts.slice(0, 6).map((c, i) => (
            <div key={i} className="text-text-secondary">
              {c.field}: current “{c.current}” vs suggested “{c.suggested}”
            </div>
          ))}
        </div>
      ) : null}
      {ai.validate ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">
            Completeness: {ai.validate.completeness_score}% · Execution readiness:{" "}
            {ai.validate.execution_readiness_score}%
            {ai.validate.commercial_risk_score != null ? (
              <> · Commercial risk: {ai.validate.commercial_risk_score}%</>
            ) : null}
          </div>
          {ai.validate.issues.map((i, idx) => (
            <div key={idx} className="text-text-secondary">
              [{i.severity}] {i.field}: {i.message}
            </div>
          ))}
        </div>
      ) : null}
      {ai.validateExecution ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">
            Execution: {ai.validateExecution.execution_readiness_score}% · Material:{" "}
            {ai.validateExecution.material_readiness_score}% · Planning confidence:{" "}
            {ai.validateExecution.planning_confidence_score}% · Promise risk:{" "}
            {ai.validateExecution.promise_date_risk_score}%
          </div>
          {ai.validateExecution.missing_prerequisites.length > 0 ? (
            <div className="text-text-secondary">
              Missing: {ai.validateExecution.missing_prerequisites.slice(0, 6).join(", ")}
            </div>
          ) : null}
          {ai.validateExecution.promise_check ? (
            <div className="text-text-secondary">
              ATP: {ai.validateExecution.promise_check.atp_ok ? "OK" : "Blocked"} · CTP:{" "}
              {ai.validateExecution.promise_check.ctp_ok ? "OK" : "Blocked"}
            </div>
          ) : null}
        </div>
      ) : null}
      {ai.planningRisk ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">
            Planning risk: {ai.planningRisk.risk_band.toUpperCase()} ({ai.planningRisk.risk_score}%)
          </div>
          <div className="text-text-secondary">
            Material: {ai.planningRisk.material_readiness_score}% · Confidence:{" "}
            {ai.planningRisk.planning_confidence_score}% · Promise risk:{" "}
            {ai.planningRisk.promise_date_risk_score}%
          </div>
          {ai.planningRisk.factors.slice(0, 6).map((f, idx) => (
            <div key={idx} className="text-text-secondary">
              [{f.severity}] {f.message}
            </div>
          ))}
        </div>
      ) : null}
      {ai.atpCtpSummary ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">
            ATP: {ai.atpCtpSummary.atp_ok ? "OK" : "Blocked"} · CTP:{" "}
            {ai.atpCtpSummary.ctp_ok ? "OK" : "Blocked"}
          </div>
          <div className="text-text-secondary">
            {ai.atpCtpSummary.summary_text}
            {ai.atpCtpSummary.shortage_line_count > 0 ? (
              <> · Shortage lines: {ai.atpCtpSummary.shortage_line_count}</>
            ) : null}
          </div>
        </div>
      ) : null}
      {ai.dedupe && ai.dedupe.matches.length > 0 ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle/30 p-2 text-xs space-y-1 max-h-36 overflow-y-auto">
          <div className="font-semibold text-text-primary">Possible overlaps</div>
          {ai.dedupe.matches.slice(0, 8).map((m) => (
            <div key={m.order_id} className="text-text-secondary">
              {m.order_code}{" "}
              <span className="text-text-muted">
                ({Math.round(m.score * 100)}% · {m.matched_on.join(", ")})
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {ai.summary ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-48 overflow-y-auto">
          <div className="font-semibold text-text-primary">Summary ({ai.summary.profile_grade})</div>
          <p className="text-text-secondary whitespace-pre-wrap">{ai.summary.summary_text}</p>
        </div>
      ) : null}
      {ai.nextActions && ai.nextActions.actions.length > 0 ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-40 overflow-y-auto">
          <div className="font-semibold text-text-primary">Suggested actions</div>
          {ai.nextActions.actions.map((a, idx) => (
            <div key={idx} className="text-text-secondary">
              <span className="font-medium">{a.title}</span> — {a.description}
            </div>
          ))}
        </div>
      ) : null}
      {ai.capacityScan ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-44 overflow-y-auto">
          <div className="font-semibold text-text-primary">
            Bottleneck scan · severity {ai.capacityScan.severity_score}/100 · overlaps {ai.capacityScan.overlap_hits}
          </div>
          {ai.capacityScan.explainability_notes.slice(0, 3).map((n, i) => (
            <div key={i} className="text-text-muted">
              {n}
            </div>
          ))}
          {ai.capacityScan.bottlenecks.slice(0, 5).map((b) => (
            <div key={`${b.this_config_id}-${b.peer_config_id}`} className="text-text-secondary">
              Line {b.line_id}: order #{b.peer_order_id ?? "?"} — {b.message}
            </div>
          ))}
        </div>
      ) : null}
      {ai.whatIf ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">
            What-if readiness {ai.whatIf.scenario_readiness_score}% · bottleneck adj. {ai.whatIf.bottleneck_severity_adjusted}
            /100
          </div>
          <div className="text-text-secondary">
            Baseline ATP {ai.whatIf.baseline_promise.atp_ok ? "OK" : "blocked"} / CTP{" "}
            {ai.whatIf.baseline_promise.ctp_ok ? "OK" : "blocked"} → Simulated ATP{" "}
            {ai.whatIf.simulated_promise.atp_ok ? "OK" : "blocked"} / CTP{" "}
            {ai.whatIf.simulated_promise.ctp_ok ? "OK" : "blocked"}
          </div>
          {ai.whatIf.advisory_notes.slice(0, 3).map((n, i) => (
            <div key={i} className="text-text-muted">
              {n}
            </div>
          ))}
        </div>
      ) : null}
      {ai.promiseSensitivity && ai.promiseSensitivity.points.length > 0 ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-40 overflow-y-auto">
          <div className="font-semibold text-text-primary">
            Promise sensitivity score {ai.promiseSensitivity.sensitivity_score}/100
          </div>
          <div className="grid grid-cols-2 gap-1 text-text-secondary">
            {ai.promiseSensitivity.points.map((p) => (
              <div key={p.offset_days}>
                Δ{p.offset_days}d: ATP {p.atp_ok ? "OK" : "no"} · CTP {p.ctp_ok ? "OK" : "no"}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {ai.executionPlanningSummary ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1 max-h-48 overflow-y-auto">
          <div className="font-semibold text-text-primary">{ai.executionPlanningSummary.headline}</div>
          {ai.executionPlanningSummary.bullets.map((b, i) => (
            <div key={i} className="text-text-secondary">
              • {b}
            </div>
          ))}
          {ai.executionPlanningSummary.next_step_hints.length > 0 ? (
            <div className="text-text-muted pt-1">
              Next: {ai.executionPlanningSummary.next_step_hints.slice(0, 4).join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
