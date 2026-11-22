import { useCallback, useEffect, useState } from "react";
import { getMonitoringAudit, exportMonitoringAuditCsv } from "@/api/client";
import type { AuditLogItem, AuditLogResponse } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { formatDateTime } from "@/utils/format";
import { useToast } from "@/context/ToastContext";
import { useAdminAuth } from "@/context/AdminAuthContext";

type Preset = "all" | "api" | "auth" | "errors";

function statusBadge(status: number | null) {
  if (status == null) return <span className="text-slate-400">—</span>;
  const ok = status >= 200 && status < 300;
  const warn = status >= 400 && status < 500;
  const bad = status >= 500 || status < 200;
  const cls = ok
    ? "bg-emerald-100 text-emerald-800"
    : warn
      ? "bg-amber-100 text-amber-900"
      : bad
        ? "bg-red-100 text-red-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-mono font-semibold ${cls}`}>{status}</span>
  );
}

function presetAction(preset: Preset): string {
  if (preset === "api") return "API_REQUEST";
  if (preset === "auth") return "LOGIN";
  if (preset === "errors") return "API_ERROR";
  return "";
}

export function AuditLogPage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [preset, setPreset] = useState<Preset>("all");

  const effectiveAction = action.trim() || presetAction(preset) || undefined;

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    getMonitoringAudit({
      page,
      page_size: 50,
      tenant_id: tenantId ? parseInt(tenantId, 10) : undefined,
      user_id: userId ? parseInt(userId, 10) : undefined,
      action: effectiveAction,
    })
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page, tenantId, userId, effectiveAction]);

  useEffect(() => {
    load();
  }, [load]);

  const items: AuditLogItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applyPreset = (next: Preset) => {
    setPage(1);
    setPreset(next);
    // Clear free-text action so the preset takes effect.
    setAction("");
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Cross-tenant API and activity audit (recent first). Use the API requests preset for technical traffic."
        actions={
          can("monitoring.audit_export") ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await exportMonitoringAuditCsv({
                    tenant_id: tenantId ? parseInt(tenantId, 10) : undefined,
                  });
                  showToast("Export downloaded", "success");
                } catch (e: unknown) {
                  showToast(e instanceof Error ? e.message : "Export failed", "error");
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
            >
              Export CSV
            </button>
          ) : null
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["all", "All events"],
            ["api", "API requests"],
            ["auth", "Login events"],
            ["errors", "API errors"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
              preset === id && !action.trim()
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <FilterBar>
        <input
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-32"
          placeholder="Tenant ID"
          value={tenantId}
          onChange={(e) => {
            setPage(1);
            setTenantId(e.target.value);
          }}
        />
        <input
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-32"
          placeholder="User ID"
          value={userId}
          onChange={(e) => {
            setPage(1);
            setUserId(e.target.value);
          }}
        />
        <input
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm flex-1 max-w-xs"
          placeholder="Action contains (overrides preset)"
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
        />
      </FilterBar>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{total}</span> total entries
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">ms</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-slate-500">
                    No rows for these filters.
                  </td>
                </tr>
              ) : (
                items.map((row: AuditLogItem) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTime(row.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.tenant_id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.user_id ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{row.action}</div>
                      <div className="text-xs text-slate-500">{row.resource ?? ""}</div>
                    </td>
                    <td className="max-w-xs break-all px-3 py-2 font-mono text-xs">{row.request_path ?? "—"}</td>
                    <td className="px-3 py-2">{statusBadge(row.response_status)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.duration_ms ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{row.ip_address ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
