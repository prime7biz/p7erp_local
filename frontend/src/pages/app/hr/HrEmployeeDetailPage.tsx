import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecordBreadcrumb } from "@/components/shell/recordBreadcrumb";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeResponse,
  type HrEmployeeUpdate,
  type HrSectionResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { EmployeeWorkspace } from "@/components/hr/workspace/EmployeeWorkspace";
import { AgeVerificationTab } from "@/components/hr/workspace/recordTabs/AgeVerificationTab";
import { DocumentsTab } from "@/components/hr/workspace/recordTabs/DocumentsTab";
import { IdentityTab } from "@/components/hr/workspace/recordTabs/IdentityTab";
import { MedicalRecordsTab } from "@/components/hr/workspace/recordTabs/MedicalRecordsTab";
import { ProductionTab } from "@/components/hr/workspace/recordTabs/ProductionTab";
import { downloadBlob } from "@/components/hr/workspace/recordTabs/shared";
import { StatusHistoryTab } from "@/components/hr/workspace/recordTabs/StatusHistoryTab";
import { useAuth } from "@/context/AuthContext";

type Tab = "personal" | "job" | "identity" | "documents" | "age" | "medical" | "history" | "salary" | "production";

const PREFIX = "/app/hr";
const CAT_OPTS = ["WORKER", "STAFF", "MANAGEMENT"] as const;

/** Employee view / edit. Tenants with `hr_onboarding_workspace_v2` get the unified workspace. */
export function HrEmployeeDetailPage() {
  const { me } = useAuth();
  if (me?.feature_flags?.hr_onboarding_workspace_v2 === true) return <EmployeeWorkspace mode="edit" />;
  return <LegacyEmployeeDetail />;
}

function LegacyEmployeeDetail() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const ageEnabled =
    me?.feature_flags?.age_verification_required === true ||
    me?.feature_flags?.compliance_tracking_enabled === true;
  const medicalEnabled = me?.feature_flags?.medical_certificate_tracking_enabled === true;
  const employeeIdNum = Number(employeeId);

  const [tab, setTab] = useState<Tab>("personal");
  const [employee, setEmployee] = useState<HrEmployeeResponse | null>(null);
  useRecordBreadcrumb(employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.employee_code : null);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [sections, setSections] = useState<HrSectionResponse[]>([]);
  const [managers, setManagers] = useState<HrEmployeeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<HrEmployeeUpdate>({});
  const [openDocActions, setOpenDocActions] = useState(false);
  const [docGenerating, setDocGenerating] = useState(false);

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
        birth_registration_no: row.birth_registration_no ?? null,
        employment_type: row.employment_type,
        confirmation_date: row.confirmation_date,
        exit_date: row.exit_date,
        department_id: row.department_id,
        designation_id: row.designation_id,
        section_id: row.section_id,
        employee_category: row.employee_category,
        reporting_manager_id: row.reporting_manager_id,
        attendance_device_pin: row.attendance_device_pin ?? null,
        joining_date: row.joining_date,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeIdNum]);

  const generateDocument = async (kind: "id-card" | "appointment-letter" | "age-cert") => {
    if (!employee) return;
    setDocGenerating(true);
    setOpenDocActions(false);
    setError("");
    try {
      const blob =
        kind === "id-card"
          ? await api.generateHrIdCard(employee.id)
          : kind === "appointment-letter"
            ? await api.generateHrAppointmentLetter(employee.id)
            : await api.generateHrAgeVerificationCert(employee.id);
      const ext = blob.type.includes("pdf") ? "pdf" : "bin";
      downloadBlob(blob, `${employee.employee_code}-${kind}.${ext}`);
      setSuccess("Document downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document generation failed");
    } finally {
      setDocGenerating(false);
    }
  };

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  const saveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateHrEmployee(employee.id, {
        department_id: form.department_id ?? null,
        designation_id: form.designation_id ?? null,
        section_id: form.section_id ?? null,
        employee_category: form.employee_category ?? null,
        reporting_manager_id: form.reporting_manager_id ?? null,
        attendance_device_pin: form.attendance_device_pin?.trim() || null,
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
        birth_registration_no: form.birth_registration_no?.trim() || null,
      });
      setEmployee(updated);
      setSuccess("Personal details saved.");
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
    { id: "identity", label: "Photo & biometrics" },
    { id: "documents", label: "Documents" },
    ...(ageEnabled ? [{ id: "age" as const, label: "Age verification" }] : []),
    ...(medicalEnabled ? [{ id: "medical" as const, label: "Medical records" }] : []),
    { id: "history", label: "Status history" },
    { id: "production", label: "Production" },
    { id: "salary", label: "Salary" },
  ];
  const tabProps = {
    employee,
    onError: (m: string) => {
      setSuccess("");
      setError(m);
    },
    onSuccess: (m: string) => {
      setError("");
      setSuccess(m);
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <HrPageHeader
          title={[employee.first_name, employee.last_name].filter(Boolean).join(" ") || "Employee"}
          description={`${employee.employee_code} · ${employee.is_active ? "Active" : "Inactive"}`}
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Employees", href: `${PREFIX}/employees` }, { label: employee.employee_code }]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              disabled={docGenerating}
              onClick={() => setOpenDocActions((v) => !v)}
              className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
            >
              {docGenerating ? "Generating..." : "Generate document"}
            </button>
            {openDocActions && (
              <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => void generateDocument("id-card")}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                >
                  ID card (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => void generateDocument("appointment-letter")}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                >
                  Appointment letter
                </button>
                <button
                  type="button"
                  onClick={() => void generateDocument("age-cert")}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                >
                  Age verification cert
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={toggleActive}
            className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary disabled:opacity-60"
          >
            {employee.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
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
          <input className="rounded border px-3 py-2 text-sm" placeholder="NID (10, 13 or 17 digits)" inputMode="numeric" aria-label="National ID" value={form.national_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Birth registration no. (17 digits)" inputMode="numeric" aria-label="Birth registration number" value={form.birth_registration_no ?? ""} onChange={(e) => setForm((p) => ({ ...p, birth_registration_no: e.target.value }))} />
          <p className="sm:col-span-2 text-xs text-text-muted">Bangladesh setup: a mobile number and either the NID or the birth registration number are required.</p>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Saving..." : "Save personal"}
            </button>
          </div>
        </form>
      )}

      {tab === "job" && (
        <form onSubmit={saveJob} className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm" aria-label="Employee number">
            <span className="font-medium text-text-primary">{employee.employee_code}</span>
            <span className="block text-xs text-text-muted">Permanent employee number, never reused</span>
          </div>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Employment type" value={form.employment_type ?? ""} onChange={(e) => setForm((p) => ({ ...p, employment_type: e.target.value }))} />
          <input
            className="rounded border px-3 py-2 text-sm"
            placeholder="Device PIN (attendance machine user no., if not the employee code)"
            title="Device PIN: the user number enrolled on the attendance machine. Leave empty when it is the employee code."
            maxLength={32}
            value={form.attendance_device_pin ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, attendance_device_pin: e.target.value }))}
          />
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

      {tab === "identity" && (
        <IdentityTab {...tabProps} onPhotoChanged={(hasPhoto) => setEmployee((p) => (p ? { ...p, has_photo: hasPhoto } : p))} />
      )}
      {tab === "documents" && <DocumentsTab {...tabProps} />}
      {tab === "age" && <AgeVerificationTab {...tabProps} />}
      {tab === "medical" && <MedicalRecordsTab {...tabProps} />}
      {tab === "history" && <StatusHistoryTab {...tabProps} />}
      {tab === "production" && <ProductionTab {...tabProps} />}

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
