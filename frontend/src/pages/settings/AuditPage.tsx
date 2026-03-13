import { useEffect, useState } from "react";
import { api, type AuditLogResponse } from "@/api/client";

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.settingsListAuditLogs({
        limit,
        offset,
        action: action || undefined,
        search: search || undefined,
      });
      setLogs(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [offset]);

  const applyFilters = async (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    await load();
  };

  if (loading) return <p>Loading activity logs...</p>;
  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;

  return (
    <div className="space-y-4">
      <h1 style={{ marginTop: 0 }}>Activity logs</h1>
      <form onSubmit={applyFilters} className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filter by action (e.g. SETTINGS_USER_UPDATE)"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search details"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Apply filters
          </button>
        </div>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Time</th>
            <th style={{ padding: 8 }}>Action</th>
            <th style={{ padding: 8 }}>Resource</th>
            <th style={{ padding: 8 }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{new Date(log.created_at).toLocaleString()}</td>
              <td style={{ padding: 8 }}>{log.action}</td>
              <td style={{ padding: 8 }}>{log.resource ?? "—"}</td>
              <td style={{ padding: 8 }}>{log.details ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <p>
          Showing {logs.length} of {total} logs
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            disabled={offset === 0}
            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={offset + limit >= total}
            className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
