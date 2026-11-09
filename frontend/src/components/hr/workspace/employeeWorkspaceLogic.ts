/**
 * Pure helpers for the employee workspace (no React), so they are easy to unit test.
 *
 * The workspace edits one flat `EmployeeFormState`. Create mode sends it once to
 * POST /hr/onboarding; edit mode sends only the fields of the tab being saved (PATCH).
 */
import type {
  HrCompensationInput,
  HrCompensationPreview,
  HrEmployeeCreate,
  HrEmployeePaySnapshot,
  HrEmployeeResponse,
  HrEmployeeUpdate,
  HrOnboardingRequest,
  HrOnboardingRun,
  HrOnboardingSteps,
  HrSalaryPaymentMethod,
} from "@/api/models";

export type WorkspaceMode = "create" | "edit";

export type WorkspaceTab =
  | "personal"
  | "employment"
  | "checklist"
  | "identity"
  | "documents"
  | "age"
  | "medical"
  | "history"
  | "production";

/** Tabs that store rows linked to a saved employee, so they open only after the first save. */
export const RECORD_TABS: readonly WorkspaceTab[] = ["checklist", "identity", "documents", "age", "medical", "history", "production"];
/** Create-mode steps shown as "Core details n of 2". */
export const CORE_TABS: readonly WorkspaceTab[] = ["personal", "employment"];

export function isTabLocked(mode: WorkspaceMode, tab: WorkspaceTab): boolean {
  return mode === "create" && RECORD_TABS.includes(tab);
}

export const EMPLOYMENT_TYPE_SUGGESTIONS = ["permanent", "temporary", "contractual", "probation"] as const;
export const RELIGION_OPTIONS = ["Islam", "Hinduism", "Buddhism", "Christianity", "Other"] as const;
export const GENDER_OPTIONS = ["Male", "Female", "Other"] as const;
export const FACILITY_SUGGESTIONS = [
  "Lunch",
  "Tiffin",
  "Transport",
  "Accommodation",
  "Medical",
  "Mobile bill",
  "Day care",
  "Uniform",
] as const;
export const MAX_FACILITIES = 20;

export type EmployeeFormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile_is_bkash: boolean;
  date_of_birth: string;
  gender: string;
  marital_status: string;
  blood_group: string;
  religion: string;
  nationality: string;
  national_id: string;
  birth_registration_no: string;
  father_name: string;
  mother_name: string;
  spouse_name: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  present_address_line: string;
  present_city: string;
  present_district: string;
  present_postal_code: string;
  present_country: string;
  permanent_address_line: string;
  permanent_city: string;
  permanent_district: string;
  permanent_postal_code: string;
  permanent_country: string;
  department_id: number | null;
  designation_id: number | null;
  section_id: number | null;
  employee_category: string;
  reporting_manager_id: number | null;
  attendance_device_pin: string;
  employment_type: string;
  joining_date: string;
  probation_months: string;
  confirmation_date: string;
  exit_date: string;
  salary_payment_method: "" | HrSalaryPaymentMethod;
  bank_account_name: string;
  bank_account_number: string;
  bank_name: string;
  bank_branch: string;
  bank_routing_no: string;
  facilities: string[];
};

/**
 * Salary set-up on the Employment & Salary tab.
 * `enabled` is "Set salary now" (create) or an open "Change salary" form (edit); when false no salary is sent.
 * With a wage grade the basic is the grade minimum unless `override` is on; without a grade the basic is required.
 * `acknowledged` is the on-screen override confirmation only; it is never sent to the API.
 */
export type SalaryFormState = {
  enabled: boolean;
  structure_id: number | null;
  bd_wage_rate_id: number | null;
  override: boolean;
  base_salary: string;
  effective_from: string;
  acknowledged: boolean;
};

export const PRESENT_KEYS = [
  "present_address_line",
  "present_city",
  "present_district",
  "present_postal_code",
  "present_country",
] as const;
const PERMANENT_OF: Record<(typeof PRESENT_KEYS)[number], keyof EmployeeFormState> = {
  present_address_line: "permanent_address_line",
  present_city: "permanent_city",
  present_district: "permanent_district",
  present_postal_code: "permanent_postal_code",
  present_country: "permanent_country",
};

