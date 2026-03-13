import { useEffect, useState } from "react";
import { api, type BackupHistoryRow, type BackupStatusResponse } from "@/api/client";

export function BackupRestorePage() {
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [history, setHistory] = useState<BackupHistoryRow[]>([]);

  const loadStatus = async () => {
    setError("");
    try {
      const [statusData, historyRows] = await Promise.all([
        api.getBackupStatus(),
        api.listBackupHistory({ limit: 20 }),
      ]);
      setStatus(statusData);
      setHistory(historyRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backup status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    setError("");
    setSuccess("");
    try {
      const data = await api.triggerBackup();
      setStatus(data);
      setSuccess("Backup triggered successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger backup");
    } finally {
      setTriggering(false);
    }
  };

  const handleRestore = async (backupLogId: number) => {
    if (!window.confirm(`Trigger restore from snapshot #${backupLogId}?`)) return;
    setRestoringId(backupLogId);
    setError("");
    setSuccess("");
    try {
      const data = await api.triggerBackupRestore(backupLogId);
      setStatus(data);
      setSuccess(`Restore started from snapshot #${backupLogId}.`);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to trigger restore");
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) return <p>Loading backup status...</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Backup & Restore</h2>
        <p className="text-sm text-gray-600">
          View backup health and trigger a manual backup run.
        </p>
      </div>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 space-y-2">
        <p>
          Backup enabled: <span className="font-semibold">{status?.enabled ? "Yes" : "No"}</span>
        </p>
        <p>
          Provider: <span className="font-semibold">{status?.provider ?? "N/A"}</span>
        </p>
        <p>
          Retention: <span className="font-semibold">{status?.retention_days ?? 0} days</span>
        </p>
        <p>
          Last backup time:{" "}
          <span className="font-semibold">
            {status?.last_backup_at ? new Date(status.last_backup_at).toLocaleString() : "Never"}
          </span>
        </p>
        <p>
          Last backup status: <span className="font-semibold">{status?.last_backup_status ?? "unknown"}</span>
        </p>
        <p>
          Notes: <span className="font-semibold">{status?.last_backup_note ?? "No notes"}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={handleTrigger}
        disabled={triggering}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {triggering ? "Triggering..." : "Trigger manual backup"}
      </button>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <h3 className="border-b border-gray-200 p-4 text-sm font-semibold text-gray-900">Backup history</h3>
        {history.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No backup history found yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-2">Snapshot ID</th>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Note</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono">#{row.id}</td>
                    <td className="px-4 py-2">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{row.status}</td>
                    <td className="px-4 py-2">{row.note ?? "-"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(row.id)}
                        disabled={restoringId === row.id}
                        className="rounded border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                      >
                        {restoringId === row.id ? "Starting..." : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

