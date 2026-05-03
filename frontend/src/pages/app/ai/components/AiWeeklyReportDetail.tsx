import { Copy, Download, Printer } from "lucide-react";
import type { AiWeeklyReportItem } from "@/api/client";
import { MarkdownNarrative } from "./MarkdownNarrative";
import { AiWeeklyReportKpiPanel } from "./AiWeeklyReportKpiPanel";
import { buildWeeklyReportMarkdownFile } from "@/pages/app/ai/utils/weeklyReportFormat";

export function AiWeeklyReportDetail({ report, printId }: { report: AiWeeklyReportItem; printId: string }) {
  const onCopy = async () => {
    const text = buildWeeklyReportMarkdownFile(report);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };
  const onDownload = () => {
    const blob = new Blob([buildWeeklyReportMarkdownFile(report)], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `weekly-report-${report.week_start}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onPrint = () => window.print();

  return (
    <article
      id={printId}
      className="rounded-xl border border-border bg-surface-raised p-4 print:border-0 print:shadow-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Week of {report.week_start} – {report.week_end}
          </h2>
          <p className="text-xs text-text-muted">Created {new Date(report.created_at).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => void onCopy()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>
      <div className="print:block hidden mb-2 text-center">
        <div className="text-lg font-semibold">P7 ERP — Weekly AI report</div>
        <div className="text-sm text-text-secondary">
          {report.week_start} – {report.week_end}
        </div>
      </div>
      <div className="mt-2">
        <MarkdownNarrative source={report.narrative} />
      </div>
      <AiWeeklyReportKpiPanel report={report} />
    </article>
  );
}
