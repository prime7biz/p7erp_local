import { preferShareOverPrint, shareOrSaveBlob } from "@/lib/fileSave";
import { useMediaQuery } from "@/hooks/useInventoryListView";
import { useMobileUiV2Phone } from "@/hooks/useMobileUiV2";
import { PHONE_MEDIA_QUERY } from "@/lib/mobileUi";
import { logApiError } from "@/utils/logApiError";
import { useState } from "react";

type Props = {
  /** Fetch the tenant-scoped PDF blob. */
  downloadPdf: () => Promise<Blob>;
  /** Suggested download / share filename (include .pdf). */
  filename: string;
  /** Log prefix for failures. */
  logKey: string;
  /** Desktop button classes (match existing print pages). */
  desktopClassName?: string;
  phoneClassName?: string;
};

/**
 * Desktop: Print / Save PDF via window.print.
 * Phone: Save PDF + Share via shareOrSaveBlob (Phase 6 merch docs).
 */
export function PrintPdfToolbarActions({
  downloadPdf,
  filename,
  logKey,
  desktopClassName = "rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-primary/90",
  phoneClassName = "rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-primary/90",
}: Props) {
  const mobileV2Phone = useMobileUiV2Phone();
  const narrow = useMediaQuery(PHONE_MEDIA_QUERY);
  const phoneActions = preferShareOverPrint(mobileV2Phone || narrow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveOrShare() {
    setBusy(true);
    setError("");
    try {
      const blob = await downloadPdf();
      await shareOrSaveBlob(blob, filename);
    } catch (e) {
      logApiError(logKey, e);
      setError(e instanceof Error ? e.message : "Could not save PDF");
    } finally {
      setBusy(false);
    }
  }

  if (phoneActions) {
    return (
      <>
        <button type="button" disabled={busy} onClick={() => void saveOrShare()} className={phoneClassName}>
          {busy ? "Saving…" : "Save PDF"}
        </button>
        <button type="button" disabled={busy} onClick={() => void saveOrShare()} className={phoneClassName}>
          Share
        </button>
        {error ? <span className="text-xs text-status-danger-foreground">{error}</span> : null}
      </>
    );
  }

  return (
    <button type="button" onClick={() => window.print()} className={desktopClassName}>
      Print / Save PDF
    </button>
  );
}
