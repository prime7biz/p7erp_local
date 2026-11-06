/**
 * Bangladesh HR API (preset, rule sets, enforcement workflows, employee files, gate passes,
 * manual attendance, payroll registers, cases, separation / settlement, allowances and bonuses).
 * Backend: backend/app/modules/hr_localization/routers.py (mounted under hr.access).
 */
import { request, requestBlob } from "@/api/core";

const BD = "/api/v1/hr/localization/bd-rmg";
const HR = "/api/v1/hr";

export type Row = Record<string, unknown>;

export interface BdPresetItem {
  area: string;
  code: string;
  label: string;
  state: "missing" | "matched" | "edited" | "conflict";
  detail: string;
}

export interface BdCapability {
  area: string;
  label: string;
  state: "configured" | "preview_only" | "enforced" | "conflict" | "unsupported";
}

export interface BdPresetStatus {
  catalog: {
    catalog_version: string;
    wage_gazette: Record<string, string>;
    labour_act: Record<string, string>;
    privacy_act: Record<string, string>;
    pending_sources: string[];
  };
  complete: boolean;
  counts: Record<string, number>;
  items: BdPresetItem[];
  marker: Record<string, unknown> | null;
  capabilities: BdCapability[];
  enforcement: Record<string, boolean>;
  can_apply: boolean;
}

export interface BdApplyResult {
  created: { area: string; code: string; label: string }[];
  skipped_count: number;
  conflicts: BdPresetItem[];
  status: BdPresetStatus;
}

export interface BdRuleSet {
  id: number;
  code: string;
  catalog_version: string;
  effective_from: string;
  effective_to: string | null;
  status: "DRAFT" | "APPROVED" | "RETIRED";
  rules_json: Record<string, unknown>;
  approved_at: string | null;
  rates?: BdWageRate[];
}

