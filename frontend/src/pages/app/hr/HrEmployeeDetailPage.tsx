import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeDocumentCreate,
  type HrEmployeeResponse,
  type HrEmployeeStatusHistoryCreate,
  type HrEmployeeUpdate,
  type HrSectionResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

type Tab = "personal" | "job" | "documents" | "history" | "salary" | "production";

const PREFIX = "/app/hr";
const CAT_OPTS = ["WORKER", "STAFF", "MANAGEMENT"] as const;

export function HrEmployeeDetailPage() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const employeeIdNum = Number(employeeId);

  const [tab, setTab] = useState<Tab>("personal");
  const [employee, setEmployee] = useState<HrEmployeeResponse | null>(null);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [sections, setSections] = useState<HrSectionResponse[]>([]);
  const [managers, setManagers] = useState<HrEmployeeResponse[]>([]);
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof api.listHrEmployeeDocuments>>>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.listHrEmployeeStatusHistory>>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<HrEmployeeUpdate>({});

  const [docForm, setDocForm] = useState<HrEmployeeDocumentCreate>({
    document_type: "NID",
    document_number: "",
    issue_date: "",
    expiry_date: "",
    notes: "",
  });

  const [histForm, setHistForm] = useState<HrEmployeeStatusHistoryCreate>({
    status: "ACTIVE",
    effective_date: "",
    remarks: "",
  });

  const [prodProfile, setProdProfile] = useState<Awaited<ReturnType<typeof api.getEmployeeProductionProfile>> | null>(null);

  const designationOptions = useMemo(() => {
    if (!form.department_id) return designations;
    return designations.filter((d) => !d.department_id || d.department_id === form.department_id);
  }, [designations, form.department_id]);

  const loadCore = useCallback(async () => {
    if (!Number.isFinite(employeeIdNum) || employeeIdNum <= 0) {
      setError("Invalid employee id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [row, depRows, desRows, secRows, empPick] = await Promise.all([
        api.getHrEmployee(employeeIdNum),
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
        api.listHrSections({ active_only: false }),
        api.listHrEmployees({ active_only: true }),
      ]);
      setEmployee(row);
      setDepartments(depRows);
      setDesignations(desRows);
      setSections(secRows);
      setManagers(empPick.filter((e) => e.id !== row.id));
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
        section_id: row.section_id,
        employee_category: row.employee_category,
        reporting_manager_id: row.reporting_manager_id,
        joining_date: row.joining_date,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeIdNum]);

  const loadDocs = useCallback(async () => {
    if (!employee) return;
    try {
      setDocuments(await api.listHrEmployeeDocuments(employee.id));
    } catch {
      setDocuments([]);
    }
  }, [employee]);

  useEffect(() => {
    if (tab !== "production" || !employee) return;
    void (async () => {
      try {
        setProdProfile(await api.getEmployeeProductionProfile(employee.id, 30));
      } catch {
        setProdProfile(null);
      }
    })();
  }, [tab, employee]);

  const loadHistory = useCallback(async () => {
    if (!employee) return;
    try {
      setHistory(await api.listHrEmployeeStatusHistory(employee.id));
    } catch {
      setHistory([]);
    }
  }, [employee]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (employee && (tab === "documents" || tab === "history")) {
      void loadDocs();
      void loadHistory();
    }
  }, [employee, tab, loadDocs, loadHistory]);

  const saveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateHrEmployee(employee.id, {
        employee_code: form.employee_code?.trim(),
        department_id: form.department_id ?? null,
        designation_id: form.designation_id ?? null,
        section_id: form.section_id ?? null,
        employee_category: form.employee_category ?? null,
        reporting_manager_id: form.reporting_manager_id ?? null,
        employment_type: form.employment_type?.trim() || null,
        joining_date: form.joining_date || null,
        confirmation_date: form.confirmation_date || null,
        exit_date: form.exit_date || null,
      });
      setEmployee(updated);
      setSuccess("Job details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const savePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateHrEmployee(employee.id, {
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
      });
      setEmployee(updated);
      setSuccess("Personal details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setSaving(true);
    setError("");
    try {
      await api.createHrEmployeeDocument(employee.id, {
        document_type: docForm.document_type.trim(),
        document_number: docForm.document_number?.trim() || null,
        issue_date: docForm.issue_date || null,
        expiry_date: docForm.expiry_date || null,
        notes: docForm.notes?.trim() || null,
      });
      setDocForm({ document_type: "NID", document_number: "", issue_date: "", expiry_date: "", notes: "" });
      await loadDocs();
      setSuccess("Document added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const addStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !histForm.effective_date) return;
    setSaving(true);
    setError("");
    try {
      await api.createHrEmployeeStatusHistory(employee.id, {
        status: histForm.status.trim(),
        effective_date: histForm.effective_date,
        remarks: histForm.remarks?.trim() || null,
      });
      setHistForm({ status: "ACTIVE", effective_date: "", remarks: "" });
      await loadHistory();
      setSuccess("Status history added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
      const updated = employee.is_active ? await api.deactivateHrEmployee(employee.id) : await api.activateHrEmployee(employee.id);
      setEmployee(updated);
      setSuccess(updated.is_active ? "Employee activated." : "Employee deactivated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">Loading employee...</div>;
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "Employee not found."}
        </div>
        <button type="button" onClick={() => navigate("/app/hr/employees")} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
          Back to employees
        </button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "personal", label: "Personal" },
    { id: "job", label: "Job" },
    { id: "documents", label: "Documents" },
    { id: "history", label: "Status history" },
    { id: "production", label: "Production" },
    { id: "salary", label: "Salary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <HrPageHeader
          title={[employee.first_name, employee.last_name].filter(Boolean).join(" ") || "Employee"}
          description={`${employee.employee_code} · ${employee.is_active ? "Active" : "Inactive"}`}
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Employees", href: `${PREFIX}/employees` }, { label: employee.employee_code }]}
        />
        <button
          type="button"
          disabled={saving}
          onClick={toggleActive}
          className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary disabled:opacity-60"
        >
          {employee.is_active ? "Deactivate" : "Activate"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}
      {success && <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">{success}</div>}

      {tab === "personal" && (
        <form onSubmit={savePersonal} className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="First name" value={form.first_name ?? ""} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} required />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Last name" value={form.last_name ?? ""} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Email" value={form.email ?? ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Phone" value={form.phone ?? ""} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <input type="date" className="rounded border px-3 py-2 text-sm" value={form.date_of_birth ?? ""} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Gender" value={form.gender ?? ""} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Marital status" value={form.marital_status ?? ""} onChange={(e) => setForm((p) => ({ ...p, marital_status: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Blood group" value={form.blood_group ?? ""} onChange={(e) => setForm((p) => ({ ...p, blood_group: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Emergency contact name" value={form.emergency_contact_name ?? ""} onChange={(e) => setForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Emergency contact phone" value={form.emergency_contact_phone ?? ""} onChange={(e) => setForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))} />
          <input className="sm:col-span-2 rounded border px-3 py-2 text-sm" placeholder="Address" value={form.address_line ?? ""} onChange={(e) => setForm((p) => ({ ...p, address_line: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="City" value={form.city ?? ""} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Country" value={form.country ?? ""} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} />
          <input className="sm:col-span-2 rounded border px-3 py-2 text-sm" placeholder="National ID" value={form.national_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))} />
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save personal"}
            </button>
          </div>
        </form>
      )}

      {tab === "job" && (
        <form onSubmit={saveJob} className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Employee code" value={form.employee_code ?? ""} onChange={(e) => setForm((p) => ({ ...p, employee_code: e.target.value }))} required />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Employment type" value={form.employment_type ?? ""} onChange={(e) => setForm((p) => ({ ...p, employment_type: e.target.value }))} />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.department_id ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, department_id: e.target.value ? Number(e.target.value) : null, designation_id: null }))}
          >
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} - {d.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.designation_id ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, designation_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">No designation</option>
            {designationOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} - {d.title}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.section_id ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, section_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">No section / line</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name} ({s.section_type})
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.employee_category ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, employee_category: e.target.value || null }))}
          >
            <option value="">Category</option>
            {CAT_OPTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="sm:col-span-2 rounded border px-3 py-2 text-sm"
            value={form.reporting_manager_id ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, reporting_manager_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Reporting manager</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.employee_code} — {m.first_name} {m.last_name ?? ""}
              </option>
            ))}
          </select>
          <input type="date" className="rounded border px-3 py-2 text-sm" value={form.joining_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, joining_date: e.target.value }))} />
          <input type="date" className="rounded border px-3 py-2 text-sm" value={form.confirmation_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, confirmation_date: e.target.value }))} />
          <input type="date" className="sm:col-span-2 rounded border px-3 py-2 text-sm" value={form.exit_date ?? ""} onChange={(e) => setForm((p) => ({ ...p, exit_date: e.target.value }))} />
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save job"}
            </button>
          </div>
        </form>
      )}

      {tab === "documents" && (
        <div className="space-y-4">
          <form onSubmit={addDocument} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-2 sm:grid-cols-2">
            <input className="rounded border px-2 py-1 text-sm" placeholder="Document type" value={docForm.document_type} onChange={(e) => setDocForm((p) => ({ ...p, document_type: e.target.value }))} />
            <input className="rounded border px-2 py-1 text-sm" placeholder="Document number" value={docForm.document_number ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, document_number: e.target.value }))} />
            <input type="date" className="rounded border px-2 py-1 text-sm" value={docForm.issue_date ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, issue_date: e.target.value }))} />
            <input type="date" className="rounded border px-2 py-1 text-sm" value={docForm.expiry_date ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, expiry_date: e.target.value }))} />
            <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Notes" value={docForm.notes ?? ""} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} />
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
                Add document record
              </button>
            </div>
          </form>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Number</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-4 py-2">{d.document_type}</td>
                    <td className="px-4 py-2">{d.document_number ?? "—"}</td>
                    <td className="px-4 py-2">{d.expiry_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          <form onSubmit={addStatus} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-2 sm:grid-cols-2">
            <input className="rounded border px-2 py-1 text-sm" placeholder="Status label" value={histForm.status} onChange={(e) => setHistForm((p) => ({ ...p, status: e.target.value }))} required />
            <input type="date" className="rounded border px-2 py-1 text-sm" value={histForm.effective_date} onChange={(e) => setHistForm((p) => ({ ...p, effective_date: e.target.value }))} required />
            <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Remarks" value={histForm.remarks ?? ""} onChange={(e) => setHistForm((p) => ({ ...p, remarks: e.target.value }))} />
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
                Add status change
              </button>
            </div>
          </form>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase">Effective</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="px-4 py-2">{h.effective_date}</td>
                    <td className="px-4 py-2">{h.status}</td>
                    <td className="px-4 py-2">{h.remarks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "production" && (
        <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4 text-sm">
          <p className="font-medium text-text-primary">Production profile</p>
          {!prodProfile ? (
            <p className="text-text-secondary">Loading…</p>
          ) : (
            <>
              <div>
                <p className="text-xs uppercase text-text-muted">Line assignment</p>
                {prodProfile.line_assignment ? (
                  <p>
                    {prodProfile.line_assignment.line_code} (last crew date {prodProfile.line_assignment.last_date})
                  </p>
                ) : (
                  <p className="text-text-secondary">No recent line crew assignment.</p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase text-text-muted">Skills</p>
                {prodProfile.skills.length === 0 ? (
                  <p className="text-text-secondary">No IE skills recorded.</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {prodProfile.skills.map((s) => (
                      <li key={`${s.operation_code}-${s.skill_level}`}>
                        {s.operation_code} — {s.name} ({s.skill_level})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs uppercase text-text-muted">Attendance trend (30d)</p>
                <p className="text-text-secondary">{prodProfile.attendance_trend.length} days with records</p>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "salary" && (
        <div className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          <p>Salary structure and payroll assignment are managed under Payroll → Salary structures and Runs.</p>
          <p className="mt-2">
            <Link className="text-brand-primary hover:underline" to={`${PREFIX}/payroll/payslips`}>
              Open payroll payslips
            </Link>{" "}
            and filter by employee in the list.
          </p>
        </div>
      )}

      <Link to="/app/hr/employees" className="inline-block text-sm text-brand-primary hover:underline">
        ← Back to employees
      </Link>
    </div>
  );
}
