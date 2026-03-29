import { useRef } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { useVendorAi } from "@/hooks/useVendorAi";
import { cn } from "@/lib/utils";

type AiHook = ReturnType<typeof useVendorAi>;

type Props = {
  title?: string;
  className?: string;
  ai: AiHook;
  mode: "create" | "edit";
  vendorId?: number;
  formSnapshot: Record<string, unknown>;
  onPickFileExtract?: () => void;
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

export function VendorAiPanel({
  title = "Supplier AI",
  className,
  ai,
  mode,
  vendorId,
  formSnapshot,
  onPickFileExtract,
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

  return (
    <aside className={cn("rounded-xl border border-border bg-surface-raised p-4 space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Sparkles className="h-4 w-4 text-status-info-foreground" />
        {title}
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" /> : null}
      </div>
      {phaseLabel ? <p className="text-xs font-medium text-text-secondary">{phaseLabel}</p> : null}
      <p className="text-xs text-text-muted">
        Suggestions are review-first. On edit, Apply writes to the vendor with audit. On create, mark choices then save
        vendor to finalize batches.
      </p>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void ai.runExtract(f, vendorId);
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
              vendor_id: vendorId,
              website: (formSnapshot.website as string) || undefined,
              email: (formSnapshot.email as string) || undefined,
              company_name: (formSnapshot.vendorDisplayName as string) || (formSnapshot.name as string) || undefined,
              fields: Object.fromEntries(
                Object.entries(formSnapshot).map(([k, v]) => [k, v == null ? null : String(v)]),
              ),
            })
          }
        >
          Enrich from website / hints
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void ai.runValidate(formSnapshot, mode === "edit" ? vendorId : undefined)}
        >
          Validate profile
        </Btn>
        <Btn
          disabled={busy}
          onClick={() => void ai.runDedupe(formSnapshot, vendorId ?? undefined)}
        >
          Find possible duplicates
        </Btn>
        {mode === "edit" && vendorId ? (
          <Btn disabled={busy} onClick={() => void ai.runSummary(vendorId)}>
            Generate summary
          </Btn>
        ) : null}
        {mode === "edit" && vendorId ? (
          <Btn disabled={busy} onClick={() => void ai.runNextActions(vendorId)}>
            Next-action ideas
          </Btn>
        ) : null}
      </div>
      {hasAiPayload ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void ai.discardAiResults()}
          className="text-xs font-medium text-status-danger-foreground hover:underline"
        >
          Clear AI results & discard open batches
        </button>
      ) : null}
      {ai.error ? <p className="text-xs text-status-danger-foreground">{ai.error}</p> : null}
    </aside>
  );
}
