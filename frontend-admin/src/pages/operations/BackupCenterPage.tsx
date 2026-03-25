import { useCallback, useEffect, useState } from "react";
import {
  listBackupJobs,
  listBackupSchedules,
  triggerFullBackup,
  triggerTenantBackup,
  downloadBackupJob,
  createBackupSchedule,
  patchBackupSchedule,
  deleteBackupSchedule,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/context/ToastContext";
import { formatBytes, formatDateTime } from "@/utils/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { BackupJobItem, BackupScheduleItem } from "@/api/client";
import { usePolling } from "@/hooks/usePolling";

function statusVariant(s: string) {
  const x = s.toLowerCase();
  if (x === "completed" || x === "done") return "success" as const;
  if (x === "failed" || x === "error") return "danger" as const;
  if (x === "queued" || x === "running") return "warning" as const;
  return "neutral" as const;
}

export function BackupCenterPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"jobs" | "schedules">("jobs");
  const [jobs, setJobs] = useState<BackupJobItem[]>([]);
  const [schedules, setSchedules] = useState<BackupScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmFull, setConfirmFull] = useState(false);
  const [tenantBackup, setTenantBackup] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [j, s] = await Promise.all([listBackupJobs(1, 100), listBackupSchedules()]);
        setJobs(j.items);
        setSchedules(s.items);
      } catch (e: unknown) {
        if (!opts?.silent) showToast(e instanceof Error ? e.message : "Failed", "error");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(() => void load({ silent: true }), 15_000, true);

  if (loading && jobs.length === 0) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Backup center"
        description="Full and tenant exports, schedules, and downloads."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh now
            </button>
            <button
              type="button"
              onClick={() => setConfirmFull(true)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Full backup
            </button>
            <div className="flex gap-1 items-center">
              <input
                className="rounded border border-slate-200 px-2 py-1 text-sm w-24"
                placeholder="Tenant ID"
                value={tenantBackup}
                onChange={(e) => setTenantBackup(e.target.value)}
              />
              <button
                type="button"
                disabled={!tenantBackup}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await triggerTenantBackup(Number(tenantBackup));
                    showToast("Tenant backup completed", "success");
                    load();
                  } catch (e: unknown) {
                    showToast(e instanceof Error ? e.message : "Failed", "error");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                Tenant backup
              </button>
            </div>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "jobs", label: "Jobs" },
          { id: "schedules", label: "Schedules" },
        ]}
        active={tab}
        onChange={(t) => setTab(t as "jobs" | "schedules")}
      />

      {tab === "jobs" && (
        <DataTable
          columns={[
            { key: "id", header: "ID", cell: (j) => j.id },
            { key: "t", header: "Type", cell: (j) => j.backup_type },
            { key: "ten", header: "Tenant", cell: (j) => j.tenant_id ?? "—" },
            {
              key: "s",
              header: "Status",
              cell: (j) => <StatusBadge variant={statusVariant(j.status)}>{j.status}</StatusBadge>,
            },
            { key: "sz", header: "Size", cell: (j) => formatBytes(j.size_bytes ?? undefined) },
            { key: "fn", header: "File", cell: (j) => <span className="font-mono text-xs truncate max-w-[200px] block">{j.file_name ?? "—"}</span> },
            { key: "c", header: "Created", cell: (j) => formatDateTime(j.created_at) },
            {
              key: "dl",
              header: "",
              cell: (j) =>
                j.status === "completed" ? (
                  <button
                    type="button"
                    className="text-xs text-indigo-600"
                    onClick={() => downloadBackupJob(j.id, j.file_name ?? undefined).catch((e) => showToast(String(e), "error"))}
                  >
                    Download
                  </button>
                ) : null,
            },
          ]}
          rows={jobs}
          rowKey={(j) => j.id}
          emptyMessage="No backup jobs."
        />
      )}

      {tab === "schedules" && (
        <div className="space-y-4">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            onClick={async () => {
              await createBackupSchedule({ frequency: "daily", retention_days: 30, is_active: true });
              showToast("Schedule created", "success");
              load();
            }}
          >
            Add daily schedule (full)
          </button>
          <DataTable
            columns={[
              { key: "id", header: "ID", cell: (s) => s.id },
              { key: "t", header: "Tenant", cell: (s) => s.tenant_id ?? "Platform" },
              { key: "f", header: "Frequency", cell: (s) => s.frequency },
              {
                key: "a",
                header: "Active",
                cell: (s) => (
                  <button
                    type="button"
                    className="text-xs text-indigo-600"
                    onClick={() =>
                      patchBackupSchedule(s.id, { is_active: !s.is_active }).then(() => {
                        showToast("Updated", "success");
                        load();
                      })
                    }
                  >
                    {s.is_active ? "on" : "off"}
                  </button>
                ),
              },
              { key: "n", header: "Next run", cell: (s) => s.next_run_at ?? "—" },
              {
                key: "d",
                header: "",
                cell: (s) => (
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={() => deleteBackupSchedule(s.id).then(() => { showToast("Deleted", "success"); load(); })}
                  >
                    Delete
                  </button>
                ),
              },
            ]}
            rows={schedules}
            rowKey={(s) => s.id}
            emptyMessage="No schedules."
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmFull}
        onClose={() => setConfirmFull(false)}
        onConfirm={async () => {
          setConfirmFull(false);
          setBusy(true);
          try {
            await triggerFullBackup();
            showToast("Full backup completed", "success");
            load();
          } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : "Failed", "error");
          } finally {
            setBusy(false);
          }
        }}
        title="Run full backup?"
        message="This runs pg_dump on the server. It may take several minutes."
        confirmLabel="Run backup"
        loading={busy}
      />
    </div>
  );
}
