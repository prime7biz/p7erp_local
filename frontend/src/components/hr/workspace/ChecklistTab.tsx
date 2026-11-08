import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { api, type HrOnboardingTask } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import type { WorkspaceTab } from "./employeeWorkspaceLogic";

type Props = {
  employeeId: number;
  canManageCompliance: boolean;
  onGoToTab: (tab: WorkspaceTab) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const EVIDENCE: Record<string, string> = {
  hr_employees: "photo on file",
  hr_employee_privacy_consents: "privacy consent recorded",
  hr_employee_biometric_enrollments: "biometric consent recorded",
  hr_employee_medical_records: "medical record",
  hr_employee_documents: "uploaded document",
};

function pendingText(task: HrOnboardingTask): string {
  const due = task.due_date ? ` — due ${task.due_date}` : "";
  if (task.task_type === "MEDICAL_EXAM") return `Pending: needs a medical record with result Fit or Restricted${due}`;
  return `Pending${due}`;
}

export function ChecklistTab({ employeeId, canManageCompliance, onGoToTab, onError, onSuccess }: Props) {
  const [tasks, setTasks] = useState<HrOnboardingTask[] | null>(null);
  const [waiving, setWaiving] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setTasks(await api.listHrOnboardingTasks(employeeId));
    } catch (e) {
      logApiError("ChecklistTab.load", e);
      onError(e instanceof Error ? e.message : "Could not load the checklist");
      setTasks([]);
    }
  }, [employeeId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const waive = async (task: HrOnboardingTask) => {
    if (reason.trim().length < 3) return;
    try {
      await api.waiveHrOnboardingTask(task.id, reason.trim());
      setWaiving(null);
      setReason("");
      await load();
      onSuccess(`${task.label} waived.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Waiver failed");
    }
  };

  if (tasks === null) return <p className="text-sm text-text-muted">Loading checklist…</p>;
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
        No onboarding checklist for this employee (employees added before the checklist existed have none).
      </div>
    );
  }
  const done = tasks.filter((t) => t.status !== "DUE").length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {done} of {tasks.length} done. Tasks complete by themselves when the real record is saved on the matching tab.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface-raised">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              {task.status === "COMPLETED" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-status-success" aria-hidden="true" />
              ) : task.status === "WAIVED" ? (
                <MinusCircle className="mt-0.5 h-4 w-4 text-text-muted" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 text-status-warning" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-medium text-text-primary">{task.label}</p>
                <p className="text-xs text-text-muted">
                  {task.status === "COMPLETED" && `Done — ${EVIDENCE[task.source_table ?? ""] ?? "record"} #${task.source_id}`}
                  {task.status === "WAIVED" && `Waived: ${task.waive_reason}`}
                  {task.status === "DUE" && pendingText(task)}
                </p>
              </div>
            </div>
            {task.status === "DUE" && (
              <div className="flex flex-wrap items-center gap-2">
                {task.tab && (
                  <button
                    type="button"
                    onClick={() => onGoToTab(task.tab as WorkspaceTab)}
                    className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    Open
                  </button>
                )}
                {canManageCompliance &&
                  (waiving === task.id ? (
                    <>
                      <input
                        className="rounded border border-border-strong px-2 py-1 text-xs"
                        placeholder="Reason (required)"
                        aria-label={`Reason for waiving ${task.label}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={1000}
                      />
                      <button
                        type="button"
                        onClick={() => void waive(task)}
                        disabled={reason.trim().length < 3}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
                      >
                        Confirm waiver
                      </button>
                      <button type="button" onClick={() => setWaiving(null)} className="text-xs text-text-muted hover:underline">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setWaiving(task.id);
                        setReason("");
                      }}
                      className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                    >
                      Waive…
                    </button>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
