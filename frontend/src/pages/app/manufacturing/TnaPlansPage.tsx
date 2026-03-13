import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, type MfgTnaPlanCreate } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function TnaPlansPage() {
  const { me } = useAuth();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.listMfgTnaTemplates>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.listMfgTnaPlans>>>([]);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof api.listMfgTnaPlanTasks>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.listUsers>>>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null);
  const [taskEditById, setTaskEditById] = useState<Record<number, { status: string; actual_date: string; remarks: string; owner_user_id: number | null }>>({});
  const [form, setForm] = useState<MfgTnaPlanCreate>({
    template_id: 0,
    start_date: todayIso(),
    status: "active",
  });

  const load = async () => {
    setError("");
    try {
      const [templateRows, planRows, userRows] = await Promise.all([
        api.listMfgTnaTemplates({ active_only: true }),
        api.listMfgTnaPlans({ status_filter: statusFilter || undefined }),
        api.listUsers(),
      ]);
      setTemplates(templateRows);
      setPlans(planRows);
      setUsers(userRows.filter((row) => row.is_active));
      if (!form.template_id && templateRows[0]) {
        const firstTemplate = templateRows[0];
        if (firstTemplate) setForm((prev) => ({ ...prev, template_id: firstTemplate.id }));
      }
      if (!selectedPlanId && planRows[0]) {
        const firstPlan = planRows[0];
        if (firstPlan) setSelectedPlanId(firstPlan.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load TNA plans");
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  useEffect(() => {
    if (!selectedPlanId) {
      setTasks([]);
      setTaskEditById({});
      return;
    }
    void api.listMfgTnaPlanTasks(selectedPlanId).then(setTasks).catch((e) => {
      setError(e instanceof Error ? e.message : "Failed to load plan tasks");
    });
  }, [selectedPlanId]);

  const templateMap = useMemo(() => new Map(templates.map((row) => [row.id, row.name])), [templates]);
  const myRole = useMemo(() => {
    const mine = users.find((row) => row.id === me?.user_id);
    return (mine?.role_name ?? "").trim().toLowerCase();
  }, [users, me?.user_id]);
  const canManage = myRole === "admin" || myRole === "manager" || myRole === "supervisor";

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

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!form.template_id || !form.start_date) return;
    setError("");
    try {
      await api.createMfgTnaPlan(form);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create plan");
    }
  };

  const saveTask = async (taskId: number, statusValue?: string) => {
    if (!canManage) return;
    const edit = taskEditById[taskId];
    if (!edit) return;
    const nextStatus = statusValue ?? edit.status;
    setSavingTaskId(taskId);
    setError("");
    try {
      await api.updateMfgTnaPlanTask(taskId, {
        status: nextStatus,
        actual_date: edit.actual_date || null,
        remarks: edit.remarks,
        owner_user_id: edit.owner_user_id,
      });
      if (selectedPlanId) {
        setTasks(await api.listMfgTnaPlanTasks(selectedPlanId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update task");
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">TNA Plans</h1>
        <p className="text-sm text-slate-500">Generate plans from templates and update task execution status.</p>
      </div>
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create Plan</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-5" onSubmit={createPlan}>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Optional plan code" value={form.plan_code ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, plan_code: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.template_id || ""} onChange={(e) => setForm((prev) => ({ ...prev, template_id: Number(e.target.value) }))}>
            <option value="">Select template</option>
            {templates.map((row) => (
              <option key={row.id} value={row.id}>
                {row.template_code} - {row.name}
              </option>
            ))}
          </select>
          <input className="rounded border px-3 py-2 text-sm" type="date" value={form.start_date} onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.status ?? "active"} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60" type="submit" disabled={!canManage}>Create Plan</button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={selectedPlanId ?? ""} onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select plan for tasks</option>
            {plans.map((row) => (
              <option key={row.id} value={row.id}>
                {row.plan_code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-3 py-2">Plan Code</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">Target End</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr>
          </thead>
          <tbody>
            {plans.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 font-medium">{row.plan_code}</td>
                <td className="px-3 py-2">{templateMap.get(row.template_id) ?? `Template #${row.template_id}`}</td>
                <td className="px-3 py-2">{row.start_date}</td>
                <td className="px-3 py-2">{row.target_end_date ?? "-"}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  <Link className="rounded border px-2 py-1 text-xs" to={`/app/tna/plans/${row.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {plans.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={6}>No TNA plans found.</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 text-sm font-semibold text-slate-700">Plan Tasks</div>
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
                  <div className="flex gap-1">
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void saveTask(row.id, "in_progress")} disabled={!canManage || savingTaskId === row.id || !row.dependency_ready}>Start</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void saveTask(row.id, "delayed")} disabled={!canManage || savingTaskId === row.id}>Delay</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void saveTask(row.id, "done")} disabled={!canManage || savingTaskId === row.id || !row.dependency_ready}>Done</button>
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void saveTask(row.id)} disabled={!canManage || savingTaskId === row.id}>
                      {savingTaskId === row.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {tasks.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={9}>No tasks for selected plan.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