export const PERSONAL_KEYS: readonly (keyof EmployeeFormState)[] = [
  "first_name", "last_name", "email", "phone", "mobile_is_bkash", "date_of_birth", "gender", "marital_status",
  "blood_group", "religion", "nationality", "national_id", "birth_registration_no", "father_name", "mother_name",
  "spouse_name", "emergency_contact_name", "emergency_contact_relation", "emergency_contact_phone",
  ...PRESENT_KEYS, "permanent_address_line", "permanent_city", "permanent_district", "permanent_postal_code",
  "permanent_country",
];
export const JOB_KEYS: readonly (keyof EmployeeFormState)[] = [
  "department_id", "designation_id", "section_id", "employee_category", "reporting_manager_id",
  "attendance_device_pin", "employment_type", "joining_date", "probation_months", "confirmation_date", "exit_date",
];
export const PAYMENT_KEYS: readonly (keyof EmployeeFormState)[] = [
  "salary_payment_method", "bank_account_name", "bank_account_number", "bank_name", "bank_branch", "bank_routing_no",
  "facilities",
];
/** Edit mode "Save employment & payment" on the Employment & Salary tab (salary has its own save). */
export const EMPLOYMENT_KEYS: readonly (keyof EmployeeFormState)[] = [...JOB_KEYS, ...PAYMENT_KEYS];

export function emptyEmployeeForm(): EmployeeFormState {
  return {
    first_name: "", last_name: "", email: "", phone: "", mobile_is_bkash: false, date_of_birth: "", gender: "",
    marital_status: "", blood_group: "", religion: "", nationality: "Bangladeshi", national_id: "",
    birth_registration_no: "", father_name: "", mother_name: "", spouse_name: "", emergency_contact_name: "",
    emergency_contact_relation: "", emergency_contact_phone: "", present_address_line: "", present_city: "",
    present_district: "", present_postal_code: "", present_country: "Bangladesh", permanent_address_line: "",
    permanent_city: "", permanent_district: "", permanent_postal_code: "", permanent_country: "Bangladesh",
    department_id: null, designation_id: null, section_id: null, employee_category: "", reporting_manager_id: null,
    attendance_device_pin: "", employment_type: "", joining_date: "", probation_months: "", confirmation_date: "",
    exit_date: "", salary_payment_method: "", bank_account_name: "", bank_account_number: "", bank_name: "",
    bank_branch: "", bank_routing_no: "", facilities: [],
  };
}

export function emptySalaryForm(): SalaryFormState {
  return { enabled: false, structure_id: null, bd_wage_rate_id: null, override: false, base_salary: "", effective_from: "", acknowledged: false };
}

const s = (v: string | null | undefined): string => v ?? "";

export function formFromEmployee(row: HrEmployeeResponse): EmployeeFormState {
  const base = emptyEmployeeForm();
  return {
    ...base,
    first_name: row.first_name, last_name: s(row.last_name), email: s(row.email), phone: s(row.phone),
    mobile_is_bkash: Boolean(row.mobile_is_bkash), date_of_birth: s(row.date_of_birth), gender: s(row.gender),
    marital_status: s(row.marital_status), blood_group: s(row.blood_group), religion: s(row.religion),
    nationality: s(row.nationality), national_id: s(row.national_id), birth_registration_no: s(row.birth_registration_no),
    father_name: s(row.father_name), mother_name: s(row.mother_name), spouse_name: s(row.spouse_name),
    emergency_contact_name: s(row.emergency_contact_name), emergency_contact_relation: s(row.emergency_contact_relation),
    emergency_contact_phone: s(row.emergency_contact_phone),
    // Older employees only have the legacy address; show it as the present address.
    present_address_line: s(row.present_address_line ?? row.address_line),
    present_city: s(row.present_city ?? row.city),
    present_district: s(row.present_district), present_postal_code: s(row.present_postal_code),
    present_country: s(row.present_country ?? row.country),
    permanent_address_line: s(row.permanent_address_line), permanent_city: s(row.permanent_city),
    permanent_district: s(row.permanent_district), permanent_postal_code: s(row.permanent_postal_code),
    permanent_country: s(row.permanent_country),
    department_id: row.department_id, designation_id: row.designation_id, section_id: row.section_id,
    employee_category: s(row.employee_category), reporting_manager_id: row.reporting_manager_id,
    attendance_device_pin: s(row.attendance_device_pin), employment_type: s(row.employment_type),
    joining_date: s(row.joining_date),
    probation_months: row.probation_months == null ? "" : String(row.probation_months),
    confirmation_date: s(row.confirmation_date), exit_date: s(row.exit_date),
    salary_payment_method: (row.salary_payment_method ?? "") as EmployeeFormState["salary_payment_method"],
    bank_account_name: s(row.bank_account_name), bank_account_number: s(row.bank_account_number),
    bank_name: s(row.bank_name), bank_branch: s(row.bank_branch), bank_routing_no: s(row.bank_routing_no),
    facilities: Array.isArray(row.facilities) ? [...row.facilities] : [],
  };
}

