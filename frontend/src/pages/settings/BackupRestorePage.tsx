import { useEffect, useState } from "react";
import { api, type BackupHistoryRow, type BackupState, type BackupStatusResponse } from "@/api/client";

const STATE_LABEL: Record<BackupState, string> = {
  requested: "Requested",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  unavailable: "Unavailable",
};

const STATE_CLASS: Record<BackupState, string> = {
  requested: "border-status-warning/30 bg-status-warning-subtle text-status-warning-foreground",
  running: "border-status-info/30 bg-status-info-subtle text-status-info-foreground",
  completed: "border-status-success/30 bg-status-success-subtle text-status-success-foreground",
  failed: "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground",
  unavailable: "border-border bg-surface-subtle text-text-secondary",
};

const HISTORY_LABEL: Record<string, string> = {
  ...STATE_LABEL,
  fulfilled: "Fulfilled",
};

function toState(value: string | undefined): BackupState {
  return value && value in STATE_LABEL ? (value as BackupState) : "unavailable";
}

function formatBytes(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupRestorePage() {
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
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

  const handleRequest = async () => {
    setRequesting(true);
    setError("");
    setInfo("");
    try {
      const data = await api.triggerBackup();
      setStatus(data);
      setInfo(
        toState(data.state ?? data.last_backup_status) === "requested"
          ? "Backup request recorded. The status changes to Completed only after the server backup finishes and is verified."
          : "Status refreshed.",
      );
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request a backup");
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return <p>Loading backup status...</p>;

  const state = toState(status?.state ?? status?.last_backup_status);

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Backup & Restore</h2>
        <p className="text-sm text-text-secondary">
          Shows the real status of server database backups. Backups and restores are run by the platform operator;
          you can request a backup here.
        </p>
      </div>

      {(error || info) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
          {info && <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">{info}</div>}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm text-text-secondary space-y-2">
        <p className="flex items-center gap-2">
          Backup status:
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_CLASS[state]}`}>
            {STATE_LABEL[state]}
          </span>
        </p>
        <p>
          Last server backup:{" "}
          <span className="font-semibold">
            {status?.last_backup_at && state !== "requested" ? new Date(status.last_backup_at).toLocaleString() : "Not recorded"}
          </span>
        </p>
        {status?.requested_at && (
          <p>
            Requested at: <span className="font-semibold">{new Date(status.requested_at).toLocaleString()}</span>
          </p>
        )}
        {state === "completed" && (
          <p>
            Archive size: <span className="font-semibold">{formatBytes(status?.size_bytes)}</span>
            {status?.checksum_recorded ? " · checksum recorded" : ""}
          </p>
        )}
        <p>
          Retention on server: <span className="font-semibold">{status?.retention_days ?? 0} days</span>
        </p>
        <p>
          Notes: <span className="font-semibold">{status?.last_backup_note ?? "No notes"}</span>
        </p>
        <p className="text-xs text-text-muted">
          Restore is not available in the app because it replaces the whole database. Contact support with the
          backup time you need.
        </p>
      </div>

      <button
        type="button"
        onClick={handleRequest}
        disabled={requesting || state === "requested" || state === "running"}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {requesting ? "Requesting..." : state === "requested" ? "Backup already requested" : "Request backup"}
      </button>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <h3 className="border-b border-border p-4 text-sm font-semibold text-text-primary">Backup history</h3>
        {history.length === 0 ? (
          <div className="p-4 text-sm text-text-muted">No backups or requests recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Size</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-4 py-2">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{row.kind === "tenant_request" ? "Request" : "Server backup"}</td>
                    <td className="px-4 py-2">{HISTORY_LABEL[row.status] ?? row.status}</td>
                    <td className="px-4 py-2">{formatBytes(row.size_bytes)}</td>
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
