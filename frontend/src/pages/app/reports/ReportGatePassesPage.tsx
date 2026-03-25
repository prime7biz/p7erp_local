import { useEffect, useState } from "react";
import { api, type EnhancedGatePassResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function toCsv(rows: EnhancedGatePassResponse[]) {
  const h = ["gate_pass_code", "status", "purpose", "destination", "vehicle_no", "guard_ack"];
  const lines = [h.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.gate_pass_code,
        r.status,
        (r.purpose ?? "").replaceAll(",", " "),
        (r.destination ?? "").replaceAll(",", " "),
        r.vehicle_no ?? "",
        r.guard_acknowledged ? "yes" : "no",
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function ReportGatePassesPage() {
  const [rows, setRows] = useState<EnhancedGatePassResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listEnhancedGatePasses({ status_filter: statusFilter || undefined })
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        logApiError("ReportGatePassesPage", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gate-passes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Gate Pass Register</h1>
          <p className="text-text-muted text-sm mt-0.5">Enhanced gate passes (inventory).</p>
        </div>
        <div className="flex gap-2">
          <input
            className="rounded border border-border-strong px-2 py-1 text-sm"
            placeholder="Status filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <button type="button" className="rounded border border-border px-3 py-1 text-sm" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No gate passes</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Code</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Purpose</th>
                <th className="py-2 px-4">Destination</th>
                <th className="py-2 px-4">Vehicle</th>
                <th className="py-2 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle">
                  <td className="py-2 px-4 font-medium">{r.gate_pass_code}</td>
                  <td className="py-2 px-4">{r.status}</td>
                  <td className="py-2 px-4">{r.purpose ?? "—"}</td>
                  <td className="py-2 px-4">{r.destination ?? "—"}</td>
                  <td className="py-2 px-4">{r.vehicle_no ?? "—"}</td>
                  <td className="py-2 px-4">{r.guard_acknowledged ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
