/**
 * HR & payroll API calls (`/api/v1/hr/*`).
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types still live in `api/client.ts`.
 */
import { request, requestBlob } from "@/api/core";
import type {
  HrCompensationInput,
  HrCompensationOptions,
  HrCompensationPreview,
  HrEmployeeAccess,
  HrEmployeeCompensationView,
  HrGeneratedDocument,
  HrOnboardingRequest,
  HrOnboardingRun,
  HrOnboardingSteps,
  HrOnboardingTask,
  HrAgeVerification,
  HrAttendanceBulkEntryBody,
  HrAttendanceEntryCreate,
  HrAttendanceEntryResponse,
  HrAttendanceEntryUpdate,
  HrAttendanceReportRow,
  HrAttendanceSummaryRow,
  HrAuditReadiness,
  HrCandidateCreate,
  HrCandidateResponse,
  HrComplianceFramework,
  HrComplianceRequirement,
  HrComplianceScore,
  HrDashboardData,
  HrDepartmentCreate,
  HrDepartmentResponse,
  HrDepartmentUpdate,
  HrDesignationCreate,
  HrDesignationResponse,
  HrDesignationUpdate,
  HrEmployeeComplianceRecord,
  HrEmployeeCreate,
  HrEmployeeDocumentCreate,
  HrEmployeeDocumentResponse,
  HrEmployeeResponse,
  HrEmployeeStatusHistoryCreate,
  HrEmployeeStatusHistoryResponse,
  HrEmployeeUpdate,
  HrEssProfileResponse,
  HrEssProfileUpdate,
  HrGoalCreate,
  HrGoalResponse,
  HrHolidayResponse,
  HrHolidayUpdate,
  HrInterviewCreate,
  HrInterviewResponse,
  HrJobRequisitionCreate,
  HrJobRequisitionResponse,
  HrLeaveBalanceResponse,
  HrLeaveBalanceUpsert,
  HrLeavePolicyResponse,
  HrLeavePolicyUpdate,
  HrLeaveReportRow,
  HrLeaveRequestCreate,
  HrLeaveRequestResponse,
  HrLeaveRequestUpdate,
  HrLeaveTypeCreate,
  HrLeaveTypeResponse,
  HrLeaveTypeUpdate,
  HrMedicalRecord,
  HrOfferCreate,
  HrOfferResponse,
  HrOvertimeRuleResponse,
  HrOvertimeRuleUpdate,
  HrPayrollApprovalResponse,
  HrPayrollAssignmentCreate,
  HrPayrollAssignmentResponse,
  HrPayrollAutoCalcApplyResult,
  HrPayrollAutoCalcPreview,
  HrPayrollPeriodCreate,
  HrPayrollPeriodResponse,
  HrPayrollReportRow,
  HrPayrollRunCreate,
  HrPayrollRunLineResponse,
  HrPayrollRunLineUpsert,
  HrPayrollRunResponse,
  HrPayrollStructureLineCreate,
  HrPayrollStructureLineResponse,
  HrPayrollStructureLineUpdate,
  HrPayslipResponse,
  HrPerformanceCycleResponse,
  HrPerformanceDashboardResponse,
  HrRegularizationCreate,
  HrRegularizationDecision,
  HrRegularizationResponse,
  HrReportSummaryResponse,
  HrReviewCreate,
  HrReviewResponse,
  HrRosterEntryCreate,
  HrRosterEntryResponse,
  HrRosterEntryUpdate,
  HrSalaryStructureCreate,
  HrSalaryStructureResponse,
  HrSalaryStructureUpdate,
  HrSectionResponse,
  HrShiftCreate,
  HrShiftResponse,
  PayrollStatutoryConfigBody,
  PayrollStatutoryConfigResponse,
  PayrollStatutoryPreviewBody,
  PayrollStatutoryPreviewResponse,
} from "@/api/models";

