import { useState } from "react";
import { FileSpreadsheet, FileText, Printer, Share2 } from "lucide-react";
import {
  financeStatementsApi,
  type StatementExportFormat,
  type StatementExportReport,
  type StatementQuery,
} from "@/api/financeStatements";
import { useAuth } from "@/context/AuthContext";
import { preferShareOverPrint, saveBlob, shareOrSaveBlob } from "@/lib/fileSave";
import { printCurrentPage } from "@/lib/reportExport";
import { useMobileUiV2Phone } from "@/hooks/useMobileUiV2";
import { useMediaQuery } from "@/hooks/useInventoryListView";
import { PHONE_MEDIA_QUERY } from "@/lib/mobileUi";
import { logApiError } from "@/utils/logApiError";

export const EXPORT_PERMISSION_KEY = "finance.mis_report.export";

/**
 * Same rule as the backend for this soft key: a missing key allows, an explicit `false` denies.
 * (The server still decides; a 403 on download switches the buttons off as well.)
 */
export function useCanExportStatements(): boolean {
  const permissions = useAuth().me?.role_permissions ?? {};
  return permissions[EXPORT_PERMISSION_KEY] !== false;
}

interface Props {
  report: StatementExportReport;
  query: StatementQuery;
  /** File name without extension, e.g. "trial-balance-2026-27". */
  fileBase: string;
  /** Nothing to export yet (loading / error). */
  disabled?: boolean;
}

const NO_PERMISSION_TEXT = "You do not have permission to export statements.";

/** Excel + PDF (server files) and Print on desktop; phone uses Save PDF + Share (no Print). */
export function StatementExportBar({ report, query, fileBase, disabled = false }: Props) {
  const allowed = useCanExportStatements();
  const mobileV2Phone = useMobileUiV2Phone();
  const narrow = useMediaQuery(PHONE_MEDIA_QUERY);
  const phoneActions = preferShareOverPrint(mobileV2Phone || narrow);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<StatementExportFormat | "share" | null>(null);
  const [message, setMessage] = useState("");
  const blocked = !allowed || forbidden;

  async function download(format: StatementExportFormat, opts?: { share?: boolean }) {
    const share = opts?.share === true;
    setBusy(share ? "share" : format);
    setMessage("");
    try {
      const blob = await financeStatementsApi.exportStatement(report, format, query);
      if (share || (phoneActions && format === "pdf")) {
        await shareOrSaveBlob(blob, `${fileBase}.${format}`);
      } else {
        await saveBlob(blob, `${fileBase}.${format}`);
      }
    } catch (e) {
      logApiError("StatementExportBar.download", e);
      if ((e as { status?: number }).status === 403) {
        setForbidden(true);
      } else {
        setMessage((e as Error).message || "Export failed");
      }
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0";

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={btn}
        disabled={disabled || blocked || busy !== null}
        title={blocked ? NO_PERMISSION_TEXT : "Download as Excel"}
        onClick={() => void download("xlsx")}
      >
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        {busy === "xlsx" ? "Preparing…" : "Excel"}
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled || blocked || busy !== null}
        title={blocked ? NO_PERMISSION_TEXT : phoneActions ? "Save as PDF" : "Download as PDF"}
        onClick={() => void download("pdf")}
      >
        <FileText className="h-4 w-4" aria-hidden />
        {busy === "pdf" ? "Preparing…" : phoneActions ? "Save PDF" : "PDF"}
      </button>
      {phoneActions ? (
        <button
          type="button"
          className={btn}
          disabled={disabled || blocked || busy !== null}
          title={blocked ? NO_PERMISSION_TEXT : "Share PDF"}
          onClick={() => void download("pdf", { share: true })}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {busy === "share" ? "Preparing…" : "Share"}
        </button>
      ) : (
        <button type="button" className={btn} disabled={disabled} title="Print this statement (A4)" onClick={() => printCurrentPage()}>
          <Printer className="h-4 w-4" aria-hidden />
          Print
        </button>
      )}
      {message ? (
        <span role="alert" className="text-xs text-status-danger-foreground">
          {message}
        </span>
      ) : null}
    </div>
  );
}
