import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

export function TnaPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const { me } = useAuth();
  const numericPlanId = Number(planId || 0);

  const [plan, setPlan] = useState<Awaited<ReturnType<typeof api.getMfgTnaPlan>> | null>(null);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof api.listMfgTnaPlanTasks>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.listUsers>>>([]);
  const [taskEditById, setTaskEditById] = useState<Record<number, { status: string; actual_date: string; remarks: string; owner_user_id: number | null }>>({});
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    if (!numericPlanId) return;
    setError("");
    try {
      const [planRow, taskRows, userRows] = await Promise.all([
        api.getMfgTnaPlan(numericPlanId),
        api.listMfgTnaPlanTasks(numericPlanId),
        api.listUsers(),
      ]);
      setPlan(planRow);
      setTasks(taskRows);
      setUsers(userRows.filter((row) => row.is_active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plan detail");
    }
  };

  useEffect(() => {
    void load();
  }, [numericPlanId]);

  useEffect(() => {
    setTaskEditById(
      Object.fromEntries(
        tasks.map((row) => [
          row.id,
          {
            status: row.status,
            actual_date: row.actual_date ?? "",
            remarks: row.remarks ?? "",
            owner_user_id: row.owner_user_id,
          },
        ]),
      ),
    );
  }, [tasks]);

  const myRole = useMemo(() => {
    const mine = users.find((row) => row.id === me?.user_id);
    return (mine?.role_name ?? "").trim().toLowerCase();
  }, [users, me?.user_id]);
  const canManage = myRole === "admin" || myRole === "manager" || myRole === "supervisor";

  const kpis = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const delayed = tasks.filter((t) => t.status === "delayed").length;
    const completion = total > 0 ? (done / total) * 100 : 0;
    return { total, done, delayed, completion };
  }, [tasks]);

  const saveTask = async (taskId: number) => {
    if (!canManage) return;
    const edit = taskEditById[taskId];
    if (!edit) return;
    setSavingTaskId(taskId);
    setError("");
    try {
      await api.updateMfgTnaPlanTask(taskId, {
        status: edit.status,
        actual_date: edit.actual_date || null,
        remarks: edit.remarks,
        owner_user_id: edit.owner_user_id,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">TNA Plan Detail</h1>
        <p className="text-sm text-slate-500">Track a single plan with task-by-task execution updates.</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {plan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div><div className="text-xs text-slate-500">Plan</div><div className="text-sm font-semibold">{plan.plan_code}</div></div>
            <div><div className="text-xs text-slate-500">Status</div><div className="text-sm font-semibold">{plan.status}</div></div>
            <div><div className="text-xs text-slate-500">Start</div><div className="text-sm font-semibold">{plan.start_date}</div></div>
            <div><div className="text-xs text-slate-500">Target End</div><div className="text-sm font-semibold">{plan.target_end_date ?? "-"}</div></div>
            <div><div className="text-xs text-slate-500">Role</div><div className="text-sm font-semibold">{myRole || "-"}</div></div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Total Tasks</div><div className="text-xl font-semibold">{kpis.total}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Done</div><div className="text-xl font-semibold">{kpis.done}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Delayed</div><div className="text-xl font-semibold">{kpis.delayed}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Completion</div><div className="text-xl font-semibold">{kpis.completion.toFixed(1)}%</div></div>
      </div>

      {!canManage ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You have view-only access. Supervisor/Manager/Admin role is required for task updates.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-3 py-2">Seq</th><th className="px-3 py-2">Task</th><th className="px-3 py-2">Dependency</th><th className="px-3 py-2">Planned</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Remarks</th><th className="px-3 py-2">Action</th></tr>
          </thead>
          <tbody>
            {tasks.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.seq_no}</td>
                <td className="px-3 py-2">{row.task_name}</td>
                <td className="px-3 py-2">
                  {row.depends_on_seq ? (
                    <span className={row.dependency_ready ? "text-emerald-700" : "text-amber-700"}>
                      Seq {row.depends_on_seq} ({row.dependency_status ?? "missing"})
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2">{row.planned_date}</td>
                <td className="px-3 py-2">
                  <input
                    className="rounded border px-2 py-1 text-xs"
                    type="date"
                    value={taskEditById[row.id]?.actual_date ?? row.actual_date ?? ""}
                    onChange={(e) =>
                      setTaskEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { status: row.status, actual_date: row.actual_date ?? "", remarks: row.remarks ?? "", owner_user_id: row.owner_user_id }), actual_date: e.target.value },
                      }))
                    }
                    disabled={!canManage}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={taskEditById[row.id]?.owner_user_id ?? ""}
                    onChange={(e) =>
                      setTaskEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { status: row.status, actual_date: row.actual_date ?? "", remarks: row.remarks ?? "", owner_user_id: row.owner_user_id }), owner_user_id: e.target.value ? Number(e.target.value) : null },
                      }))
                    }
                    disabled={!canManage}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {[u.first_name ?? "", u.last_name ?? ""].join(" ").trim() || u.username || u.email}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={taskEditById[row.id]?.status ?? row.status}
                    onChange={(e) =>
                      setTaskEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { status: row.status, actual_date: row.actual_date ?? "", remarks: row.remarks ?? "", owner_user_id: row.owner_user_id }), status: e.target.value },
                      }))
                    }
                    disabled={!canManage}
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="delayed">Delayed</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    className="w-48 rounded border px-2 py-1 text-xs"
                    value={taskEditById[row.id]?.remarks ?? row.remarks ?? ""}
                    onChange={(e) =>
                      setTaskEditById((prev) => ({
                        ...prev,
                        [row.id]: { ...(prev[row.id] ?? { status: row.status, actual_date: row.actual_date ?? "", remarks: row.remarks ?? "", owner_user_id: row.owner_user_id }), remarks: e.target.value },
                      }))
                    }
                    disabled={!canManage}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => void saveTask(row.id)}
                    disabled={
                      !canManage ||
                      savingTaskId === row.id ||
                      (((taskEditById[row.id]?.status ?? row.status) === "in_progress" || (taskEditById[row.id]?.status ?? row.status) === "done") &&
                        !row.dependency_ready)
                    }
                  >
                    {savingTaskId === row.id ? "Saving..." : "Save"}
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={9}>No tasks in this plan.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