/** True when every present-address field equals its permanent counterpart (and something is filled). */
export function addressesMatch(form: EmployeeFormState): boolean {
  const any = PRESENT_KEYS.some((k) => form[k]);
  return any && PRESENT_KEYS.every((k) => form[k] === form[PERMANENT_OF[k]]);
}

/** Copy present -> permanent (used while "Same as present address" is ticked). */
export function syncPermanentAddress(form: EmployeeFormState): EmployeeFormState {
  const next = { ...form };
  for (const k of PRESENT_KEYS) (next as Record<string, unknown>)[PERMANENT_OF[k]] = form[k];
  return next;
}

/** joining date + probation months -> confirmation date (YYYY-MM-DD), or "" when not computable. */
export function calculateConfirmationDate(joiningDate: string, probationMonths: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(joiningDate);
  const months = Number(probationMonths);
  if (!m || probationMonths.trim() === "" || !Number.isInteger(months) || months < 0 || months > 24) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const target = new Date(Date.UTC(y, mo + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export type DigitCheck = { ok: boolean; message: string };

export function checkNid(value: string): DigitCheck {
  const v = value.replace(/\s+/g, "");
  if (!v) return { ok: true, message: "" };
  if (!/^\d+$/.test(v)) return { ok: false, message: "Digits only" };
  return [10, 13, 17].includes(v.length) ? { ok: true, message: "" } : { ok: false, message: "NID has 10, 13 or 17 digits" };
}

export function checkBirthRegistration(value: string): DigitCheck {
  const v = value.replace(/\s+/g, "");
  if (!v) return { ok: true, message: "" };
  return /^\d{17}$/.test(v) ? { ok: true, message: "" } : { ok: false, message: "Birth registration number has 17 digits" };
}

export function checkMobile(value: string): DigitCheck {
  const v = value.replace(/[\s-]+/g, "");
  if (!v) return { ok: true, message: "" };
  return /^(\+?88)?01\d{9}$/.test(v) ? { ok: true, message: "" } : { ok: false, message: "Use an 11-digit mobile, e.g. 01712345678" };
}

export function addFacility(list: string[], name: string): string[] {
  const clean = name.trim().slice(0, 64);
  if (!clean || list.includes(clean) || list.length >= MAX_FACILITIES) return list;
  return [...list, clean];
}

export function toggleFacility(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((f) => f !== name) : addFacility(list, name);
}

// --- AI extraction merge ------------------------------------------------------------------------------

export const AI_OCR_FLAGS = ["ocr_cv_extraction_enabled", "ocr_id_extraction_enabled", "ocr_medical_extraction_enabled"] as const;

/** The AI autofill panel shows when any document OCR flag is on for the company. */
export function aiAutofillEnabled(flags: Record<string, unknown> | null | undefined): boolean {
  return AI_OCR_FLAGS.some((f) => flags?.[f] === true);
}

/** OCR field key -> workspace field. Only these fields are ever filled by AI. */
export const AI_FIELD_MAP: Record<string, keyof EmployeeFormState> = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  date_of_birth: "date_of_birth",
  gender: "gender",
  national_id: "national_id",
  birth_registration_no: "birth_registration_no",
  father_name: "father_name",
  mother_name: "mother_name",
  address_line: "present_address_line",
  city: "present_city",
  country: "present_country",
  joining_date: "joining_date",
  employment_type: "employment_type",
};

function extractedValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const v = (raw as { value: unknown }).value;
    return v == null ? "" : String(v).trim();
  }
  return String(raw).trim();
}

export type AiMergeResult = {
  form: EmployeeFormState;
  /** Fields filled from the document (to highlight). */
  filled: (keyof EmployeeFormState)[];
  /** Fields the user already edited by hand that the document disagrees with (never overwritten). */
  conflicts: { field: keyof EmployeeFormState; extracted: string }[];
};

