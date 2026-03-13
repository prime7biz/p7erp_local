import { useEffect, useState } from "react";

import { api, type MfgTnaTemplateCreate, type MfgTnaTemplateTaskCreate } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

export function TnaTemplatesPage() {
  const { me } = useAuth();
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.listMfgTnaTemplates>>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof api.listMfgTnaTemplateTasks>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.listUsers>>>([]);
  const [error, setError] = useState("");
  const [templateForm, setTemplateForm] = useState<MfgTnaTemplateCreate>({ name: "", applies_to: "order", is_active: true });
  const [taskForm, setTaskForm] = useState<MfgTnaTemplateTaskCreate>({
    seq_no: 1,
    task_name: "",
    offset_days: 0,
    duration_days: 1,
    is_milestone: false,
  });

  const loadTemplates = async () => {
    const rows = await api.listMfgTnaTemplates();
    setTemplates(rows);
    if (!selectedTemplateId && rows[0]) setSelectedTemplateId(rows[0].id);
  };

  const loadTasks = async (templateId: number) => {
    const rows = await api.listMfgTnaTemplateTasks(templateId);
    setTasks(rows);
  };

  const refresh = async () => {
    setError("");
    try {
      const [_, userRows] = await Promise.all([loadTemplates(), api.listUsers()]);
      setUsers(userRows.filter((row) => row.is_active));
      if (selectedTemplateId) await loadTasks(selectedTemplateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load TNA templates");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (selectedTemplateId) {
      void loadTasks(selectedTemplateId);
    } else {
      setTasks([]);
    }
  }, [selectedTemplateId]);

  const createTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!templateForm.name?.trim()) return;
    setError("");
    try {
      await api.createMfgTnaTemplate({ ...templateForm, name: templateForm.name.trim() });
      setTemplateForm({ name: "", applies_to: "order", is_active: true });
      await loadTemplates();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create template");
    }
  };

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage) return;
    if (!selectedTemplateId || !taskForm.task_name?.trim()) return;
    setError("");
    try {
      await api.addMfgTnaTemplateTask(selectedTemplateId, { ...taskForm, task_name: taskForm.task_name.trim() });
      setTaskForm((prev) => ({ ...prev, seq_no: prev.seq_no + 1, task_name: "" }));
      await loadTasks(selectedTemplateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add template task");
    }
  };

  const myRole = (() => {
    const mine = users.find((row) => row.id === me?.user_id);
    return (mine?.role_name ?? "").trim().toLowerCase();
  })();
  const canManage = myRole === "admin" || myRole === "manager" || myRole === "supervisor";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">TNA Templates</h1>
        <p className="text-sm text-slate-500">Define reusable task templates for order/sample TNA planning.</p>
      </div>
      {!canManage ? (
        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You have view-only access. Supervisor/Manager/Admin role is required for template changes.
        </div>
      ) : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create Template</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={createTemplate}>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Optional code" value={templateForm.template_code ?? ""} onChange={(e) => setTemplateForm((prev) => ({ ...prev, template_code: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Template name" value={templateForm.name ?? ""} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={templateForm.applies_to ?? "order"} onChange={(e) => setTemplateForm((prev) => ({ ...prev, applies_to: e.target.value }))}>
            <option value="order">Order</option>
            <option value="sample">Sample</option>
            <option value="style">Style</option>
          </select>
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60" type="submit" disabled={!canManage}>Create</button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <select className="rounded border px-3 py-2 text-sm" value={selectedTemplateId ?? ""} onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select template</option>
            {templates.map((row) => <option key={row.id} value={row.id}>{row.template_code} - {row.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Add Template Task</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-6" onSubmit={addTask}>
          <input className="rounded border px-3 py-2 text-sm" type="number" min={1} value={taskForm.seq_no} onChange={(e) => setTaskForm((prev) => ({ ...prev, seq_no: Number(e.target.value) }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Task name" value={taskForm.task_name} onChange={(e) => setTaskForm((prev) => ({ ...prev, task_name: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Department" value={taskForm.department ?? ""} onChange={(e) => setTaskForm((prev) => ({ ...prev, department: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" type="number" value={taskForm.offset_days ?? 0} onChange={(e) => setTaskForm((prev) => ({ ...prev, offset_days: Number(e.target.value) }))} />
          <input className="rounded border px-3 py-2 text-sm" type="number" min={1} value={taskForm.duration_days ?? 1} onChange={(e) => setTaskForm((prev) => ({ ...prev, duration_days: Number(e.target.value) }))} />
          <button className="rounded border px-3 py-2 text-sm disabled:opacity-60" type="submit" disabled={!selectedTemplateId || !canManage}>Add Task</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-3 py-2">Seq</th><th className="px-3 py-2">Task</th><th className="px-3 py-2">Department</th><th className="px-3 py-2">Offset</th><th className="px-3 py-2">Duration</th></tr>
          </thead>
          <tbody>
            {tasks.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.seq_no}</td>
                <td className="px-3 py-2">{row.task_name}</td>
                <td className="px-3 py-2">{row.department ?? "-"}</td>
                <td className="px-3 py-2">{row.offset_days}</td>
                <td className="px-3 py-2">{row.duration_days}</td>
              </tr>
            ))}
            {tasks.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={5}>No tasks for selected template.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
