/**
 * AI autofill on the Personal tab: upload CV / NID / birth or medical certificate, the extracted
 * fields merge into the form automatically. Fields the user already typed are never overwritten;
 * they are listed as "AI suggests …" so the user decides.
 */
import { useEffect, useRef } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import type { HrDocExtractionResponse } from "@/api/client";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { useHrDocExtraction, type HrDocExtractionKind } from "@/hooks/useHrDocExtraction";
import { cn } from "@/lib/utils";
import type { ExtractionStatus } from "@/types/extraction";
import type { EmployeeFormState } from "./employeeWorkspaceLogic";

type Flags = Record<string, boolean | string | number | null> | null | undefined;

type Slot = { kind: HrDocExtractionKind; title: string; subtitle: string; flag: string };

const SLOTS: Slot[] = [
  { kind: "national-id", title: "National ID", subtitle: "Name, NID number, date of birth, address.", flag: "ocr_id_extraction_enabled" },
  { kind: "cv", title: "CV / Resume", subtitle: "Name, contact, address.", flag: "ocr_cv_extraction_enabled" },
  { kind: "birth-certificate", title: "Birth certificate", subtitle: "Birth registration no., parents, date of birth.", flag: "ocr_id_extraction_enabled" },
  { kind: "medical-certificate", title: "Medical certificate", subtitle: "Fitness details (recorded on the Medical tab).", flag: "ocr_medical_extraction_enabled" },
];

const CHIP: Record<ExtractionStatus, { label: string; className: string }> = {
  idle: { label: "Waiting", className: "bg-surface-subtle text-text-muted" },
  uploading: { label: "Reading…", className: "bg-brand-primary/10 text-brand-primary" },
  extracted: { label: "Filled", className: "bg-status-success-subtle text-status-success-foreground" },
  partial: { label: "Partly filled", className: "bg-status-warning-subtle text-status-warning-foreground" },
  failed: { label: "Could not read", className: "bg-status-danger-subtle text-status-danger-foreground" },
};

function DocSlot({ slot, onExtracted }: { slot: Slot; onExtracted: (title: string, res: HrDocExtractionResponse) => void }) {
  const { status, error, response, extract, clear } = useHrDocExtraction(slot.kind);
  const delivered = useRef<HrDocExtractionResponse | null>(null);

  useEffect(() => {
    if (response && response !== delivered.current && (status === "extracted" || status === "partial")) {
      delivered.current = response;
      onExtracted(slot.title, response);
    }
  }, [response, status, slot.title, onExtracted]);

  const chip = CHIP[status];
  return (
    <div className="rounded-lg border border-brand-primary/15 bg-surface-raised/80 p-2">
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-medium text-text-primary">{slot.title}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", chip.className)} role="status">
          {chip.label}
        </span>
      </div>
      <FileImportCard title={slot.title} subtitle={slot.subtitle} status={status} error={error} onExtract={extract} onClear={clear} />
    </div>
  );
}

export type AiConflict = { field: keyof EmployeeFormState; extracted: string; label: string };

export function AiAutofillPanel({
  flags,
  onExtracted,
  conflicts,
  onUseAiValue,
  onKeepMine,
  lastMessage,
}: {
  flags: Flags;
  onExtracted: (title: string, res: HrDocExtractionResponse) => void;
  conflicts: AiConflict[];
  onUseAiValue: (c: AiConflict) => void;
  onKeepMine: (c: AiConflict) => void;
  lastMessage: string;
}) {
  const slots = SLOTS.filter((s) => flags?.[s.flag] === true);
  if (slots.length === 0) return null;
  return (
    <section
      aria-labelledby="ai-autofill-title"
      className="relative overflow-hidden rounded-xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/10 via-brand-primary/5 to-transparent p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary/15 text-brand-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 id="ai-autofill-title" className="text-sm font-semibold text-text-primary">
          AI autofill
        </h3>
        <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-medium text-brand-primary">Fast onboarding</span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        Upload a paper and the matching fields below fill in by themselves (highlighted). Anything you already typed is kept. Files are
        only read, never stored.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {slots.map((slot) => (
          <DocSlot key={slot.kind} slot={slot} onExtracted={onExtracted} />
        ))}
      </div>
      {lastMessage && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-brand-primary" role="status">
          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
          {lastMessage}
        </p>
      )}
      {conflicts.length > 0 && (
        <div className="mt-3 rounded-lg border border-status-warning/30 bg-status-warning-subtle p-3">
          <p className="text-xs font-semibold text-status-warning-foreground">The document disagrees with what you typed — choose:</p>
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((c) => (
              <li key={c.field} className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span>
                  <span className="font-medium text-text-primary">{c.label}</span>: AI read “{c.extracted}”
                </span>
                <button type="button" onClick={() => onUseAiValue(c)} className="rounded border border-border-strong px-2 py-0.5 hover:bg-surface-subtle">
                  Use AI value
                </button>
                <button type="button" onClick={() => onKeepMine(c)} className="rounded border border-border-strong px-2 py-0.5 hover:bg-surface-subtle">
                  Keep mine
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