/**
 * Merge extracted fields without overwriting anything the user typed (`touched`).
 * Untouched fields are filled; a touched field that differs becomes a conflict to confirm.
 */
export function mergeExtraction(
  form: EmployeeFormState,
  fields: Record<string, unknown>,
  touched: ReadonlySet<string>,
): AiMergeResult {
  const next = { ...form } as Record<string, unknown>;
  const filled: (keyof EmployeeFormState)[] = [];
  const conflicts: AiMergeResult["conflicts"] = [];
  for (const [src, dest] of Object.entries(AI_FIELD_MAP)) {
    const value = extractedValue(fields[src]);
    if (!value) continue;
    const current = String(next[dest] ?? "");
    if (current === value) continue;
    if (touched.has(dest) && current) {
      conflicts.push({ field: dest, extracted: value });
      continue;
    }
    next[dest] = value;
    filled.push(dest);
  }
  return { form: next as EmployeeFormState, filled, conflicts };
}

// --- Payloads -----------------------------------------------------------------------------------------

const t = (v: string): string | null => (v.trim() ? v.trim() : null);

function fieldValue(form: EmployeeFormState, key: keyof EmployeeFormState): unknown {
  const v = form[key];
  if (key === "probation_months") return form.probation_months.trim() === "" ? null : Number(form.probation_months);
  if (key === "salary_payment_method") return form.salary_payment_method || null;
  if (key === "facilities") return form.facilities.length ? form.facilities : null;
  if (typeof v === "string") return t(v);
  return v;
}

/**
 * PATCH body for one tab: only keys whose value differs from `initial` (what was loaded), never
 * masked ones. Sending unchanged values would make the API treat a displayed fallback (e.g. the
 * legacy city shown as present city) as a change that needs extra permission.
 */
export function buildTabUpdate(
  form: EmployeeFormState,
  keys: readonly (keyof EmployeeFormState)[],
  masked: readonly string[] = [],
  initial?: EmployeeFormState,
): HrEmployeeUpdate {
  const out: Record<string, unknown> = {};
  const changed = (key: keyof EmployeeFormState) =>
    !initial || JSON.stringify(fieldValue(form, key)) !== JSON.stringify(fieldValue(initial, key));
  // The API copies the present address into the legacy address columns, so it must get the whole group.
  const presentChanged = PRESENT_KEYS.some((k) => keys.includes(k) && changed(k));
  for (const key of keys) {
    if (masked.includes(key)) continue;
    if (!changed(key) && !(presentChanged && (PRESENT_KEYS as readonly string[]).includes(key))) continue;
    out[key] = fieldValue(form, key);
  }
  if ("first_name" in out) out.first_name = form.first_name.trim();
  return out as HrEmployeeUpdate;
}

/** Fields only `hr.identity.manage` may set (mirrors the API). */
export const IDENTITY_PROFILE_KEYS: readonly (keyof EmployeeFormState)[] = [
  "father_name", "mother_name", "spouse_name", "religion", "nationality", ...PRESENT_KEYS, "permanent_address_line",
  "permanent_city", "permanent_district", "permanent_postal_code", "permanent_country", "emergency_contact_relation",
  "mobile_is_bkash",
];
/** Fields only `hr.payroll.manage` may set (mirrors the API). */
export const PAYROLL_ONLY_KEYS: readonly (keyof EmployeeFormState)[] = [
  "salary_payment_method", "bank_account_name", "bank_account_number", "bank_name", "bank_branch", "bank_routing_no",
];

export function omittedCreateKeys(access: { can_manage_identity: boolean; can_manage_payroll: boolean }): string[] {
  return [...(access.can_manage_identity ? [] : IDENTITY_PROFILE_KEYS), ...(access.can_manage_payroll ? [] : PAYROLL_ONLY_KEYS)];
}

/** Full employee body for create mode; blank values and fields in `omit` are left out. */
export function buildEmployeeCreate(form: EmployeeFormState, omit: readonly string[] = []): HrEmployeeCreate {
  const out: Record<string, unknown> = { first_name: form.first_name.trim() };
  for (const key of [...PERSONAL_KEYS, ...JOB_KEYS, ...PAYMENT_KEYS]) {
    if (key === "first_name" || omit.includes(key)) continue;
    const v = fieldValue(form, key);
    if (v === null || v === "" || v === false) continue;
    out[key] = v;
  }
  return out as unknown as HrEmployeeCreate;
}

