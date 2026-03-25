import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listPlatformAudit, type PlatformAdminAuditItem } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/utils/format";

export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: PlatformAdminAuditItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await listPlatformAudit(page, 100);
      setData({ items: r.items, total: r.total });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 100));

  if (loading && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Admin activity" description="Platform super-admin actions (cross-tenant)." />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (r) => r.id },
          { key: "admin", header: "Admin", cell: (r) => r.admin_id },
          { key: "action", header: "Action", cell: (r) => r.action },
          {
            key: "tenant",
            header: "Target tenant",
            cell: (r) =>
              r.target_tenant_id != null ? (
                <Link className="text-indigo-600 hover:underline" to={`/tenants/${r.target_tenant_id}`}>
                  {r.target_tenant_id}
                </Link>
              ) : (
                "—"
              ),
          },
          { key: "res", header: "Resource", cell: (r) => r.resource ?? "—" },
          { key: "d", header: "Details", cell: (r) => <span className="text-xs text-slate-600 max-w-xs truncate block">{r.details ?? "—"}</span> },
          { key: "t", header: "Time", cell: (r) => formatDateTime(r.created_at) },
        ]}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        emptyMessage="No entries."
      />
      <div className="flex justify-between items-center mt-4">
        <span className="text-sm text-slate-600">{data?.total ?? 0} total</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border px-3 py-1 text-sm">
            Previous
          </button>
          <span className="text-sm tabular-nums">
            Page {page} / {totalPages}
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1 text-sm">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
