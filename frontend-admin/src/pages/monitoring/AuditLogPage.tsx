import { useCallback, useEffect, useState } from "react";
import { getMonitoringAudit, exportMonitoringAuditCsv } from "@/api/client";
import type { AuditLogItem, AuditLogResponse } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { formatDateTime } from "@/utils/format";
import { useToast } from "@/context/ToastContext";
import { useAdminAuth } from "@/context/AdminAuthContext";

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

export function AuditLogPage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    getMonitoringAudit({
      page,
      page_size: 50,
      tenant_id: tenantId ? parseInt(tenantId, 10) : undefined,
      action: action || undefined,
    })
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page, tenantId, action]);

  useEffect(() => {
    load();
  }, [load]);

  const items: AuditLogItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Cross-tenant API and activity audit (recent first)."
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
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm flex-1 max-w-xs"
          placeholder="Action contains"
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
          <span className="text-sm text-slate-600 tabular-nums">
            Page {page} of {totalPages}
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

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 whitespace-nowrap">ID</th>
              <th className="px-3 py-3 whitespace-nowrap">Tenant</th>
              <th className="px-3 py-3 whitespace-nowrap">User</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3 min-w-[12rem]">Path</th>
              <th className="px-3 py-3 whitespace-nowrap">Status</th>
              <th className="px-3 py-3 whitespace-nowrap">ms</th>
              <th className="px-3 py-3 whitespace-nowrap">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  No audit entries.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80 align-top">
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">{row.id}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.tenant_id ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{row.user_id ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-800 max-w-[10rem] truncate" title={row.action}>
                    {row.action}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 font-mono text-xs break-all max-w-md">
                    {row.request_path ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">{statusBadge(row.response_status)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-600">{row.duration_ms ?? "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                    {formatDateTime(row.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
