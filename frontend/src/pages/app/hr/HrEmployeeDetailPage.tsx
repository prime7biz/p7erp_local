import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeResponse,
  type HrEmployeeUpdate,
} from "@/api/client";

export function HrEmployeeDetailPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const employeeIdNum = Number(employeeId);

  const [employee, setEmployee] = useState<HrEmployeeResponse | null>(null);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<HrEmployeeUpdate>({});

  const designationOptions = useMemo(() => {
    if (!form.department_id) return designations;
    return designations.filter((d) => !d.department_id || d.department_id === form.department_id);
  }, [designations, form.department_id]);

  const load = async () => {
    if (!Number.isFinite(employeeIdNum) || employeeIdNum <= 0) {
      setError("Invalid employee id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [row, depRows, desRows] = await Promise.all([
        api.getHrEmployee(employeeIdNum),
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
      ]);
      setEmployee(row);
      setDepartments(depRows);
      setDesignations(desRows);
      setForm({
        employee_code: row.employee_code,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        marital_status: row.marital_status,
        blood_group: row.blood_group,
        emergency_contact_name: row.emergency_contact_name,
        emergency_contact_phone: row.emergency_contact_phone,
        address_line: row.address_line,
        city: row.city,
        country: row.country,
        national_id: row.national_id,
        employment_type: row.employment_type,
        confirmation_date: row.confirmation_date,
        exit_date: row.exit_date,
        department_id: row.department_id,
        designation_id: row.designation_id,
        joining_date: row.joining_date,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [employeeId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateHrEmployee(employee.id, {
        employee_code: form.employee_code?.trim(),
        first_name: form.first_name?.trim(),
        last_name: form.last_name?.trim() || null,
        email: form.email || null,
        phone: form.phone || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender?.trim() || null,
        marital_status: form.marital_status?.trim() || null,
        blood_group: form.blood_group?.trim() || null,
        emergency_contact_name: form.emergency_contact_name?.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone?.trim() || null,
        address_line: form.address_line?.trim() || null,
        city: form.city?.trim() || null,
        country: form.country?.trim() || null,
        national_id: form.national_id?.trim() || null,
        employment_type: form.employment_type?.trim() || null,
        confirmation_date: form.confirmation_date || null,
        exit_date: form.exit_date || null,
        department_id: form.department_id ?? null,
        designation_id: form.designation_id ?? null,
        joining_date: form.joining_date || null,
      });
      setEmployee(updated);
      setSuccess("Employee updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!employee) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = employee.is_active
        ? await api.deactivateHrEmployee(employee.id)
        : await api.activateHrEmployee(employee.id);
      setEmployee(updated);
      setForm((prev) => ({ ...prev }));
      setSuccess(updated.is_active ? "Employee activated." : "Employee deactivated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">Loading employee...</div>;
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Employee not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/hr/employees")}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Back to employees
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to="/app/hr/employees" className="text-sm text-primary hover:underline">
            Back to employees
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Employee Detail</h1>
          <p className="text-sm text-gray-500">
            {employee.employee_code} - {[employee.first_name, employee.last_name].filter(Boolean).join(" ")}
          </p>
          <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={toggleActive}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60"
        >
          {employee.is_active ? "Deactivate" : "Activate"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>}

      <form onSubmit={save} className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Employee code **"
          value={form.employee_code ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, employee_code: e.target.value }))}
          required
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="First name **"
          value={form.first_name ?? ""}
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
        <input
          type="date"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.date_of_birth ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, date_of_birth: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Gender"
          value={form.gender ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Marital status"
          value={form.marital_status ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, marital_status: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Blood group"
          value={form.blood_group ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, blood_group: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Emergency contact name"
          value={form.emergency_contact_name ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, emergency_contact_name: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Emergency contact phone"
          value={form.emergency_contact_phone ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, emergency_contact_phone: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Address"
          value={form.address_line ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, address_line: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="City"
          value={form.city ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Country"
          value={form.country ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="National ID"
          value={form.national_id ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, national_id: e.target.value }))}
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Employment type"
          value={form.employment_type ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, employment_type: e.target.value }))}
        />
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.department_id ?? ""}
          onChange={(e) =>
            setForm((prev) => ({
              ...prev,
              department_id: e.target.value ? Number(e.target.value) : null,
              designation_id: null,
            }))
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
          {designationOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} - {d.title}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.joining_date ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, joining_date: e.target.value }))}
        />
        <input
          type="date"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={form.confirmation_date ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, confirmation_date: e.target.value }))}
        />
        <input
          type="date"
          className="rounded border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          value={form.exit_date ?? ""}
          onChange={(e) => setForm((prev) => ({ ...prev, exit_date: e.target.value }))}
        />
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
