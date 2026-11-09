/**
 * One employee screen for Add and View/Edit (tenant flag `hr_onboarding_workspace_v2`).
 *
 * - Create mode (/app/hr/employees/new): fill Personal and Employment & Salary (AI autofill on Personal),
 *   then "Create employee" calls POST /hr/onboarding once with a stable request id, so a retry or a
 *   double click never makes a second employee. Record tabs unlock after the save.
 * - Edit mode (/app/hr/employees/:id): every tab saves on its own. On Employment & Salary the
 *   employment/payment fields and a new salary period are two separate saves.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  api,
  type HrCompensationOptions,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrDocExtractionResponse,
  type HrEmployeeAccess,
  type HrEmployeeCompensationView,
  type HrEmployeeResponse,
  type HrOnboardingRequest,
  type HrOnboardingRun,
  type HrSectionResponse,
} from "@/api/client";
import { hrBangladeshApi } from "@/api/hrBangladesh";
import type { HrQuickAddRecord } from "@/components/hr/HrMasterQuickAddModal";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { useRecordBreadcrumb } from "@/components/shell/recordBreadcrumb";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { logApiError } from "@/utils/logApiError";
import { AiAutofillPanel, type AiConflict } from "./AiAutofillPanel";
import { ChecklistTab } from "./ChecklistTab";
import {
  addressesMatch,
  aiAutofillEnabled,
  buildOnboardingRequest,
  buildResumeSteps,
  buildTabUpdate,
  buildCompensation,
  CORE_TABS,
  EMPLOYMENT_KEYS,
  emptyEmployeeForm,
  emptySalaryForm,
  formFromEmployee,
  isDirty,
  isTabLocked,
  mergeExtraction,
  newRequestId,
  omittedCreateKeys,
  PERSONAL_KEYS,
  PRESENT_KEYS,
  previewableCompensation,
  resolveSalaryEffectiveDate,
  salaryBlocker,
  salaryFormFromSnapshot,
  syncPermanentAddress,
  updateSalary,
  type EmployeeFormState,
  type SalaryFormState,
  type WorkspaceMode,
  type WorkspaceTab,
} from "./employeeWorkspaceLogic";
import { JobTab } from "./JobTab";
import { NextStepsDialog } from "./NextStepsDialog";
import { PersonalTab } from "./PersonalTab";
import { AgeVerificationTab } from "./recordTabs/AgeVerificationTab";
import { DocumentsTab } from "./recordTabs/DocumentsTab";
import { IdentityTab } from "./recordTabs/IdentityTab";
import { MedicalRecordsTab } from "./recordTabs/MedicalRecordsTab";
import { ProductionTab } from "./recordTabs/ProductionTab";
import { downloadBlob } from "./recordTabs/shared";
import { StatusHistoryTab } from "./recordTabs/StatusHistoryTab";
import { SalaryTab, type SalaryStatus } from "./SalaryTab";
import { useCompensationPreview } from "./useCompensationPreview";
import { LEAVE_MESSAGE, useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

const PREFIX = "/app/hr";
const FIELD_LABELS: Partial<Record<keyof EmployeeFormState, string>> = {
  first_name: "First name", last_name: "Last name", email: "Email", phone: "Mobile", date_of_birth: "Date of birth",
  gender: "Gender", national_id: "NID", birth_registration_no: "Birth registration no.", father_name: "Father's name",
  mother_name: "Mother's name", present_address_line: "Present address", present_city: "City", present_country: "Country",
  joining_date: "Joining date", employment_type: "Employment type",
};

const NO_ACCESS: HrEmployeeAccess = {
  can_view_sensitive: false, can_manage_identity: false, can_manage_payroll: false, can_manage_gate_pass: false,
  can_generate_documents: false, can_view_compliance: false, can_manage_compliance: false, masked_fields: [],
};

export function EmployeeWorkspace({ mode }: { mode: WorkspaceMode }) {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const flags = me?.feature_flags;
  const ageEnabled = flags?.age_verification_required === true || flags?.compliance_tracking_enabled === true;
  const medicalEnabled = flags?.medical_certificate_tracking_enabled === true;
  const docGenEnabled = flags?.auto_document_generation_enabled === true;
  const employeeIdNum = Number(employeeId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState<HrEmployeeAccess>(NO_ACCESS);
  const [employee, setEmployee] = useState<HrEmployeeResponse | null>(null);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [sections, setSections] = useState<HrSectionResponse[]>([]);
  const [managers, setManagers] = useState<HrEmployeeResponse[]>([]);
  const [nextCode, setNextCode] = useState<string | null>(null);
  const [compOptions, setCompOptions] = useState<HrCompensationOptions | null>(null);
  const [compensation, setCompensation] = useState<HrEmployeeCompensationView | null>(null);

  const [tab, setTab] = useState<WorkspaceTab>("personal");
  const [form, setForm] = useState<EmployeeFormState>(emptyEmployeeForm);
  const [initialForm, setInitialForm] = useState<EmployeeFormState>(emptyEmployeeForm);
  const [salary, setSalary] = useState<SalaryFormState>(emptySalaryForm);
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryStatus, setSalaryStatus] = useState<SalaryStatus>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const creating = useRef(false);
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [issueTempGatePass, setIssueTempGatePass] = useState(false);
  const touched = useRef(new Set<string>());
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(new Set());
  const [conflicts, setConflicts] = useState<AiConflict[]>([]);
  const [aiMessage, setAiMessage] = useState("");

  const requestId = useRef(newRequestId());
  const lastRequest = useRef<HrOnboardingRequest | null>(null);
  const [run, setRun] = useState<HrOnboardingRun | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [docMenu, setDocMenu] = useState(false);
  const [docBusy, setDocBusy] = useState(false);

  useRecordBreadcrumb(
    mode === "edit" && employee ? [employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.employee_code : null,
  );

  const masked = useMemo(
    () => new Set<string>(employee?.masked_fields ?? access.masked_fields ?? []),
    [employee?.masked_fields, access.masked_fields],
  );
  const dirty = isDirty(initialForm, form) || salary.enabled;

  const savedJoiningDate = mode === "edit" ? initialForm.joining_date : form.joining_date;
  const effective = resolveSalaryEffectiveDate(salary, mode, form.joining_date, compOptions?.as_of ?? null);
  const preview = useCompensationPreview(
    previewableCompensation(salary, effective.date),
    access.can_manage_payroll && salary.enabled,
    previewNonce,
  );
  const salaryBlock = salaryBlocker(salary, effective.date, preview, {
    mode,
    joiningDate: savedJoiningDate,
    joiningDateUnsaved: mode === "edit" && form.joining_date !== initialForm.joining_date,
  });
  const changeSalary = useCallback((patch: Partial<SalaryFormState>) => {
    setSalaryStatus(null);
    setSalary((prev) => updateSalary(prev, patch));
  }, []);

  const showError = useCallback((m: string) => {
    setSuccess("");
    setError(m);
  }, []);
  const showSuccess = useCallback((m: string) => {
    setError("");
    setSuccess(m);
  }, []);

  const loadAll = useCallback(async () => {
    if (mode === "edit" && (!Number.isFinite(employeeIdNum) || employeeIdNum <= 0)) {
      setError("Invalid employee id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [acc, deps, desigs, secs, people] = await Promise.all([
        api.getHrEmployeeAccess(),
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
        api.listHrSections({ active_only: false }),
        api.listHrEmployees({ active_only: true }),
      ]);
      setAccess(acc);
      setDepartments(deps);
      setDesignations(desigs);
      setSections(secs);
      if (acc.can_manage_payroll) {
        api.getHrCompensationOptions().then(setCompOptions).catch((e) => logApiError("EmployeeWorkspace.compOptions", e));
      }
      if (mode === "edit") {
        const row = await api.getHrEmployee(employeeIdNum);
        setEmployee(row);
        setManagers(people.filter((p) => p.id !== row.id));
        const f = formFromEmployee(row);
        setForm(f);
        setInitialForm(f);
        setSameAsPresent(addressesMatch(f));
        if (acc.can_manage_payroll) {
          api.getHrEmployeeCompensation(row.id).then(setCompensation).catch((e) => logApiError("EmployeeWorkspace.compensation", e));
        }
      } else {
        setManagers(people);
        hrBangladeshApi
          .employeeNumberFormat()
          .then((r) => setNextCode(r.next_code))
          .catch((e) => logApiError("EmployeeWorkspace.nextCode", e));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [mode, employeeIdNum]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useUnsavedChangesGuard(dirty && !run);

  const setField = useCallback(
    <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) => {
      touched.current.add(key);
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        return sameAsPresent && (PRESENT_KEYS as readonly string[]).includes(key) ? syncPermanentAddress(next) : next;
      });
    },
    [sameAsPresent],
  );

  const onSameAsPresentChange = (value: boolean) => {
    setSameAsPresent(value);
    if (value) setForm((prev) => syncPermanentAddress(prev));
  };

  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  const onExtracted = useCallback((title: string, res: HrDocExtractionResponse) => {
    const merged = mergeExtraction(formRef.current, res.fields, touched.current);
    setForm(merged.form);
    setHighlight(new Set(merged.filled));
    window.setTimeout(() => setHighlight(new Set()), 2500);
    setConflicts((old) => [
      ...old.filter((c) => !merged.conflicts.some((n) => n.field === c.field)),
      ...merged.conflicts.map((c) => ({ ...c, label: FIELD_LABELS[c.field] ?? String(c.field) })),
    ]);
    setAiMessage(
      merged.filled.length
        ? `${title}: filled ${merged.filled.length} field${merged.filled.length === 1 ? "" : "s"} — please check them.`
        : `${title}: nothing new to fill.`,
    );
  }, []);

  const onMasterCreated = (kind: "department" | "designation" | "section", record: HrQuickAddRecord) => {
    if (kind === "department") setDepartments((p) => (p.some((d) => d.id === record.id) ? p : [...p, record as HrDepartmentResponse]));
    if (kind === "designation") setDesignations((p) => (p.some((d) => d.id === record.id) ? p : [...p, record as HrDesignationResponse]));
    if (kind === "section") setSections((p) => (p.some((d) => d.id === record.id) ? p : [...p, record as HrSectionResponse]));
  };

  // --- create -----------------------------------------------------------------------------------------

  const createEmployee = async () => {
    if (creating.current) return;
    if (!form.first_name.trim()) {
      setTab("personal");
      showError("First name is required.");
      return;
    }
    if (salary.enabled && salaryBlock) {
      setTab("employment");
      showError(`Salary set-up: ${salaryBlock}`);
      return;
    }
    creating.current = true;
    setSaving(true);
    setError("");
    try {
      const body = buildOnboardingRequest(
        requestId.current,
        form,
        salary,
        issueTempGatePass && access.can_manage_gate_pass,
        omittedCreateKeys(access),
        compOptions?.as_of ?? null,
      );
      lastRequest.current = body;
      const result = await api.startHrOnboarding(body);
      setRun(result);
      setInitialForm(form);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not create the employee");
    } finally {
      creating.current = false;
      setSaving(false);
    }
  };

  const retryFailed = async () => {
    if (!run || !lastRequest.current) return;
    setRetrying(true);
    try {
      setRun(await api.resumeHrOnboarding(run.request_id, buildResumeSteps(run, lastRequest.current)));
    } catch (e) {
      showError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  // --- edit -------------------------------------------------------------------------------------------

  const saveTab = async (keys: readonly (keyof EmployeeFormState)[], label: string) => {
    if (!employee) return;
    const body = buildTabUpdate(form, keys, employee.masked_fields ?? [], initialForm);
    if (Object.keys(body).length === 0) {
      showSuccess("No changes to save.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateHrEmployee(employee.id, body);
      setEmployee(updated);
      const saved = formFromEmployee(updated);
      const pick = (prev: EmployeeFormState) => ({ ...prev, ...Object.fromEntries(keys.map((k) => [k, saved[k]])) });
      // Only the saved card is refreshed, so unsaved edits elsewhere (including the salary form) survive.
      setForm(pick);
      setInitialForm(pick);
      showSuccess(`${label} saved.`);
      if ("joining_date" in body && access.can_manage_payroll) {
        // Salary dates are checked against the saved joining date, so re-read pay and re-check the preview.
        api
          .getHrEmployeeCompensation(updated.id)
          .then(setCompensation)
          .catch((e) => logApiError("EmployeeWorkspace.compensation", e));
        setPreviewNonce((n) => n + 1);
      }
    } catch (e) {
      showError(`${label} not saved: ${e instanceof Error ? e.message : "Update failed"}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSalary = async () => {
    if (!employee || salarySaving || salaryBlock) return;
    const body = buildCompensation(salary, effective.date);
    if (!body || !body.effective_from) return;
    setSalarySaving(true);
    setSalaryStatus(null);
    try {
      const view = await api.replaceHrEmployeeCompensation(employee.id, { ...body, effective_from: body.effective_from });
      setCompensation(view);
      setSalary(emptySalaryForm());
      setSalaryStatus({ kind: "success", text: `New salary saved from ${body.effective_from}.` });
    } catch (e) {
      setSalaryStatus({ kind: "error", text: `Salary not saved: ${e instanceof Error ? e.message : "Salary change failed"}` });
    } finally {
      setSalarySaving(false);
    }
  };

  const startSalaryChange = () => {
    setSalaryStatus(null);
    setSalary(salaryFormFromSnapshot(compensation?.snapshot));
  };
  const cancelSalaryChange = () => {
    setSalaryStatus(null);
    setSalary(emptySalaryForm());
  };

  const toggleActive = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      const updated = employee.is_active ? await api.deactivateHrEmployee(employee.id) : await api.activateHrEmployee(employee.id);
      setEmployee(updated);
      showSuccess(updated.is_active ? "Employee activated." : "Employee deactivated.");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  };

  const generate = async (kind: "id-card" | "appointment-letter" | "job-description" | "age-cert", reissue = false) => {
    if (!employee) return;
    setDocBusy(true);
    setDocMenu(false);
    try {
      const blob =
        kind === "id-card"
          ? await api.generateHrIdCard(employee.id)
          : kind === "appointment-letter"
            ? await api.generateHrAppointmentLetter(employee.id, { reissue })
            : kind === "job-description"
              ? await api.generateHrJobDescription(employee.id, { reissue })
              : await api.generateHrAgeVerificationCert(employee.id);
      downloadBlob(blob, `${employee.employee_code}-${kind}.pdf`);
      showSuccess(reissue ? "New version issued and downloaded." : "Document downloaded.");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Document generation failed");
    } finally {
      setDocBusy(false);
    }
  };

  const leave = () => {
    if (dirty && !run && !window.confirm(LEAVE_MESSAGE)) return;
    navigate(`${PREFIX}/employees`);
  };

  // --- render -----------------------------------------------------------------------------------------

  if (loading) {
    return <div className="rounded-lg border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">Loading…</div>;
  }
  if (mode === "edit" && !employee) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "Employee not found."}
        </div>
        <Link to={`${PREFIX}/employees`} className="text-sm text-brand-primary hover:underline">
          ← Back to employees
        </Link>
      </div>
    );
  }

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: "personal", label: "Personal" },
    { id: "employment", label: "Employment & Salary" },
    { id: "identity", label: "Photo & biometrics" },
    { id: "documents", label: "Documents" },
    ...(ageEnabled ? [{ id: "age" as const, label: "Age verification" }] : []),
    ...(medicalEnabled ? [{ id: "medical" as const, label: "Medical records" }] : []),
    { id: "history", label: "Status history" },
    { id: "production", label: "Production" },
    ...(access.can_view_compliance ? [{ id: "checklist" as const, label: "Checklist" }] : []),
  ];
  const coreIndex = CORE_TABS.indexOf(tab);
  const title =
    mode === "create" ? "Add employee" : [employee?.first_name, employee?.last_name].filter(Boolean).join(" ") || "Employee";
  const recordProps = employee ? { employee, onError: showError, onSuccess: showSuccess } : null;
  const canDocs = docGenEnabled && access.can_generate_documents;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <HrPageHeader
          title={title}
          description={
            mode === "create"
              ? "Fill Personal and Employment & Salary, then create. Photo, documents and checks open after the first save."
              : `${employee?.employee_code} · ${employee?.is_active ? "Active" : "Inactive"}`
          }
          breadcrumbs={[
            { label: "HR", href: PREFIX },
            { label: "Employees", href: `${PREFIX}/employees` },
            { label: mode === "create" ? "Add employee" : employee?.employee_code ?? "" },
          ]}
        />
        {mode === "edit" && employee && (
          <div className="flex flex-wrap items-center gap-2">
            {canDocs && (
              <div className="relative">
                <button
                  type="button"
                  disabled={docBusy}
                  onClick={() => setDocMenu((v) => !v)}
                  className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                >
                  {docBusy ? "Generating..." : "Generate document"}
                </button>
                {docMenu && (
                  <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                    {(
                      [
                        ["id-card", "ID card (PDF)", false],
                        ["appointment-letter", "Appointment letter", false],
                        ["appointment-letter", "Reissue appointment letter", true],
                        ["job-description", "Job description", false],
                        ["job-description", "Reissue job description", true],
                        ["age-cert", "Age verification cert", false],
                      ] as const
                    ).map(([kind, label, reissue]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => void generate(kind, reissue)}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={toggleActive}
              className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary disabled:opacity-60"
            >
              {employee.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        )}
      </div>

      <div className="-mx-1 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label="Employee sections">
        <div className="flex gap-2 whitespace-nowrap px-1">
          {tabs.map((t) => {
            const locked = isTabLocked(mode, t.id);
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-disabled={locked}
                disabled={locked}
                title={locked ? "Save employee first to unlock" : undefined}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium",
                  tab === t.id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted",
                  locked && "cursor-not-allowed opacity-50 hover:bg-surface-subtle",
                )}
              >
                {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {mode === "create" && (
        <p className="text-xs text-text-muted">
          Locked tabs open after you create the employee. {coreIndex >= 0 && `Core details ${coreIndex + 1} of ${CORE_TABS.length}.`}
        </p>
      )}

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground" role="alert">{error}</div>}
      {success && <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground" role="status">{success}</div>}

      {tab === "personal" && (
        <PersonalTab
          form={form}
          setField={setField}
          access={{ masked, canManageIdentity: access.can_manage_identity }}
          highlight={highlight}
          sameAsPresent={sameAsPresent}
          onSameAsPresentChange={onSameAsPresentChange}
          aiPanel={
            mode === "create" && aiAutofillEnabled(flags) ? (
              <AiAutofillPanel
                flags={flags}
                onExtracted={onExtracted}
                conflicts={conflicts}
                lastMessage={aiMessage}
                onUseAiValue={(c) => {
                  setForm((p) => ({ ...p, [c.field]: c.extracted }));
                  setConflicts((list) => list.filter((x) => x.field !== c.field));
                }}
                onKeepMine={(c) => setConflicts((list) => list.filter((x) => x.field !== c.field))}
              />
            ) : undefined
          }
        />
      )}
      {tab === "employment" && (
        <div className="space-y-4">
          <JobTab
            mode={mode}
            form={form}
            setField={setField}
            employeeCode={employee?.employee_code ?? null}
            nextCode={nextCode}
            departments={departments}
            designations={designations}
            sections={sections}
            managers={managers}
            onMasterCreated={onMasterCreated}
            highlight={highlight}
            issueTempGatePass={issueTempGatePass}
            onIssueTempGatePassChange={setIssueTempGatePass}
            canManageGatePass={access.can_manage_gate_pass}
          />
          <SalaryTab
            mode={mode}
            canManagePayroll={access.can_manage_payroll}
            options={compOptions}
            salary={salary}
            onSalaryChange={changeSalary}
            preview={preview}
            effective={effective}
            blocker={salaryBlock}
            form={form}
            setField={setField}
            masked={masked}
            current={compensation}
            onStartChange={mode === "edit" ? startSalaryChange : undefined}
            onCancelChange={mode === "edit" ? cancelSalaryChange : undefined}
            onSaveSalary={mode === "edit" ? () => void saveSalary() : undefined}
            savingSalary={salarySaving}
            salaryStatus={salaryStatus}
          />
        </div>
      )}
      {recordProps && tab === "identity" && (
        <IdentityTab {...recordProps} onPhotoChanged={(hasPhoto) => setEmployee((p) => (p ? { ...p, has_photo: hasPhoto } : p))} />
      )}
      {recordProps && tab === "documents" && <DocumentsTab {...recordProps} />}
      {recordProps && tab === "age" && <AgeVerificationTab {...recordProps} />}
      {recordProps && tab === "medical" && <MedicalRecordsTab {...recordProps} />}
      {recordProps && tab === "history" && <StatusHistoryTab {...recordProps} />}
      {recordProps && tab === "production" && <ProductionTab {...recordProps} />}
      {employee && tab === "checklist" && (
        <ChecklistTab
          employeeId={employee.id}
          canManageCompliance={access.can_manage_compliance}
          onGoToTab={setTab}
          onError={showError}
          onSuccess={showSuccess}
        />
      )}

      <div className="sticky bottom-0 z-20 -mx-2 rounded-t-xl border-t border-border bg-surface-raised/95 px-3 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={leave} className="text-sm text-text-secondary hover:underline">
            {mode === "create" ? "Cancel" : "← Back to employees"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "create" ? (
              <>
                {coreIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setTab(CORE_TABS[coreIndex - 1] ?? "personal")}
                    className="inline-flex items-center gap-1 rounded border border-border-strong px-3 py-2 text-sm text-text-secondary"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Back
                  </button>
                )}
                {coreIndex >= 0 && coreIndex < CORE_TABS.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setTab(CORE_TABS[coreIndex + 1] ?? "employment")}
                    className="inline-flex items-center gap-1 rounded border border-border-strong px-3 py-2 text-sm text-text-secondary"
                  >
                    Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void createEmployee()}
                  disabled={saving || !form.first_name.trim()}
                  className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Creating…" : "Create employee"}
                </button>
              </>
            ) : (
              <>
                {tab === "personal" && (
                  <button type="button" disabled={saving} onClick={() => void saveTab(PERSONAL_KEYS, "Personal details")} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? "Saving..." : "Save personal"}
                  </button>
                )}
                {tab === "employment" && (
                  <button type="button" disabled={saving} onClick={() => void saveTab(EMPLOYMENT_KEYS, "Employment & payment")} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {saving ? "Saving..." : "Save employment & payment"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {run && (
        <NextStepsDialog
          run={run}
          canGenerateDocuments={canDocs}
          canPrintGatePass={access.can_manage_gate_pass}
          onRetry={() => void retryFailed()}
          retrying={retrying}
          onClose={() => {
            if (run.employee) navigate(`${PREFIX}/employees/${run.employee.id}`, { replace: true });
          }}
        />
      )}
    </div>
  );
}