export interface BdWageRate {
  id: number;
  rate_code: string;
  schedule_class: string;
  employment_stage: string;
  grade_code: string | null;
  designation_scope: string[];
  basic: string;
  house_rent: string;
  medical: string;
  transport: string;
  food: string;
  gross: string;
  apprentice_months: number | null;
  source_page: string;
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const hrBangladeshApi = {
  // Preset (Phase A)
  bdPresetStatus: () => request<BdPresetStatus>(`${BD}/status`),
  bdPresetApply: () => post<BdApplyResult>(`${BD}/apply`),

  // Rule sets + enforcement (Phase B / C)
  bdRuleSets: () => request<BdRuleSet[]>(`${BD}/rules`),
  bdRuleSet: (id: number) => request<BdRuleSet>(`${BD}/rules/${id}`),
  bdSeedOfficial: () => post<{ created: boolean; rule_set: BdRuleSet }>(`${BD}/rules/seed-official`),
  bdUpdateRuleSet: (id: number, body: { rules?: Record<string, unknown>; effective_from?: string; effective_to?: string | null }) =>
    request<BdRuleSet>(`${BD}/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  bdApproveRuleSet: (id: number) => post<BdRuleSet>(`${BD}/rules/${id}/approve`),
  bdRetireRuleSet: (id: number) => post<BdRuleSet>(`${BD}/rules/${id}/retire`),
  bdEnforcement: () => request<{ flags: Record<string, boolean>; approved_rule_set: BdRuleSet | null }>(`${BD}/enforcement`),
  bdSetEnforcement: (flags: Record<string, boolean>) =>
    request<{ flags: Record<string, boolean> }>(`${BD}/enforcement`, { method: "PUT", body: JSON.stringify({ flags }) }),
  bdPreviewMinimumWage: () => request<{ employees: Row[]; gap_count: number; warnings: string[]; source: string }>(`${BD}/rules/preview/minimum-wage`),
  bdPreviewServiceBenefit: (p: { employee_id: number; separation_type: string; separation_date: string }) =>
    request<Row>(`${BD}/rules/preview/service-benefit${qs(p)}`),
  bdPreviewMaternity: (p: { employee_id: number; expected_delivery_date: string; surviving_children: number }) =>
    request<Row>(`${BD}/rules/preview/maternity${qs(p)}`),
  bdPreviewFestival: (year: number) => request<Row>(`${BD}/rules/preview/festival${qs({ year })}`),

  bdWageAssignments: (employee_id?: number) => request<Row[]>(`${BD}/wage-assignments${qs({ employee_id })}`),
  bdAssignWage: (body: { employee_id: number; wage_rate_id: number; effective_from: string }) => post<Row>(`${BD}/wage-assignments`, body),
  bdMaternityCases: () => request<Row[]>(`${BD}/maternity-cases`),
  bdCreateMaternity: (body: { employee_id: number; expected_delivery_date: string; surviving_children: number }) =>
    post<Row>(`${BD}/maternity-cases`, body),
  bdApproveMaternity: (id: number) => post<Row>(`${BD}/maternity-cases/${id}/approve`),
  bdPayMaternity: (id: number, payment_reference: string) => post<Row>(`${BD}/maternity-cases/${id}/mark-paid`, { payment_reference }),
  bdAccrualPreview: (body: { period_start: string; period_end: string }) => post<{ employees: Row[]; leave_type_found: boolean }>(`${BD}/leave-accrual/preview`, body),
  bdAccrualApply: (body: { period_start: string; period_end: string }) => post<{ applied: number; skipped: number }>(`${BD}/leave-accrual/apply`, body),
  bdFestivalWork: () => request<Row[]>(`${BD}/festival-work`),
  bdGenerateFestivalWork: (body: { from_date: string; to_date: string }) => post<{ created: number }>(`${BD}/festival-work/generate`, body),
  bdApproveFestivalWork: (id: number, alternative_holiday_date: string) =>
    post<Row>(`${BD}/festival-work/${id}/approve`, { alternative_holiday_date }),
  bdCancelFestivalWork: (id: number) => post<Row>(`${BD}/festival-work/${id}/cancel`),
  bdCancelMaternity: (id: number) => post<Row>(`${BD}/maternity-cases/${id}/cancel`),
  bdServiceBenefits: () => request<Row[]>(`${BD}/service-benefits`),
  bdCreateServiceBenefit: (body: { employee_id: number; benefit_type: string; service_end_date: string; permanent: boolean }) =>
    post<Row>(`${BD}/service-benefits`, body),
  bdApproveServiceBenefit: (id: number) => post<Row>(`${BD}/service-benefits/${id}/approve`),

  // Employee number, photo, documents, biometrics
  employeeNumberFormat: () => request<{ prefix: string; width: number; next_code: string }>(`${HR}/employee-number-format`),
  setEmployeeNumberFormat: (prefix: string, width: number) =>
    request<{ prefix: string; width: number; next_code: string }>(`${HR}/employee-number-format`, { method: "PUT", body: JSON.stringify({ prefix, width }) }),
  uploadEmployeePhoto: (employeeId: number, file: Blob, lawfulBasis: string) => {
    const fd = new FormData();
    fd.append("file", file, "photo.jpg");
    fd.append("lawful_basis", lawfulBasis);
    fd.append("privacy_notice_acknowledged", "true");
    return request<{ has_photo: boolean }>(`${HR}/employees/${employeeId}/photo`, { method: "POST", body: fd });
  },
  employeePhotoBlob: (employeeId: number) => requestBlob(`${HR}/employees/${employeeId}/photo`),
  deleteEmployeePhoto: (employeeId: number) => request<void>(`${HR}/employees/${employeeId}/photo`, { method: "DELETE" }),
  uploadEmployeeDocument: (employeeId: number, file: Blob, documentType: string, filename: string) => {
    const fd = new FormData();
    fd.append("file", file, filename);
    fd.append("document_type", documentType);
    return request<Row>(`${HR}/employees/${employeeId}/documents/upload`, { method: "POST", body: fd });
  },
  employeeDocumentBlob: (employeeId: number, documentId: number) => requestBlob(`${HR}/employees/${employeeId}/documents/${documentId}/download`),
  biometricEnrollments: (employeeId: number) => request<Row[]>(`${HR}/employees/${employeeId}/biometric-enrollments`),
  createBiometric: (employeeId: number, body: { modality: string; device_id?: number | null; lawful_basis: string; privacy_notice_acknowledged: boolean }) =>
    post<Row>(`${HR}/employees/${employeeId}/biometric-enrollments`, body),
  markBiometricEnrolled: (id: number) => post<Row>(`${HR}/biometric-enrollments/${id}/enrolled`, { test_punch_confirmed: true }),
  withdrawBiometric: (id: number) => post<Row>(`${HR}/biometric-enrollments/${id}/withdraw`),
  confirmBiometricDeletion: (id: number) => post<Row>(`${HR}/biometric-enrollments/${id}/confirm-deletion`),

  // Gate passes
  gatePasses: (status?: string) => request<Row[]>(`${HR}/gate-passes${qs({ status })}`),
  createGatePass: (body: Row) => post<Row>(`${HR}/gate-passes`, body),
  activateGatePass: (id: number) => post<Row>(`${HR}/gate-passes/${id}/activate`),
  revokeGatePass: (id: number, reason: string) => post<Row>(`${HR}/gate-passes/${id}/revoke`, { reason }),
  gatePassPdf: (id: number) => requestBlob(`${HR}/gate-passes/${id}/print`),
  scanGatePass: (body: { qr: string; direction: string; gate: string; zone?: string; idempotency_key: string }) =>
    post<{ result: string; reason: string; holder?: Record<string, string>; duplicate: boolean }>(`${HR}/gate-passes/scan`, body),
  verifyGatePass: (qr: string, zone?: string) =>
    post<{ result: string; reason: string; holder: Record<string, string> }>(`${HR}/gate-passes/verify`, { qr, zone }),
  gateEvents: () => request<Row[]>(`${HR}/gate-events`),

  // Manual attendance
  manualLookup: (q: string) => request<{ id: number; employee_code: string; name: string }>(`${HR}/attendance/manual/lookup${qs({ q })}`),
  manualIn: (body: { employee_code: string; work_date: string; in_time: string; reason: string }) => post<Row>(`${HR}/attendance/manual/in`, body),
  manualOut: (body: { employee_code?: string; employee_id?: number; work_date: string; out_time: string; out_next_day: boolean; reason: string }) =>
    post<Row>(`${HR}/attendance/manual/out`, body),
  missingOut: (date_from?: string, date_to?: string) => request<Row[]>(`${HR}/attendance/manual/missing-out${qs({ date_from, date_to })}`),

  // Payroll registers
  freezePayroll: (runId: number) => post<Row>(`${HR}/payroll/runs/${runId}/document-snapshot`),
  payrollSnapshot: (runId: number) => request<Row | null>(`${HR}/payroll/runs/${runId}/document-snapshot`),
  salarySheet: (runId: number, departmentId?: number) => request<Row>(`${HR}/payroll/runs/${runId}/salary-sheet${qs({ department_id: departmentId })}`),
  salarySheetPdf: (runId: number, departmentId?: number) =>
    requestBlob(`${HR}/payroll/runs/${runId}/salary-sheet${qs({ format: "pdf", department_id: departmentId })}`),
  wageRegisterPdf: (runId: number) => requestBlob(`${HR}/payroll/runs/${runId}/wage-register.pdf`),
  payslipsZip: (runId: number) => requestBlob(`${HR}/payroll/runs/${runId}/payslips.zip`),
  acknowledgements: (runId: number) => request<{ rows: Row[]; pending: number }>(`${HR}/payroll/runs/${runId}/acknowledgements`),
  acknowledge: (runId: number, body: Row) => post<Row>(`${HR}/payroll/runs/${runId}/acknowledgements`, body),

  // Cases
  cases: (params: { case_type?: string; status?: string } = {}) => request<Row[]>(`${HR}/cases${qs(params)}`),
  caseDetail: (id: number) => request<Row>(`${HR}/cases/${id}`),
  absenceCandidates: () => request<Row[]>(`${HR}/cases/absence-candidates`),
  createCase: (body: Row) => post<Row>(`${HR}/cases`, body),
  issueCase: (id: number, issue_date: string, reply_days?: number) => post<Row>(`${HR}/cases/${id}/issue`, { issue_date, reply_days }),
  addCaseEvent: (id: number, body: Row) => post<Row>(`${HR}/cases/${id}/events`, body),
  defenceNotice: (id: number, issue_date: string) => post<Row>(`${HR}/cases/${id}/defence-notice`, { issue_date }),
  decideCase: (id: number, body: { decision: string; decision_date: string; note?: string }) => post<Row>(`${HR}/cases/${id}/decide`, body),
  casePdf: (id: number) => requestBlob(`${HR}/cases/${id}/notice.pdf`),

  // Separation / settlement
  separations: () => request<Row[]>(`${HR}/separations`),
  createSeparation: (body: Row) => post<Row>(`${HR}/separations`, body),
  approveSeparation: (id: number) => post<Row>(`${HR}/separations/${id}/approve`),
  cancelSeparation: (id: number) => post<Row>(`${HR}/separations/${id}/cancel`),
  clearance: (id: number) => request<Row[]>(`${HR}/separations/${id}/clearance`),
  addClearance: (id: number, body: Row) => post<Row>(`${HR}/separations/${id}/clearance`, body),
  signOffClearance: (itemId: number, status: string) => post<Row>(`${HR}/clearance-items/${itemId}/sign-off`, { status }),
  previewSettlement: (sepId: number) => post<Row>(`${HR}/separations/${sepId}/settlement/preview`),
  calculateSettlement: (sepId: number) => post<Row>(`${HR}/separations/${sepId}/settlement`),
  settlement: (id: number) => request<Row>(`${HR}/final-settlements/${id}`),
  approveSettlement: (id: number) => post<Row>(`${HR}/final-settlements/${id}/approve`),
  postSettlement: (id: number) => post<Row>(`${HR}/final-settlements/${id}/post`),
  paySettlement: (id: number, payment_reference: string) => post<Row>(`${HR}/final-settlements/${id}/mark-paid`, { payment_reference }),
  reverseSettlement: (id: number, reason: string) => post<Row>(`${HR}/final-settlements/${id}/reverse`, { reason }),

  // Allowances / bonuses
  allowanceRules: () => request<Row[]>(`${HR}/allowances/rules`),
  createAllowanceRule: (body: Row) => post<Row>(`${HR}/allowances/rules`, body),
  approveAllowanceRule: (id: number) => post<Row>(`${HR}/allowances/rules/${id}/approve`),
  previewAllowances: (from_date: string, to_date: string) =>
    post<{ eligible: number; totals: Record<string, string> }>(`${HR}/allowances/preview`, { from_date, to_date }),
  generateAllowances: (from_date: string, to_date: string) => post<{ created: number }>(`${HR}/allowances/generate`, { from_date, to_date }),
  allowanceEntries: (status?: string) => request<Row[]>(`${HR}/allowances/entries${qs({ status })}`),
  approveAllowances: (ids: number[]) => post<{ approved: number }>(`${HR}/allowances/entries/approve`, { ids }),
  rejectAllowance: (id: number) => post<Row>(`${HR}/allowances/entries/${id}/reject`),
  correctAllowance: (id: number, amount: string, reason: string) => post<Row>(`${HR}/allowances/entries/${id}/correct`, { amount, reason }),
  productionSchemes: () => request<Row[]>(`${HR}/production-bonus/schemes`),
  createProductionScheme: (body: Row) => post<Row>(`${HR}/production-bonus/schemes`, body),
  approveProductionScheme: (id: number) => post<Row>(`${HR}/production-bonus/schemes/${id}/approve`),
  generateProductionBonus: (body: Row) => post<{ created: number }>(`${HR}/production-bonus/generate`, body),
  productionEntries: () => request<Row[]>(`${HR}/production-bonus/entries`),
  approveProductionEntries: (ids: number[]) => post<{ approved: number }>(`${HR}/production-bonus/entries/approve`, { ids }),
  allocateFestivalBonus: (id: number, cutoff_date: string, percent_of_basic: string) =>
    post<{ eligible: number; employees: number }>(`${HR}/festival-bonus/${id}/allocate`, { cutoff_date, percent_of_basic }),
  festivalBonusLines: (id: number) => request<Row[]>(`${HR}/festival-bonus/${id}/lines`),
  approveFestivalBonus: (id: number) => post<{ approved: number; total: string }>(`${HR}/festival-bonus/${id}/approve`),
};

/** Open a downloaded PDF / ZIP in a new tab (PDF) or save it (other types). */
export function openBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  if (blob.type === "application/pdf") {
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;
}
