import { useEffect } from "react";
import { createPortal } from "react-dom";
import { usePrintIsolation } from "@/hooks/usePrintIsolation";
import "@/styles/document-print.css";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  copyCount: number;
  onCopyCountChange: (n: number) => void;
  template: "standard" | "compact" | "audit";
  onTemplateChange: (t: "standard" | "compact" | "audit") => void;
  children: React.ReactNode;
};

export function PrintPreviewModal({
  open,
  title,
  onClose,
  copyCount,
  onCopyCountChange,
  template,
  onTemplateChange,
  children,
}: Props) {
  usePrintIsolation(open);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      id="p7-doc-print-modal"
      data-p7-print-root
      className="fixed inset-0 z-[100] flex flex-col bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="p7-doc-print-toolbar no-print flex flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-sm sm:px-4 sm:py-3">
        <span className="w-full truncate text-sm font-semibold text-text-primary sm:w-auto">{title}</span>
        <div className="mx-2 hidden h-5 w-px bg-border sm:block" />
        <select
          className="min-h-10 rounded-lg border border-border-strong px-2 py-1.5 text-xs sm:min-h-0"
          value={template}
          onChange={(e) => onTemplateChange(e.target.value as "standard" | "compact" | "audit")}
          aria-label="Print template"
        >
          <option value="standard">Standard</option>
          <option value="compact">Compact</option>
          <option value="audit">Audit</option>
        </select>
        <select
          className="min-h-10 rounded-lg border border-border-strong px-2 py-1.5 text-xs sm:min-h-0"
          value={copyCount}
          onChange={(e) => onCopyCountChange(Number(e.target.value))}
          aria-label="Number of copies"
        >
          <option value={1}>1 copy</option>
          <option value={2}>2 copies</option>
          <option value={3}>3 copies</option>
        </select>
        <button
          type="button"
          className="min-h-10 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:opacity-95 sm:min-h-0"
          onClick={() => window.print()}
        >
          Print / Save PDF
        </button>
        <button
          type="button"
          className="ml-auto min-h-10 rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle sm:min-h-0"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="p7-doc-print-scroll flex-1 overflow-auto overscroll-contain bg-slate-100/90 p-2 sm:p-4">
        <div className="vp-root mx-auto max-w-[210mm] space-y-6 pb-8">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
