import { useEffect, useState } from "react";
import { api, type MerchCriticalAlert } from "@/api/client";

export function MerchCriticalAlertsPage() {
  const [alerts, setAlerts] = useState<MerchCriticalAlert[]>([]);
  const [summary, setSummary] = useState<{ critical: number; warning: number; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMerchCriticalAlerts()
      .then((r) => {
        setAlerts(r.alerts);
        setSummary(r.summary);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load critical alerts"));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Critical Alerts</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overdue and at-risk merchandising follow-up alerts.</p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="flex gap-3 text-sm">
        <span className="rounded border border-red-200 bg-red-50 px-3 py-1 text-red-700">Critical: {summary?.critical ?? "—"}</span>
        <span className="rounded border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">Warning: {summary?.warning ?? "—"}</span>
        <span className="rounded border border-gray-200 bg-gray-50 px-3 py-1 text-gray-700">Total: {summary?.total ?? "—"}</span>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Severity</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2">{a.severity}</td>
                <td className="px-4 py-2">{a.category}</td>
                <td className="px-4 py-2 font-medium text-gray-900">{a.title}</td>
                <td className="px-4 py-2 text-gray-700">{a.description}</td>
              </tr>
            ))}
            {alerts.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No alerts.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
