import { useEffect } from "react";
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
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      id="p7-doc-print-modal"
      className="fixed inset-0 z-[100] flex flex-col bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="p7-doc-print-toolbar no-print flex flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-4 py-3 shadow-sm">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <div className="mx-2 h-5 w-px bg-border" />
        <select
          className="rounded-lg border border-border-strong px-2 py-1.5 text-xs"
          value={template}
          onChange={(e) => onTemplateChange(e.target.value as "standard" | "compact" | "audit")}
          aria-label="Print template"
        >
          <option value="standard">Standard</option>
          <option value="compact">Compact</option>
          <option value="audit">Audit</option>
        </select>
        <select
          className="rounded-lg border border-border-strong px-2 py-1.5 text-xs"
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
          className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:opacity-95"
          onClick={() => window.print()}
        >
          Print / Save PDF
        </button>
        <button
          type="button"
          className="ml-auto rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="p7-doc-print-scroll flex-1 overflow-auto bg-slate-100/90 p-4 dark:bg-slate-950/80">
        <div className="vp-root mx-auto max-w-[210mm] space-y-6 pb-8">{children}</div>
      </div>
    </div>
  );
}
