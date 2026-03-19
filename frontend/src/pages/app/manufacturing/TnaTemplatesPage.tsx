import { useCallback, useEffect, useRef, useState } from "react";

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

  const selectedTemplateIdRef = useRef<number | null>(null);
  selectedTemplateIdRef.current = selectedTemplateId;

  const loadTasks = useCallback(async (templateId: number) => {
    const rows = await api.listMfgTnaTemplateTasks(templateId);
    setTasks(rows);
  }, []);

  const loadTemplates = useCallback(async () => {
    const rows = await api.listMfgTnaTemplates();
    setTemplates(rows);
    setSelectedTemplateId((prev) => (!prev && rows[0] ? rows[0].id : prev));
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [, userRows] = await Promise.all([loadTemplates(), api.listUsers()]);
      setUsers(userRows.filter((row) => row.is_active));
      const tid = selectedTemplateIdRef.current;
      if (tid) await loadTasks(tid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load TNA templates");
    }
  }, [loadTemplates, loadTasks]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedTemplateId) {
      void loadTasks(selectedTemplateId);
    } else {
      setTasks([]);
    }
  }, [selectedTemplateId, loadTasks]);

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
        <h1 className="text-2xl font-semibold text-text-primary">TNA Templates</h1>
        <p className="text-sm text-text-muted">Define reusable task templates for order/sample TNA planning.</p>
      </div>
      {!canManage ? (
        <div className="rounded border border-status-warning/20 bg-status-warning-subtle p-3 text-sm text-status-warning-foreground">
          You have view-only access. Supervisor/Manager/Admin role is required for template changes.
        </div>
      ) : null}
      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Create Template</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={createTemplate}>
          <input className="rounded border border-border px-3 py-2 text-sm" placeholder="Optional code" value={templateForm.template_code ?? ""} onChange={(e) => setTemplateForm((prev) => ({ ...prev, template_code: e.target.value }))} />
          <input className="rounded border border-border px-3 py-2 text-sm" placeholder="Template name" value={templateForm.name ?? ""} onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))} />
          <select className="rounded border border-border px-3 py-2 text-sm" value={templateForm.applies_to ?? "order"} onChange={(e) => setTemplateForm((prev) => ({ ...prev, applies_to: e.target.value }))}>
            <option value="order">Order</option>
            <option value="sample">Sample</option>
            <option value="style">Style</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 disabled:opacity-60"
            disabled={!canManage}
          >
            Create
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <select className="rounded border border-border px-3 py-2 text-sm" value={selectedTemplateId ?? ""} onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select template</option>
            {templates.map((row) => <option key={row.id} value={row.id}>{row.template_code} - {row.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Add Template Task</h2>
        <form className="grid grid-cols-1 gap-2 md:grid-cols-6" onSubmit={addTask}>
          <input className="rounded border border-border px-3 py-2 text-sm" type="number" min={1} value={taskForm.seq_no} onChange={(e) => setTaskForm((prev) => ({ ...prev, seq_no: Number(e.target.value) }))} />
          <input className="rounded border border-border px-3 py-2 text-sm" placeholder="Task name" value={taskForm.task_name} onChange={(e) => setTaskForm((prev) => ({ ...prev, task_name: e.target.value }))} />
          <input className="rounded border border-border px-3 py-2 text-sm" placeholder="Department" value={taskForm.department ?? ""} onChange={(e) => setTaskForm((prev) => ({ ...prev, department: e.target.value }))} />
          <input className="rounded border border-border px-3 py-2 text-sm" type="number" value={taskForm.offset_days ?? 0} onChange={(e) => setTaskForm((prev) => ({ ...prev, offset_days: Number(e.target.value) }))} />
          <input className="rounded border border-border px-3 py-2 text-sm" type="number" min={1} value={taskForm.duration_days ?? 1} onChange={(e) => setTaskForm((prev) => ({ ...prev, duration_days: Number(e.target.value) }))} />
          <button className="rounded border border-border px-3 py-2 text-sm disabled:opacity-60" type="submit" disabled={!selectedTemplateId || !canManage}>Add Task</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
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
            {tasks.length === 0 ? <tr><td className="px-3 py-8 text-center text-text-muted" colSpan={5}>No tasks for selected template.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
