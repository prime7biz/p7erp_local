import { useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

const REPORTS: {
  key: string;
  title: string;
  description: string;
  available: boolean;
}[] = [
  {
    key: "recovery_summary",
    title: "Recovery summary",
    description: "JSON snapshot of coverage ratio, recovery band, and drivers per financed order.",
    available: true,
  },
  {
    key: "production_status",
    title: "Production status",
    description: "JSON snapshot of cutting, sewing, finishing, and shipment milestones.",
    available: true,
  },
  {
    key: "lender_pack",
    title: "Lender pack",
    description: "Consolidated export of key credit and movement signals (coming later).",
    available: false,
  },
];

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FinancierReportsPage() {
  const [err, setErr] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function handleExport(key: string) {
    setErr("");
    setLoadingKey(key);
    try {
      const data = await financierPortalApi.report(key);
      if (data.status === "ok") {
        downloadJson(`${key}_${new Date().toISOString().slice(0, 10)}.json`, data);
      } else {
        setErr(typeof data.message === "string" ? data.message : "Export not available.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Reports</h1>
        <p className="mt-1 text-xs text-text-muted">
          Download JSON snapshots for your records. Requires full financier portal scope and analyst export permission.
        </p>
      </div>
      {err ? <PortalErrorState message={err} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="flex flex-col rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-primary">{r.title}</h2>
              {!r.available ? (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  Coming soon
                </span>
              ) : null}
            </div>
            <p className="mt-2 flex-1 text-xs text-text-muted">{r.description}</p>
            {r.available ? (
              <button
                type="button"
                disabled={loadingKey === r.key}
                onClick={() => void handleExport(r.key)}
                className="mt-3 self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-subtle disabled:opacity-50"
              >
                {loadingKey === r.key ? "Preparing…" : "Download JSON"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