// --- Salary set-up ------------------------------------------------------------------------------------

const MONEY_RE = /^\d{1,14}(\.\d{1,4})?$/;

export function isMoneyInput(value: string): boolean {
  return MONEY_RE.test(value.trim());
}

/** "12500.0000" -> "12500", "0012500.50" -> "12500.5"; anything that is not a plain decimal is returned trimmed. */
export function normalizeMoney(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  const [whole = "0", frac = ""] = s.split(".");
  const i = whole.replace(/^0+(?=\d)/, "");
  const f = frac.replace(/0+$/, "");
  return f ? `${i}.${f}` : i;
}

/** True when the basic must be typed: no wage grade, or the grade's standard basic is overridden. */
export function salaryNeedsAmount(salary: SalaryFormState): boolean {
  return salary.bd_wage_rate_id === null || salary.override;
}

/** Apply a change to the salary form; any change to what is paid clears the override confirmation. */
export function updateSalary(prev: SalaryFormState, patch: Partial<SalaryFormState>): SalaryFormState {
  const next = { ...prev, ...patch };
  const payKeys = ["enabled", "structure_id", "bd_wage_rate_id", "override", "base_salary"] as const;
  if (!("acknowledged" in patch) && payKeys.some((k) => k in patch && patch[k] !== prev[k])) next.acknowledged = false;
  if (next.bd_wage_rate_id === null) next.override = false;
  return next;
}

/** "Change salary" starts from the pay in force, so saving without edits never lowers the basic. */
export function salaryFormFromSnapshot(snapshot: HrEmployeePaySnapshot | null | undefined): SalaryFormState {
  const base = { ...emptySalaryForm(), enabled: true };
  if (!snapshot) return base;
  // An assignment without a stored basic reports "0"; that is "no basic", not a basic below the grade.
  const basic = normalizeMoney(snapshot.basic);
  const storedBasic = snapshot.structure_id !== null && basic !== "0" && basic !== "" ? basic : "";
  if (snapshot.wage_rate_id !== null) {
    const aboveGrade = storedBasic !== "" && snapshot.wage_grade_basic !== null && storedBasic !== normalizeMoney(snapshot.wage_grade_basic);
    return { ...base, structure_id: snapshot.structure_id, bd_wage_rate_id: snapshot.wage_rate_id, override: aboveGrade, base_salary: aboveGrade ? storedBasic : "" };
  }
  return { ...base, structure_id: snapshot.structure_id, base_salary: storedBasic };
}

export type SalaryDateSource = "custom" | "joining" | "company_today" | "missing";

/**
 * The date the salary starts. Create: typed date, else joining date, else today's company date
 * (`as_of` from the compensation options). Edit: always a typed date.
 */
export function resolveSalaryEffectiveDate(
  salary: SalaryFormState,
  mode: WorkspaceMode,
  joiningDate: string,
  asOf: string | null,
): { date: string; source: SalaryDateSource } {
  const custom = salary.effective_from.trim();
  if (custom) return { date: custom, source: "custom" };
  if (mode === "edit") return { date: "", source: "missing" };
  if (joiningDate.trim()) return { date: joiningDate.trim(), source: "joining" };
  if (asOf) return { date: asOf, source: "company_today" };
  return { date: "", source: "missing" };
}

/** Compensation payload; null whenever salary set-up is off, whatever hidden fields still hold. */
export function buildCompensation(salary: SalaryFormState, effectiveFrom: string | null): HrCompensationInput | null {
  if (!salary.enabled || !salary.structure_id) return null;
  return {
    structure_id: salary.structure_id,
    bd_wage_rate_id: salary.bd_wage_rate_id,
    base_salary: salaryNeedsAmount(salary) ? t(salary.base_salary) : null,
    effective_from: effectiveFrom ? t(effectiveFrom) : null,
  };
}

/** The request to preview, or null while required parts are still missing. */
export function previewableCompensation(salary: SalaryFormState, effectiveFrom: string): HrCompensationInput | null {
  const req = buildCompensation(salary, effectiveFrom);
  if (!req || !req.effective_from) return null;
  if (salaryNeedsAmount(salary) && !isMoneyInput(salary.base_salary)) return null;
  return req;
}

