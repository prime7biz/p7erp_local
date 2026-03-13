import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeCreate,
  type HrEmployeeResponse,
  type HrEmployeeUpdate,
} from "@/api/client";

export function HrEmployeesPage() {
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [employees, setEmployees] = useState<HrEmployeeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployeeResponse | null>(null);
  const [form, setForm] = useState<HrEmployeeCreate>({
    employee_code: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    department_id: null,
    designation_id: null,
    joining_date: "",
  });

  const departmentMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const designationMap = useMemo(() => new Map(designations.map((d) => [d.id, d.title])), [designations]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [depRows, desRows, empRows] = await Promise.all([
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
        api.listHrEmployees({ active_only: showInactive ? false : true, search: search || undefined }),
      ]);
      setDepartments(depRows);
      setDesignations(desRows);
      setEmployees(empRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [showInactive, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      employee_code: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      department_id: null,
      designation_id: null,
      joining_date: "",
    });
    setModalOpen(true);
  };

  const openEdit = (row: HrEmployeeResponse) => {
    setEditing(row);
    setForm({
      employee_code: row.employee_code,
      first_name: row.first_name,
      last_name: row.last_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      department_id: row.department_id,
      designation_id: row.designation_id,
      joining_date: row.joining_date ?? "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employee_code?.trim() || !form.first_name?.trim()) return;
    setError("");
    try {
      if (editing) {
        const payload: HrEmployeeUpdate = {
          employee_code: form.employee_code,
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          department_id: form.department_id ?? null,
          designation_id: form.designation_id ?? null,
          joining_date: form.joining_date || null,
        };
        await api.updateHrEmployee(editing.id, payload);
      } else {
        await api.createHrEmployee({
          employee_code: form.employee_code,
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          department_id: form.department_id ?? null,
          designation_id: form.designation_id ?? null,
          joining_date: form.joining_date || null,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Employees</h1>
          <p className="text-sm text-gray-500">Manage employee records for HR master data.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Search by code/name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Add employee
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No employees found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Designation</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {employees.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.employee_code}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{[row.first_name, row.last_name].filter(Boolean).join(" ")}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.department_id ? departmentMap.get(row.department_id) ?? "Unknown" : "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.designation_id ? designationMap.get(row.designation_id) ?? "Unknown" : "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        to={`/app/hr/employees/${row.id}`}
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Edit
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
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">{editing ? "Edit employee" : "Add employee"}</h2>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Employee code"
                value={form.employee_code}
                onChange={(e) => setForm((prev) => ({ ...prev, employee_code: e.target.value }))}
                required
              />
              <input
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
              <input
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Last name"
                value={form.last_name ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
              <input
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Email"
                value={form.email ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Phone"
                value={form.phone ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <select
                className="rounded border border-gray-300 px-3 py-2 text-sm"
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
              <select
                className="rounded border border-gray-300 px-3 py-2 text-sm"
                value={form.designation_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, designation_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No designation</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.title}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
                value={form.joining_date ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, joining_date: e.target.value }))}
              />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
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
