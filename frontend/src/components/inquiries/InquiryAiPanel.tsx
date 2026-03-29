import { useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { useInquiryAi } from "@/hooks/useInquiryAi";
import { cn } from "@/lib/utils";

type AiHook = ReturnType<typeof useInquiryAi>;

type Props = {
  title?: string;
  className?: string;
  ai: AiHook;
  mode: "create" | "edit";
  inquiryId?: number;
  formSnapshot: Record<string, unknown>;
  onPickFileExtract?: () => void;
  hiddenActions?: Array<"summary" | "next">;
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

export function InquiryAiPanel({
  title = "Inquiry AI",
  className,
  ai,
  mode,
  inquiryId,
  formSnapshot,
  onPickFileExtract,
  hiddenActions,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
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
    ai.extraction || ai.enrich || ai.validate || ai.dedupe || ai.summary || ai.nextActions,
  );

  const fieldsForApi = Object.fromEntries(
    Object.entries(formSnapshot).map(([k, v]) => [k, v == null ? null : String(v)]),
  ) as Record<string, string | null>;

  return (
    <aside className={cn("rounded-xl border border-border bg-surface-raised p-4 space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Sparkles className="h-4 w-4 text-status-info-foreground" />
        {title}
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" /> : null}
      </div>
      {phaseLabel ? <p className="text-xs font-medium text-text-secondary">{phaseLabel}</p> : null}
      <p className="text-xs text-text-muted">
        Suggestions only — review and apply manually. Nothing is auto-saved except when you use Apply on an existing
        inquiry.
      </p>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ai.runExtract(f, inquiryId);
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
          Extract from document
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void ai.runEnrich({
              inquiry_id: mode === "edit" ? inquiryId : undefined,
              fields: fieldsForApi,
            })
          }
        >
          Enrich from context
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void ai.runValidate(formSnapshot, mode === "edit" ? inquiryId : undefined)}
        >
          Validate / quotation readiness
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void ai.runDedupe(formSnapshot, mode === "edit" ? inquiryId : undefined)}
        >
          Find overlapping inquiries
        </Btn>
        {mode === "edit" && inquiryId && !hiddenActions?.includes("summary") ? (
          <Btn disabled={busy} onClick={() => void ai.runSummary(inquiryId)}>
            Generate summary
          </Btn>
        ) : null}
        {mode === "edit" && inquiryId && !hiddenActions?.includes("next") ? (
          <Btn disabled={busy} onClick={() => void ai.runNextActions(inquiryId)}>
            Next-action ideas
          </Btn>
        ) : null}
      </div>
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
      {ai.validate ? (
        <div className="rounded-lg border border-border-subtle p-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">
            Completeness: {ai.validate.completeness_score}% · Quotation readiness:{" "}
            {ai.validate.quotation_readiness_score}%
          </div>
          {ai.validate.issues.map((i, idx) => (
            <div key={idx} className="text-text-secondary">
              [{i.severity}] {i.field}: {i.message}
            </div>
          ))}
        </div>
      ) : null}
      {ai.dedupe && ai.dedupe.matches.length > 0 ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle/30 p-2 text-xs space-y-1 max-h-36 overflow-y-auto">
          <div className="font-semibold text-text-primary">Possible overlaps</div>
          {ai.dedupe.matches.slice(0, 8).map((m) => (
            <div key={m.inquiry_id} className="text-text-secondary">
              {m.inquiry_code}{" "}
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
    </aside>
  );
}