export type SalaryPreviewStatus = "idle" | "pending" | "valid" | "invalid" | "error";
export type SalaryPreviewState = {
  status: SalaryPreviewStatus;
  /** `previewKey` of the request this result belongs to. */
  key: string | null;
  preview: HrCompensationPreview | null;
  message: string | null;
};
export const IDLE_PREVIEW: SalaryPreviewState = { status: "idle", key: null, preview: null, message: null };

export function previewKey(req: HrCompensationInput | null): string | null {
  if (!req) return null;
  return JSON.stringify({
    structure_id: req.structure_id,
    bd_wage_rate_id: req.bd_wage_rate_id ?? null,
    base_salary: req.base_salary ?? null,
    effective_from: req.effective_from ?? null,
  });
}

/**
 * Why the salary cannot be saved yet, or null when it can. Only meaningful when `salary.enabled`;
 * a salary that is switched on is never silently dropped.
 */
export function salaryBlocker(
  salary: SalaryFormState,
  effectiveFrom: string,
  preview: SalaryPreviewState,
  opts: { mode: WorkspaceMode; joiningDate: string; joiningDateUnsaved?: boolean },
): string | null {
  if (!salary.enabled) return null;
  if (opts.mode === "edit" && opts.joiningDateUnsaved) return "Save employment first: the joining date has unsaved changes.";
  if (!salary.structure_id) return "Choose a salary structure, or switch off “Set salary now”.";
  if (salaryNeedsAmount(salary)) {
    if (!salary.base_salary.trim()) return "Enter the basic salary.";
    if (!isMoneyInput(salary.base_salary)) return "Basic salary must be a number such as 12500 or 12500.50 (no commas).";
  }
  if (!effectiveFrom) {
    return opts.mode === "edit" ? "Choose the date the new salary starts." : "Enter a joining date or a salary start date.";
  }
  if (opts.joiningDate && effectiveFrom < opts.joiningDate) return "The salary cannot start before the joining date.";
  if (salary.bd_wage_rate_id !== null && salary.override && !salary.acknowledged) {
    return "Tick the confirmation box to use a basic salary different from the grade standard.";
  }
  const key = previewKey(previewableCompensation(salary, effectiveFrom));
  if (preview.key !== key || preview.status === "pending" || preview.status === "idle") return "Checking the salary…";
  if (preview.status === "error") return preview.message || "Could not check the salary. Try again.";
  if (preview.status === "invalid") return preview.message || "The salary is below the legal minimum.";
  return null;
}

export function newRequestId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `onb-${rand}`.slice(0, 64);
}

/** The single create call: always the onboarding endpoint, never legacy POST /hr/employees. */
export function buildOnboardingRequest(
  requestId: string,
  form: EmployeeFormState,
  salary: SalaryFormState,
  issueTempGatePass: boolean,
  omit: readonly string[] = [],
  asOf: string | null = null,
): HrOnboardingRequest {
  return {
    request_id: requestId,
    employee: buildEmployeeCreate(form, omit),
    compensation: buildCompensation(salary, resolveSalaryEffectiveDate(salary, "create", form.joining_date, asOf).date),
    issue_temp_gate_pass: issueTempGatePass,
  };
}

/** Body to resume a partly failed onboarding: retry only the steps that did not finish. */
export function buildResumeSteps(run: HrOnboardingRun, request: HrOnboardingRequest): HrOnboardingSteps {
  const pending = (st: string) => st === "FAILED" || st === "PENDING";
  return {
    compensation: pending(run.steps.payroll) ? request.compensation ?? null : null,
    issue_temp_gate_pass: pending(run.steps.gate_pass) ? Boolean(request.issue_temp_gate_pass) : false,
  };
}

/** 4xx step errors (bad salary, missing data) need a correction, not a retry. */
export function isValidationError(code: string | null | undefined): boolean {
  return /^http_4\d\d$/.test(code ?? "");
}

export function stepLabel(step: keyof HrOnboardingRun["steps"]): string {
  return { employee: "Employee record", payroll: "Salary set-up", gate_pass: "Temporary gate pass", checklist: "Onboarding checklist" }[step];
}

/** True when the form differs from its starting point (drives the unsaved-changes warning). */
export function isDirty<T extends object>(initial: T, current: T): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}
