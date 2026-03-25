import { useCallback, useEffect, useState } from "react";
import { getSystemHealth, getDbStats, getSlowQueries } from "@/api/client";
import type { SystemHealthResponse } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBytes } from "@/utils/format";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { usePolling } from "@/hooks/usePolling";

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 1000) / 10);
}

export function SystemHealthPage() {
  const { can } = useAdminAuth();
  const [data, setData] = useState<SystemHealthResponse | null>(null);
  const [tables, setTables] = useState<{ table_name: string; total_bytes: number }[]>([]);
  const [slow, setSlow] = useState<{ query: string; calls: number; mean_ms: number; total_ms: number }[]>([]);
  const [slowErr, setSlowErr] = useState<string | null>(null);
  const [slowNote, setSlowNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const h = await getSystemHealth();
      setData(h);
      if (can("monitoring.health_advanced")) {
        const db = await getDbStats().catch(() => ({ tables: [] as { table_name: string; total_bytes: number }[] }));
        setTables(db.tables ?? []);
        try {
          const sq = await getSlowQueries();
          if ("items" in sq) {
            setSlow(sq.items);
            setSlowErr(null);
            setSlowNote(typeof sq.note === "string" && sq.note ? sq.note : null);
          } else {
            setSlowErr("Slow queries unavailable");
            setSlowNote(null);
          }
        } catch (e: unknown) {
          setSlowErr(e instanceof Error ? e.message : "Unavailable");
          setSlow([]);
          setSlowNote(null);
        }
      } else {
        setTables([]);
        setSlow([]);
        setSlowErr(null);
        setSlowNote(null);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [can]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  usePolling(() => void refresh(), 30_000, true);

  const disk = data?.disk;
  const usedPct = disk ? pct(disk.used_bytes, disk.total_bytes) : 0;

  if (loading && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="System health"
        description="Disk and API environment for all roles; database size and slow queries require super admin."
        actions={
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setLoading(true);
              void refresh().finally(() => setLoading(false));
            }}
          >
            Refresh now
          </button>
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Disk</h2>
          {disk ? (
            <>
              <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden mb-3">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  Used: <span className="font-medium text-slate-800">{formatBytes(disk.used_bytes)}</span>
                </div>
                <div>
                  Free: <span className="font-medium text-slate-800">{formatBytes(disk.free_bytes)}</span>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="No disk data" description="Could not read server disk stats." />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Gemini</h2>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
              data?.gemini_enabled ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"
            }`}
          >
            {data?.gemini_enabled ? "Enabled" : "Disabled"}
          </span>
          <p className="text-xs text-slate-500 mt-3">Server env (e.g. GEMINI_ENABLED).</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Environment</h2>
          <span className="inline-flex rounded-full px-3 py-1 text-sm font-semibold bg-slate-100 text-slate-800 capitalize">
            {data?.api_env ?? "—"}
          </span>
        </div>
      </div>

      {can("monitoring.health_advanced") ? (
        <>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Top PostgreSQL tables (by size)</h2>
          <DataTable
            columns={[
              { key: "t", header: "Table", cell: (r) => <span className="font-mono text-xs">{r.table_name}</span> },
              { key: "s", header: "Size", cell: (r) => formatBytes(r.total_bytes) },
            ]}
            rows={tables}
            rowKey={(r) => r.table_name}
            emptyMessage="No DB stats."
          />

          <h2 className="text-lg font-semibold text-slate-800 mb-3 mt-8">Slow queries (pg_stat_statements)</h2>
          {slowErr && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">{slowErr}</p>
          )}
          {slowNote && !slowErr && (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3">{slowNote}</p>
          )}
          {!slowErr && (
            <DataTable
              columns={[
                { key: "q", header: "Query", cell: (r) => <span className="font-mono text-[10px] break-all">{r.query}</span> },
                { key: "c", header: "Calls", cell: (r) => r.calls },
                { key: "m", header: "Mean ms", cell: (r) => r.mean_ms.toFixed(2) },
              ]}
              rows={slow}
              rowKey={(r) => `${r.calls}-${r.mean_ms}-${r.query.slice(0, 40)}`}
              emptyMessage="No data."
            />
          )}
        </>
      ) : (
        <EmptyState
          title="Advanced database diagnostics"
          description="Table sizes and slow queries are limited to super admins. Basic disk and environment metrics are shown above."
        />
      )}
    </div>
  );
}
