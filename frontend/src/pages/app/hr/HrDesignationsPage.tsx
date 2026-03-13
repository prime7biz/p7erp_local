import { useEffect, useMemo, useState } from "react";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationCreate,
  type HrDesignationResponse,
  type HrDesignationUpdate,
} from "@/api/client";

export function HrDesignationsPage() {
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrDesignationResponse | null>(null);
  const [form, setForm] = useState<HrDesignationCreate>({
    code: "",
    title: "",
    department_id: null,
    is_active: true,
  });

  const departmentMap = useMemo(
    () => new Map(departments.map((d) => [d.id, `${d.code} - ${d.name}`])),
    [departments]
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [depRows, desRows] = await Promise.all([
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
      ]);
      setDepartments(depRows);
      setDesignations(desRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load designations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", title: "", department_id: null, is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: HrDesignationResponse) => {
    setEditing(row);
    setForm({
      code: row.code,
      title: row.title,
      department_id: row.department_id,
      is_active: row.is_active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm({ code: "", title: "", department_id: null, is_active: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim()) return;
    setError("");
    try {
      if (editing) {
        const payload: HrDesignationUpdate = { ...form };
        await api.updateHrDesignation(editing.id, payload);
      } else {
        await api.createHrDesignation(form);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onDelete = async (row: HrDesignationResponse) => {
    const ok = window.confirm(
      `Delete designation "${row.code} - ${row.title}"?\n\nIf employees are linked, deletion will be blocked.`
    );
    if (!ok) return;
    setError("");
    try {
      await api.deleteHrDesignation(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Designations</h1>
          <p className="text-sm text-gray-500">Manage designation/position masters and map to departments.</p>
          <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add designation
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading designations...</div>
        ) : designations.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No designations found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {designations.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.department_id ? departmentMap.get(row.department_id) ?? "Unknown" : "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{editing ? "Edit designation" : "Add designation"}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Designation code **"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                required
              />
              <input
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Designation name **"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
              <select
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={form.department_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, department_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