function signedDocQuery(opts?: { reissue?: boolean; requestId?: string }): string {
  const q = new URLSearchParams();
  if (opts?.reissue) q.set("reissue", "true");
  if (opts?.requestId) q.set("request_id", opts.requestId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const hrApi = {
  async listHrDepartments(params?: { active_only?: boolean }): Promise<HrDepartmentResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrDepartmentResponse[]>(`/api/v1/hr/departments${suffix}`);
  },
  async createHrDepartment(data: HrDepartmentCreate): Promise<HrDepartmentResponse> {
    return request<HrDepartmentResponse>("/api/v1/hr/departments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrDepartment(id: number, data: HrDepartmentUpdate): Promise<HrDepartmentResponse> {
    return request<HrDepartmentResponse>(`/api/v1/hr/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteHrDepartment(id: number): Promise<void> {
    return request<void>(`/api/v1/hr/departments/${id}`, { method: "DELETE" });
  },
  async listHrDesignations(params?: { active_only?: boolean; department_id?: number }): Promise<HrDesignationResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrDesignationResponse[]>(`/api/v1/hr/designations${suffix}`);
  },
  async createHrDesignation(data: HrDesignationCreate): Promise<HrDesignationResponse> {
    return request<HrDesignationResponse>("/api/v1/hr/designations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrDesignation(id: number, data: HrDesignationUpdate): Promise<HrDesignationResponse> {
    return request<HrDesignationResponse>(`/api/v1/hr/designations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteHrDesignation(id: number): Promise<void> {
    return request<void>(`/api/v1/hr/designations/${id}`, { method: "DELETE" });
  },
  async listHrEmployees(params?: {
    active_only?: boolean;
    department_id?: number;
    designation_id?: number;
    search?: string;
  }): Promise<HrEmployeeResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    if (params?.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params?.search) q.set("search", params.search);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrEmployeeResponse[]>(`/api/v1/hr/employees${suffix}`);
  },
  async getHrEmployee(id: number): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}`);
  },
  async createHrEmployee(data: HrEmployeeCreate): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>("/api/v1/hr/employees", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrEmployee(id: number, data: HrEmployeeUpdate): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async activateHrEmployee(id: number): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}/activate`, { method: "POST" });
  },
  async deactivateHrEmployee(id: number): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}/deactivate`, { method: "POST" });
  },
  async listHrEmployeeDocuments(employeeId: number): Promise<HrEmployeeDocumentResponse[]> {
    return request<HrEmployeeDocumentResponse[]>(`/api/v1/hr/employees/${employeeId}/documents`);
  },
  async createHrEmployeeDocument(employeeId: number, data: HrEmployeeDocumentCreate): Promise<HrEmployeeDocumentResponse> {
    return request<HrEmployeeDocumentResponse>(`/api/v1/hr/employees/${employeeId}/documents`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrEmployeeStatusHistory(employeeId: number): Promise<HrEmployeeStatusHistoryResponse[]> {
    return request<HrEmployeeStatusHistoryResponse[]>(`/api/v1/hr/employees/${employeeId}/status-history`);
  },
  async createHrEmployeeStatusHistory(
    employeeId: number,
    data: HrEmployeeStatusHistoryCreate
  ): Promise<HrEmployeeStatusHistoryResponse> {
    return request<HrEmployeeStatusHistoryResponse>(`/api/v1/hr/employees/${employeeId}/status-history`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrDashboardData(): Promise<HrDashboardData> {
    return request<HrDashboardData>("/api/v1/hr/dashboard-data");
  },
  async listHrSections(params?: { active_only?: boolean }): Promise<HrSectionResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrSectionResponse[]>(`/api/v1/hr/sections${suffix}`);
  },
  async createHrSection(data: Record<string, unknown>): Promise<HrSectionResponse> {
    return request<HrSectionResponse>("/api/v1/hr/sections", { method: "POST", body: JSON.stringify(data) });
  },
  async updateHrSection(id: number, data: Record<string, unknown>): Promise<HrSectionResponse> {
    return request<HrSectionResponse>(`/api/v1/hr/sections/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  async exportHrEmployees(): Promise<Blob> {
    return requestBlob("/api/v1/hr/employees/export", { method: "GET" });
  },
  async importHrEmployees(file: File): Promise<{ created: number; updated: number; errors: string[] }> {
    const form = new FormData();
    form.append("file", file);
    return request<{ created: number; updated: number; errors: string[] }>("/api/v1/hr/employees/import", {
      method: "POST",
      body: form,
    });
  },
  async listHrComplianceChecks(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/compliance-checks");
  },
  async createHrComplianceCheck(data: Record<string, unknown>): Promise<{ id: number; ok: boolean }> {
    return request<{ id: number; ok: boolean }>("/api/v1/hr/compliance-checks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrComplianceFrameworks(): Promise<HrComplianceFramework[]> {
    return request<HrComplianceFramework[]>("/api/v1/hr/compliance/frameworks");
  },
  async activateHrComplianceFramework(id: number): Promise<HrComplianceFramework> {
    return request<HrComplianceFramework>(`/api/v1/hr/compliance/frameworks/${id}/activate`, { method: "POST" });
  },
  async listHrComplianceRequirements(frameworkId: number): Promise<HrComplianceRequirement[]> {
    return request<HrComplianceRequirement[]>(
      `/api/v1/hr/compliance/requirements?framework_id=${encodeURIComponent(String(frameworkId))}`,
    );
  },
  async listHrComplianceRecords(params?: {
    employee_id?: number;
    requirement_id?: number;
    framework_id?: number;
  }): Promise<HrEmployeeComplianceRecord[]> {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.requirement_id != null) q.set("requirement_id", String(params.requirement_id));
    if (params?.framework_id != null) q.set("framework_id", String(params.framework_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrEmployeeComplianceRecord[]>(`/api/v1/hr/compliance/records${suffix}`);
  },
  async createHrComplianceRecord(data: {
    employee_id: number;
    requirement_id: number;
    status?: string;
    evidence_document_id?: number | null;
    notes?: string | null;
  }): Promise<HrEmployeeComplianceRecord> {
    return request<HrEmployeeComplianceRecord>("/api/v1/hr/compliance/records", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrComplianceRecord(
    id: number,
    data: { status?: string; evidence_document_id?: number | null; notes?: string | null },
  ): Promise<HrEmployeeComplianceRecord> {
    return request<HrEmployeeComplianceRecord>(`/api/v1/hr/compliance/records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async getHrComplianceScore(frameworkId: number): Promise<HrComplianceScore> {
    return request<HrComplianceScore>(`/api/v1/hr/compliance/score/${frameworkId}`);
  },
  async getHrAuditReadiness(frameworkId: number): Promise<HrAuditReadiness> {
    return request<HrAuditReadiness>(`/api/v1/hr/compliance/audit-readiness/${frameworkId}`);
  },
  async listHrAgeVerifications(employeeId: number): Promise<HrAgeVerification[]> {
    return request<HrAgeVerification[]>(`/api/v1/hr/compliance/employees/${employeeId}/age-verifications`);
  },
  async createHrAgeVerification(
    employeeId: number,
    data: { verification_method: string; date_of_birth: string; document_id?: number | null; notes?: string | null },
  ): Promise<HrAgeVerification> {
    return request<HrAgeVerification>(`/api/v1/hr/compliance/employees/${employeeId}/age-verifications`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrMedicalRecords(employeeId: number): Promise<HrMedicalRecord[]> {
    return request<HrMedicalRecord[]>(`/api/v1/hr/compliance/employees/${employeeId}/medical-records`);
  },
  async createHrMedicalRecord(
    employeeId: number,
    data: {
      examination_date: string;
      fitness_status?: string;
      certificate_number?: string | null;
      expiry_date?: string | null;
      doctor_name?: string | null;
      doctor_registration?: string | null;
      hospital_clinic?: string | null;
      conditions?: string[] | null;
      restrictions?: string[] | null;
      document_id?: number | null;
    },
  ): Promise<HrMedicalRecord> {
    return request<HrMedicalRecord>(`/api/v1/hr/compliance/employees/${employeeId}/medical-records`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrMedicalRecord(
    employeeId: number,
    recordId: number,
    data: Partial<{
      examination_date: string;
      fitness_status: string;
      certificate_number: string | null;
      expiry_date: string | null;
      doctor_name: string | null;
      doctor_registration: string | null;
      hospital_clinic: string | null;
      conditions: string[] | null;
      restrictions: string[] | null;
      document_id: number | null;
    }>,
  ): Promise<HrMedicalRecord> {
    return request<HrMedicalRecord>(
      `/api/v1/hr/compliance/employees/${employeeId}/medical-records/${recordId}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
  },
  async generateHrIdCard(employeeId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/employees/${employeeId}/documents/id-card`, { method: "POST" });
  },
  /** Signed, versioned letter. Without `reissue` the latest version is returned again. */
  async generateHrAppointmentLetter(employeeId: number, opts?: { reissue?: boolean; requestId?: string }): Promise<Blob> {
    return requestBlob(
      `/api/v1/hr/employees/${employeeId}/documents/appointment-letter${signedDocQuery(opts)}`,
      { method: "POST" },
    );
  },
  async generateHrJobDescription(employeeId: number, opts?: { reissue?: boolean; requestId?: string }): Promise<Blob> {
    return requestBlob(
      `/api/v1/hr/employees/${employeeId}/documents/job-description${signedDocQuery(opts)}`,
      { method: "POST" },
    );
  },
  async listHrGeneratedDocuments(employeeId: number): Promise<HrGeneratedDocument[]> {
    return request<HrGeneratedDocument[]>(`/api/v1/hr/employees/${employeeId}/generated-documents`);
  },
  async downloadHrGeneratedDocument(documentId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/generated-documents/${documentId}/pdf`, { method: "GET" });
  },
  async getHrEmployeeAccess(): Promise<HrEmployeeAccess> {
    return request<HrEmployeeAccess>("/api/v1/hr/employee-access");
  },
  async getHrCompensationOptions(): Promise<HrCompensationOptions> {
    return request<HrCompensationOptions>("/api/v1/hr/compensation/options");
  },
  async previewHrCompensation(body: HrCompensationInput): Promise<HrCompensationPreview> {
    return request<HrCompensationPreview>("/api/v1/hr/compensation/preview", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getHrEmployeeCompensation(employeeId: number): Promise<HrEmployeeCompensationView> {
    return request<HrEmployeeCompensationView>(`/api/v1/hr/employees/${employeeId}/compensation`);
  },
  async replaceHrEmployeeCompensation(
    employeeId: number,
    body: HrCompensationInput & { effective_from: string },
  ): Promise<HrEmployeeCompensationView> {
    return request<HrEmployeeCompensationView>(`/api/v1/hr/employees/${employeeId}/compensation`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async startHrOnboarding(body: HrOnboardingRequest): Promise<HrOnboardingRun> {
    return request<HrOnboardingRun>("/api/v1/hr/onboarding", { method: "POST", body: JSON.stringify(body) });
  },
  async getHrOnboarding(requestId: string): Promise<HrOnboardingRun> {
    return request<HrOnboardingRun>(`/api/v1/hr/onboarding/${encodeURIComponent(requestId)}`);
  },
  async resumeHrOnboarding(requestId: string, body: HrOnboardingSteps): Promise<HrOnboardingRun> {
    return request<HrOnboardingRun>(`/api/v1/hr/onboarding/${encodeURIComponent(requestId)}/resume`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrOnboardingTasks(employeeId: number): Promise<HrOnboardingTask[]> {
    return request<HrOnboardingTask[]>(`/api/v1/hr/employees/${employeeId}/onboarding-tasks`);
  },
  async waiveHrOnboardingTask(taskId: number, reason: string): Promise<HrOnboardingTask> {
    return request<HrOnboardingTask>(`/api/v1/hr/onboarding-tasks/${taskId}/waive`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  async printHrGatePass(passId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/gate-passes/${passId}/print`, { method: "GET" });
  },
  async generateHrAgeVerificationCert(employeeId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/employees/${employeeId}/documents/age-verification-cert`, { method: "POST" });
  },
  async generateHrPayslipPdf(employeeId: number, runId: number): Promise<Blob> {
    return requestBlob(
      `/api/v1/hr/employees/${employeeId}/documents/payslip?run_id=${encodeURIComponent(String(runId))}`,
      { method: "POST" },
    );
  },
  async generateHrBulkIdCards(): Promise<Blob> {
    return requestBlob("/api/v1/hr/employees/bulk-documents/id-cards", { method: "POST" });
  },
  async listHrPerformanceCycles(): Promise<HrPerformanceCycleResponse[]> {
    return request<HrPerformanceCycleResponse[]>("/api/v1/hr/performance/cycles");
  },
  async createHrPerformanceCycle(data: Record<string, unknown>): Promise<HrPerformanceCycleResponse> {
    return request<HrPerformanceCycleResponse>("/api/v1/hr/performance/cycles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrPerformanceCycleStatus(cycleId: number, body: { status: string }): Promise<HrPerformanceCycleResponse> {
    return request<HrPerformanceCycleResponse>(`/api/v1/hr/performance/cycles/${cycleId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async submitHrGoal(goalId: number, body?: { manager_comment?: string | null }): Promise<HrGoalResponse> {
    return request<HrGoalResponse>(`/api/v1/hr/performance/goals/${goalId}/submit`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async submitHrReview(
    reviewId: number,
    body?: { manager_rating?: number | null; final_rating?: number | null; manager_comment?: string | null }
  ): Promise<HrReviewResponse> {
    return request<HrReviewResponse>(`/api/v1/hr/performance/reviews/${reviewId}/submit`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async listHrPayrollAccountingConfig(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/accounting-config");
  },
  async upsertHrPayrollAccountingConfig(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/accounting-config", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollAdvances(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/payroll/advances");
  },
  async createHrPayrollAdvance(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/advances", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollBonuses(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/payroll/bonuses");
  },
  async createHrPayrollBonus(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/bonuses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrShifts(params?: { active_only?: boolean }): Promise<HrShiftResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrShiftResponse[]>(`/api/v1/hr/attendance/shifts${suffix}`);
  },
  async createHrShift(data: HrShiftCreate): Promise<HrShiftResponse> {
    return request<HrShiftResponse>("/api/v1/hr/attendance/shifts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrShift(id: number, data: Partial<HrShiftCreate>): Promise<HrShiftResponse> {
    return request<HrShiftResponse>(`/api/v1/hr/attendance/shifts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrRosterEntries(params?: {
    roster_date?: string;
    employee_id?: number;
  }): Promise<HrRosterEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.roster_date) q.set("roster_date", params.roster_date);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrRosterEntryResponse[]>(`/api/v1/hr/attendance/rosters${suffix}`);
  },
  async createHrRosterEntry(data: HrRosterEntryCreate): Promise<HrRosterEntryResponse> {
    return request<HrRosterEntryResponse>("/api/v1/hr/attendance/rosters", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrRosterEntry(id: number, data: HrRosterEntryUpdate): Promise<HrRosterEntryResponse> {
    return request<HrRosterEntryResponse>(`/api/v1/hr/attendance/rosters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrAttendanceEntries(params?: {
    attendance_date?: string;
    employee_id?: number;
    status_filter?: string;
  }): Promise<HrAttendanceEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.attendance_date) q.set("attendance_date", params.attendance_date);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceEntryResponse[]>(`/api/v1/hr/attendance/entries${suffix}`);
  },
  async createHrAttendanceEntry(data: HrAttendanceEntryCreate): Promise<HrAttendanceEntryResponse> {
    return request<HrAttendanceEntryResponse>("/api/v1/hr/attendance/entries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrAttendanceEntry(id: number, data: HrAttendanceEntryUpdate): Promise<HrAttendanceEntryResponse> {
    return request<HrAttendanceEntryResponse>(`/api/v1/hr/attendance/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrRegularizations(params?: { status_filter?: string }): Promise<HrRegularizationResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrRegularizationResponse[]>(`/api/v1/hr/attendance/regularizations${suffix}`);
  },
  async createHrRegularization(data: HrRegularizationCreate): Promise<HrRegularizationResponse> {
    return request<HrRegularizationResponse>("/api/v1/hr/attendance/regularizations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveHrRegularization(id: number, body?: HrRegularizationDecision): Promise<HrRegularizationResponse> {
    return request<HrRegularizationResponse>(`/api/v1/hr/attendance/regularizations/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async rejectHrRegularization(id: number, body?: HrRegularizationDecision): Promise<HrRegularizationResponse> {
    return request<HrRegularizationResponse>(`/api/v1/hr/attendance/regularizations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async postHrAttendanceEntriesBulk(body: HrAttendanceBulkEntryBody): Promise<{ ok: boolean; created: number }> {
    return request<{ ok: boolean; created: number }>("/api/v1/hr/attendance/entries/bulk", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrAttendanceSummary(params?: { month?: string; department_id?: number }): Promise<HrAttendanceSummaryRow[]> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceSummaryRow[]>(`/api/v1/hr/attendance/summary${suffix}`);
  },
  async listHrHolidays(params?: { year?: number }): Promise<HrHolidayResponse[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrHolidayResponse[]>(`/api/v1/hr/attendance/holidays${suffix}`);
  },
  async createHrHoliday(data: Record<string, unknown>): Promise<HrHolidayResponse> {
    return request<HrHolidayResponse>("/api/v1/hr/attendance/holidays", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrHoliday(id: number, data: HrHolidayUpdate): Promise<HrHolidayResponse> {
    return request<HrHolidayResponse>(`/api/v1/hr/attendance/holidays/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrOvertimeRules(): Promise<HrOvertimeRuleResponse[]> {
    return request<HrOvertimeRuleResponse[]>("/api/v1/hr/attendance/overtime-rules");
  },
  async createHrOvertimeRule(data: Record<string, unknown>): Promise<HrOvertimeRuleResponse> {
    return request<HrOvertimeRuleResponse>("/api/v1/hr/attendance/overtime-rules", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrOvertimeRule(id: number, data: HrOvertimeRuleUpdate): Promise<HrOvertimeRuleResponse> {
    return request<HrOvertimeRuleResponse>(`/api/v1/hr/attendance/overtime-rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrOvertimeEntries(params?: { status?: string }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status_filter", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<Record<string, unknown>[]>(`/api/v1/hr/attendance/overtime${suffix}`);
  },
  async createHrOvertimeEntry(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/attendance/overtime", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveHrOvertimeEntry(id: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/hr/attendance/overtime/${id}/approve`, { method: "POST" });
  },
  async listHrLeavePolicies(): Promise<HrLeavePolicyResponse[]> {
    return request<HrLeavePolicyResponse[]>("/api/v1/hr/leave/policies");
  },
  async updateHrLeavePolicy(id: number, data: HrLeavePolicyUpdate): Promise<HrLeavePolicyResponse> {
    return request<HrLeavePolicyResponse>(`/api/v1/hr/leave/policies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async postHrLeaveBalanceUpsert(data: HrLeaveBalanceUpsert): Promise<HrLeaveBalanceResponse> {
    return request<HrLeaveBalanceResponse>("/api/v1/hr/leave/balances/upsert", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrLeaveCalendarData(params: { year: number; month: number }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams({ year: String(params.year), month: String(params.month) });
    return request<Record<string, unknown>[]>(`/api/v1/hr/leave/calendar-data?${q.toString()}`);
  },
  async postHrLeaveCarryForward(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/leave/balances/carry-forward", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async postHrLeaveEncashment(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/leave/encashment", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrLeaveTypes(params?: { active_only?: boolean }): Promise<HrLeaveTypeResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveTypeResponse[]>(`/api/v1/hr/leave/types${suffix}`);
  },
  async createHrLeaveType(data: HrLeaveTypeCreate): Promise<HrLeaveTypeResponse> {
    return request<HrLeaveTypeResponse>("/api/v1/hr/leave/types", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrLeaveType(id: number, data: HrLeaveTypeUpdate): Promise<HrLeaveTypeResponse> {
    return request<HrLeaveTypeResponse>(`/api/v1/hr/leave/types/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrLeaveBalances(params?: { balance_year?: number; employee_id?: number }): Promise<HrLeaveBalanceResponse[]> {
    const q = new URLSearchParams();
    if (params?.balance_year != null) q.set("balance_year", String(params.balance_year));
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveBalanceResponse[]>(`/api/v1/hr/leave/balances${suffix}`);
  },
  async listHrLeaveRequests(params?: { status_filter?: string; employee_id?: number }): Promise<HrLeaveRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveRequestResponse[]>(`/api/v1/hr/leave/requests${suffix}`);
  },
  async createHrLeaveRequest(data: HrLeaveRequestCreate): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>("/api/v1/hr/leave/requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrLeaveRequest(id: number, data: HrLeaveRequestUpdate): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async submitHrLeaveRequest(id: number): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}/submit`, { method: "POST" });
  },
  async decideHrLeaveRequest(id: number, decision: "approved" | "rejected", note?: string): Promise<HrLeaveRequestResponse> {
    const actionPath = decision === "approved" ? "approve" : "reject";
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}/${actionPath}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },
  async listHrPayrollComponents(params?: { active_only?: boolean }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<Record<string, unknown>[]>(`/api/v1/hr/payroll/components${suffix}`);
  },
  async createHrPayrollComponent(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/components", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrPayrollComponent(id: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/hr/payroll/components/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollPeriods(): Promise<HrPayrollPeriodResponse[]> {
    return request<HrPayrollPeriodResponse[]>("/api/v1/hr/payroll/periods");
  },
  async createHrPayrollPeriod(data: HrPayrollPeriodCreate): Promise<HrPayrollPeriodResponse> {
    return request<HrPayrollPeriodResponse>("/api/v1/hr/payroll/periods", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async finalizeHrPayrollPeriod(periodId: number): Promise<HrPayrollPeriodResponse> {
    return request<HrPayrollPeriodResponse>(`/api/v1/hr/payroll/periods/${periodId}/finalize`, { method: "POST" });
  },
  async listHrSalaryStructures(params?: { active_only?: boolean }): Promise<HrSalaryStructureResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrSalaryStructureResponse[]>(`/api/v1/hr/payroll/structures${suffix}`);
  },
  async createHrSalaryStructure(data: HrSalaryStructureCreate): Promise<HrSalaryStructureResponse> {
    return request<HrSalaryStructureResponse>("/api/v1/hr/payroll/structures", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrSalaryStructure(id: number, data: HrSalaryStructureUpdate): Promise<HrSalaryStructureResponse> {
    return request<HrSalaryStructureResponse>(`/api/v1/hr/payroll/structures/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async updateHrSalaryStructureLine(
    structureId: number,
    lineId: number,
    data: HrPayrollStructureLineUpdate
  ): Promise<HrPayrollStructureLineResponse> {
    return request<HrPayrollStructureLineResponse>(`/api/v1/hr/payroll/structures/${structureId}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteHrSalaryStructureLine(structureId: number, lineId: number): Promise<void> {
    return request<void>(`/api/v1/hr/payroll/structures/${structureId}/lines/${lineId}?confirm=true`, {
      method: "DELETE",
    });
  },
  async listHrSalaryStructureLines(structureId: number): Promise<HrPayrollStructureLineResponse[]> {
    return request<HrPayrollStructureLineResponse[]>(`/api/v1/hr/payroll/structures/${structureId}/lines`);
  },
  async createHrSalaryStructureLine(
    structureId: number,
    data: HrPayrollStructureLineCreate
  ): Promise<HrPayrollStructureLineResponse> {
    return request<HrPayrollStructureLineResponse>(`/api/v1/hr/payroll/structures/${structureId}/lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollRuns(params?: { period_id?: number; status_filter?: string }): Promise<HrPayrollRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.period_id != null) q.set("period_id", String(params.period_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollRunResponse[]>(`/api/v1/hr/payroll/runs${suffix}`);
  },
  async createHrPayrollRun(data: HrPayrollRunCreate): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>("/api/v1/hr/payroll/runs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollApprovals(params?: { status?: string }): Promise<HrPayrollApprovalResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollApprovalResponse[]>(`/api/v1/hr/payroll/approvals${suffix}`);
  },
  async decideHrPayrollApproval(id: number, decision: "approved" | "rejected", note?: string): Promise<HrPayrollApprovalResponse> {
    return request<HrPayrollApprovalResponse>(`/api/v1/hr/payroll/approvals/${id}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ decision, note }),
    });
  },
  async listHrPayslips(params?: { run_id?: number; employee_id?: number }): Promise<HrPayslipResponse[]> {
    const q = new URLSearchParams();
    if (params?.run_id != null) q.set("run_id", String(params.run_id));
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayslipResponse[]>(`/api/v1/hr/payroll/payslips${suffix}`);
  },
  async downloadHrPayslipPdf(payslipId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/payroll/payslips/${payslipId}/pdf`, { method: "GET" });
  },
  async downloadHrPayrollRunBankFile(runId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/payroll/runs/${runId}/bank-file`, { method: "GET" });
  },
  async postHrPayrollRun(
    runId: number,
    body?: { note?: string | null; payroll_expense_account_id?: number | null; payroll_payable_account_id?: number | null }
  ): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/hr/payroll/runs/${runId}/post`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async listHrPayrollRunLines(runId: number): Promise<HrPayrollRunLineResponse[]> {
    return request<HrPayrollRunLineResponse[]>(`/api/v1/hr/payroll/runs/${runId}/lines`);
  },
  async listHrPayrollAssignments(params?: { employee_id?: number }): Promise<HrPayrollAssignmentResponse[]> {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollAssignmentResponse[]>(`/api/v1/hr/payroll/assignments${suffix}`);
  },
  async createHrPayrollAssignment(data: HrPayrollAssignmentCreate): Promise<HrPayrollAssignmentResponse> {
    return request<HrPayrollAssignmentResponse>("/api/v1/hr/payroll/assignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async endHrPayrollAssignment(
    assignmentId: number,
    body?: { effective_to?: string | null }
  ): Promise<HrPayrollAssignmentResponse> {
    return request<HrPayrollAssignmentResponse>(`/api/v1/hr/payroll/assignments/${assignmentId}/end`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async previewHrPayrollAutoCalculate(runId: number): Promise<HrPayrollAutoCalcPreview> {
    return request<HrPayrollAutoCalcPreview>(`/api/v1/hr/payroll/runs/${runId}/auto-calculate/preview`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async getPayrollStatutoryConfig(): Promise<PayrollStatutoryConfigResponse> {
    return request<PayrollStatutoryConfigResponse>("/api/v1/hr/payroll/statutory-config");
  },
  async updatePayrollStatutoryConfig(
    data: PayrollStatutoryConfigBody,
  ): Promise<PayrollStatutoryConfigResponse> {
    return request<PayrollStatutoryConfigResponse>("/api/v1/hr/payroll/statutory-config", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async previewPayrollStatutoryConfig(
    data: PayrollStatutoryPreviewBody,
  ): Promise<PayrollStatutoryPreviewResponse> {
    return request<PayrollStatutoryPreviewResponse>("/api/v1/hr/payroll/statutory-config/preview", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async applyHrPayrollAutoCalculate(
    runId: number,
    body?: { employee_ids?: number[] | null; force?: boolean; overwrite_confirm?: boolean }
  ): Promise<HrPayrollAutoCalcApplyResult> {
    return request<HrPayrollAutoCalcApplyResult>(`/api/v1/hr/payroll/runs/${runId}/auto-calculate/apply`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async upsertHrPayrollRunLine(runId: number, data: HrPayrollRunLineUpsert): Promise<HrPayrollRunLineResponse> {
    return request<HrPayrollRunLineResponse>(`/api/v1/hr/payroll/runs/${runId}/lines/upsert`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async finalizeHrPayrollRun(runId: number): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>(`/api/v1/hr/payroll/runs/${runId}/finalize`, { method: "POST" });
  },
  async approveHrPayrollRun(runId: number, body?: { note?: string | null }): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>(`/api/v1/hr/payroll/runs/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async rejectHrPayrollRun(runId: number, body?: { note?: string | null }): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>(`/api/v1/hr/payroll/runs/${runId}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async generateHrPayrollPayslips(runId: number): Promise<{ ok: boolean; created: number }> {
    return request<{ ok: boolean; created: number }>(`/api/v1/hr/payroll/runs/${runId}/generate-payslips`, {
      method: "POST",
    });
  },
  async listHrGoals(params?: { employee_id?: number; status?: string }): Promise<HrGoalResponse[]> {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrGoalResponse[]>(`/api/v1/hr/performance/goals${suffix}`);
  },
  async createHrGoal(data: HrGoalCreate): Promise<HrGoalResponse> {
    return request<HrGoalResponse>("/api/v1/hr/performance/goals", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrReviews(params?: { employee_id?: number; status?: string }): Promise<HrReviewResponse[]> {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrReviewResponse[]>(`/api/v1/hr/performance/reviews${suffix}`);
  },
  async createHrReview(data: HrReviewCreate): Promise<HrReviewResponse> {
    return request<HrReviewResponse>("/api/v1/hr/performance/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrPerformanceDashboard(params?: { month?: string }): Promise<HrPerformanceDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPerformanceDashboardResponse>(`/api/v1/hr/performance/dashboard${suffix}`);
  },
  async listHrJobRequisitions(params?: { status?: string }): Promise<HrJobRequisitionResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrJobRequisitionResponse[]>(`/api/v1/hr/recruitment/requisitions${suffix}`);
  },
  async createHrJobRequisition(data: HrJobRequisitionCreate): Promise<HrJobRequisitionResponse> {
    return request<HrJobRequisitionResponse>("/api/v1/hr/recruitment/requisitions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrJobRequisitionStatus(requisitionId: number, body: { status: string }): Promise<HrJobRequisitionResponse> {
    return request<HrJobRequisitionResponse>(`/api/v1/hr/recruitment/requisitions/${requisitionId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async postHrCandidateStage(
    candidateId: number,
    body: { stage: string; status?: string | null }
  ): Promise<HrCandidateResponse> {
    return request<HrCandidateResponse>(`/api/v1/hr/recruitment/candidates/${candidateId}/stage`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrCandidates(params?: { stage?: string }): Promise<HrCandidateResponse[]> {
    const q = new URLSearchParams();
    if (params?.stage) q.set("stage", params.stage);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrCandidateResponse[]>(`/api/v1/hr/recruitment/candidates${suffix}`);
  },
  async createHrCandidate(data: HrCandidateCreate): Promise<HrCandidateResponse> {
    return request<HrCandidateResponse>("/api/v1/hr/recruitment/candidates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrInterviews(params?: { candidate_id?: number }): Promise<HrInterviewResponse[]> {
    const q = new URLSearchParams();
    if (params?.candidate_id != null) q.set("candidate_id", String(params.candidate_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrInterviewResponse[]>(`/api/v1/hr/recruitment/interviews${suffix}`);
  },
  async createHrInterview(data: HrInterviewCreate): Promise<HrInterviewResponse> {
    return request<HrInterviewResponse>("/api/v1/hr/recruitment/interviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrInterviewStatus(
    interviewId: number,
    body: { status: string; feedback?: string | null; rating?: number | null }
  ): Promise<HrInterviewResponse> {
    return request<HrInterviewResponse>(`/api/v1/hr/recruitment/interviews/${interviewId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrOffers(params?: { status?: string }): Promise<HrOfferResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrOfferResponse[]>(`/api/v1/hr/recruitment/offers${suffix}`);
  },
  async createHrOffer(data: HrOfferCreate): Promise<HrOfferResponse> {
    return request<HrOfferResponse>("/api/v1/hr/recruitment/offers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrOfferStatus(offerId: number, body: { status: string }): Promise<HrOfferResponse> {
    return request<HrOfferResponse>(`/api/v1/hr/recruitment/offers/${offerId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getHrEssMyProfile(): Promise<HrEssProfileResponse> {
    return request<HrEssProfileResponse>("/api/v1/hr/ess/my-profile");
  },
  async updateHrEssMyProfile(data: HrEssProfileUpdate): Promise<HrEssProfileResponse> {
    return request<HrEssProfileResponse>("/api/v1/hr/ess/my-profile", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrEssMyAttendance(params?: { from_date?: string; to_date?: string }): Promise<HrAttendanceEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceEntryResponse[]>(`/api/v1/hr/ess/my-attendance-summary${suffix}`);
  },
  async listHrEssMyLeaveRequests(params?: { status?: string }): Promise<HrLeaveRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveRequestResponse[]>(`/api/v1/hr/ess/my-leave-requests${suffix}`);
  },
  async createHrEssMyLeaveRequest(data: Omit<HrLeaveRequestCreate, "employee_id">): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>("/api/v1/hr/ess/my-leave-requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrEssMyPayslips(params?: { year?: number }): Promise<HrPayslipResponse[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayslipResponse[]>(`/api/v1/hr/ess/my-payslips${suffix}`);
  },
  async listHrEssMyTickets(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/ess/my-tickets");
  },
  async createHrEssMyTicket(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/ess/my-tickets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrReportSummary(params?: { month?: string }): Promise<HrReportSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrReportSummaryResponse>(`/api/v1/hr/reports/summary${suffix}`);
  },
  async listHrAttendanceReport(params?: { month?: string; department_id?: number }): Promise<HrAttendanceReportRow[]> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceReportRow[]>(`/api/v1/hr/reports/attendance${suffix}`);
  },
  async listHrLeaveReport(params?: { year?: number }): Promise<HrLeaveReportRow[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveReportRow[]>(`/api/v1/hr/reports/leave${suffix}`);
  },
  async listHrPayrollReport(params?: { year?: number }): Promise<HrPayrollReportRow[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollReportRow[]>(`/api/v1/hr/reports/payroll${suffix}`);
  },
};
