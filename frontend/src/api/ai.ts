/**
 * AI tools (assistant reports, extraction, governed AI, ERP AI) API calls.
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types live in `api/models.ts` (re-exported by `api/client.ts`).
 */
import { request } from "@/api/core";
import { type CustomerExtractionResponse, type InquiryExtractionResponse, type LcExtractionResponse, type ShippingDocExtractionResponse } from "@/types/extraction";
import type {
  AiActionRunResponse,
  AiAnomalyEventResponse,
  AiAnomalyGenerateResponse,
  AiApprovalArtifactCommitResult,
  AiApprovalArtifactResponse,
  AiAutomationRuleRow,
  AiDataQualityScanResponse,
  AiFeedbackResponse,
  AiFeedbackSubmitBody,
  AiFinanceForecastResponse,
  AiForecastRunResponse,
  AiForecastSummaryResponse,
  AiForecastTemplateInfo,
  AiGovernanceProposal,
  AiKnowledgeDocumentResponse,
  AiKnowledgeQueryResponse,
  AiOpsOverviewResponse,
  AiQuickActionsResponse,
  AiReportRunResponse,
  AiWeeklyReportGenerateResult,
  AiWeeklyReportItem,
  AiWeeklyReportStatus,
  GovernedExceptions,
  HrDocExtractionResponse,
  MetricAnswer,
  MetricMeta,
  MetricValue,
  OwnerBrief,
} from "@/api/models";

export const aiApi = {
  // AI Tool module
  async aiQuickActions(): Promise<AiQuickActionsResponse> {
    return request<AiQuickActionsResponse>("/api/v1/ai-tool/quick-actions");
  },
  async aiListReportRuns(params?: { limit?: number }): Promise<AiReportRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiReportRunResponse[]>(`/api/v1/ai-tool/report-runs${suffix}`);
  },
  async aiGenerateReport(data: { prompt: string; session_id?: number | null }): Promise<AiReportRunResponse> {
    return request<AiReportRunResponse>("/api/v1/ai-tool/report-runs/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiListForecastRuns(params?: {
    limit?: number;
    offset?: number;
    forecast_code?: string;
    status?: string[];
    since?: string;
    until?: string;
    min_confidence?: number;
  }): Promise<AiForecastRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.forecast_code) q.set("forecast_code", params.forecast_code);
    (params?.status ?? []).forEach((s) => q.append("status", s));
    if (params?.since) q.set("since", params.since);
    if (params?.until) q.set("until", params.until);
    if (params?.min_confidence != null) q.set("min_confidence", String(params.min_confidence));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiForecastRunResponse[]>(`/api/v1/ai-tool/forecast-runs${suffix}`);
  },
  async aiListForecastTemplates(): Promise<AiForecastTemplateInfo[]> {
    return request<AiForecastTemplateInfo[]>("/api/v1/ai-tool/forecast-templates");
  },
  async aiGetForecastSummary(): Promise<AiForecastSummaryResponse> {
    return request<AiForecastSummaryResponse>("/api/v1/ai-tool/forecast-runs/summary");
  },
  async aiGetForecastRun(id: number): Promise<AiForecastRunResponse> {
    return request<AiForecastRunResponse>(`/api/v1/ai-tool/forecast-runs/${id}`);
  },
  async aiDeleteForecastRun(id: number): Promise<void> {
    return request<void>(`/api/v1/ai-tool/forecast-runs/${id}`, { method: "DELETE" });
  },
  async aiGenerateForecast(data: {
    prompt: string;
    session_id?: number | null;
    horizon_days?: number;
    from_date?: string | null;
    to_date?: string | null;
  }): Promise<AiForecastRunResponse> {
    return request<AiForecastRunResponse>("/api/v1/ai-tool/forecast-runs/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiFinanceForecast(data?: {
    horizon_days?: number;
    from_date?: string | null;
    to_date?: string | null;
  }): Promise<AiFinanceForecastResponse> {
    return request<AiFinanceForecastResponse>("/api/v1/ai-tool/finance/forecast", {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  async aiKnowledgeQuery(data: { query: string; top_k?: number }): Promise<AiKnowledgeQueryResponse> {
    return request<AiKnowledgeQueryResponse>("/api/v1/ai-tool/knowledge/query", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiListKnowledgeDocuments(params?: { limit?: number }): Promise<AiKnowledgeDocumentResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiKnowledgeDocumentResponse[]>(`/api/v1/ai-tool/knowledge/documents${suffix}`);
  },
  async aiListActionRuns(params?: { limit?: number }): Promise<AiActionRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiActionRunResponse[]>(`/api/v1/ai-tool/actions/runs${suffix}`);
  },
  async aiProposeAction(data: { prompt: string; session_id?: number | null }): Promise<AiActionRunResponse> {
    return request<AiActionRunResponse>("/api/v1/ai-tool/actions/propose", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiConfirmAction(actionRunId: number, data: { confirmation_token: string }): Promise<AiActionRunResponse> {
    return request<AiActionRunResponse>(`/api/v1/ai-tool/actions/${actionRunId}/confirm`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiListAnomalyEvents(params?: { limit?: number }): Promise<AiAnomalyEventResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiAnomalyEventResponse[]>(`/api/v1/ai-tool/anomalies/events${suffix}`);
  },
  async aiGenerateAnomalyInsights(data?: { session_id?: number | null }): Promise<AiAnomalyGenerateResponse> {
    return request<AiAnomalyGenerateResponse>("/api/v1/ai-tool/anomalies/generate", {
      method: "POST",
      body: JSON.stringify({ session_id: data?.session_id ?? null }),
    });
  },
  async aiOpsOverview(params?: { period_hours?: number }): Promise<AiOpsOverviewResponse> {
    const q = new URLSearchParams();
    if (params?.period_hours != null) q.set("period_hours", String(params.period_hours));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiOpsOverviewResponse>(`/api/v1/ai-tool/ops/overview${suffix}`);
  },
  async aiDataQualityScan(): Promise<AiDataQualityScanResponse> {
    return request<AiDataQualityScanResponse>("/api/v1/ai-tool/data-quality-scan", { method: "POST" });
  },
  async aiListWeeklyReports(params?: { limit?: number }): Promise<{ items: AiWeeklyReportItem[] }> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ items: AiWeeklyReportItem[] }>(`/api/v1/ai-tool/weekly-reports${suffix}`);
  },
  async aiGetWeeklyReportsStatus(): Promise<AiWeeklyReportStatus> {
    return request<AiWeeklyReportStatus>("/api/v1/ai-tool/weekly-reports/status");
  },
  async aiGetWeeklyReport(reportId: number): Promise<AiWeeklyReportItem> {
    return request<AiWeeklyReportItem>(`/api/v1/ai-tool/weekly-reports/${reportId}`);
  },
  async aiGenerateWeeklyReport(body?: { force?: boolean; target_date?: string }): Promise<AiWeeklyReportGenerateResult> {
    return request<AiWeeklyReportGenerateResult>("/api/v1/ai-tool/weekly-reports/generate", {
      method: "POST",
      body: JSON.stringify({
        force: body?.force ?? false,
        target_date: body?.target_date ?? null,
      }),
    });
  },
  async aiSubmitFeedback(body: AiFeedbackSubmitBody): Promise<AiFeedbackResponse> {
    return request<AiFeedbackResponse>("/api/v1/ai-tool/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async aiListArtifacts(params?: { status?: string; limit?: number }): Promise<AiApprovalArtifactResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiApprovalArtifactResponse[]>(`/api/v1/ai-tool/artifacts${suffix}`);
  },
  async aiGetArtifact(artifactId: number): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}`);
  },
  async aiApproveArtifact(artifactId: number, data?: { comments?: string | null }): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}/approve`, {
      method: "POST",
      body: JSON.stringify({ comments: data?.comments ?? null }),
    });
  },
  async aiRejectArtifact(artifactId: number, data?: { comments?: string | null }): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}/reject`, {
      method: "POST",
      body: JSON.stringify({ comments: data?.comments ?? null }),
    });
  },
  async aiCommitArtifact(artifactId: number): Promise<AiApprovalArtifactCommitResult> {
    return request<AiApprovalArtifactCommitResult>(`/api/v1/ai-tool/artifacts/${artifactId}/commit`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async aiRollbackArtifact(artifactId: number, data: { reason: string }): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ reason: data.reason }),
    });
  },
  async getHrAttendanceAnalysis(params?: { department_id?: number; days?: number }): Promise<Record<string, unknown>> {
    const q = new URLSearchParams();
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    if (params?.days != null) q.set("days", String(params.days));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<Record<string, unknown>>(`/api/v1/ai-tool/hr/attendance-analysis${suffix}`);
  },
  async getHrTurnoverRisk(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/ai-tool/hr/turnover-risk");
  },
  async getHrPayrollAnomalies(runId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(
      `/api/v1/ai-tool/hr/payroll-anomalies?run_id=${encodeURIComponent(String(runId))}`,
    );
  },
  async getHrComplianceRisk(frameworkId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(
      `/api/v1/ai-tool/hr/compliance-risk?framework_id=${encodeURIComponent(String(frameworkId))}`,
    );
  },
  async getGovernedExceptions(): Promise<GovernedExceptions> {
    return request<GovernedExceptions>("/api/v1/governed-ai/exceptions");
  },
  async confirmGovernedException(body: {
    key: string;
    decision: "notify" | "dismiss";
    note?: string | null;
  }): Promise<{ ok: boolean; decision: string; recipients: number }> {
    return request("/api/v1/governed-ai/exceptions/confirm", { method: "POST", body: JSON.stringify(body) });
  },
  async getOwnerBrief(useAi = true): Promise<OwnerBrief> {
    return request<OwnerBrief>(`/api/v1/governed-ai/owner-brief?use_ai=${useAi ? "true" : "false"}`);
  },
  async sendOwnerBrief(narrative: string): Promise<{ ok: boolean; recipients: number }> {
    return request("/api/v1/governed-ai/owner-brief/send", { method: "POST", body: JSON.stringify({ narrative }) });
  },
  async listMetrics(): Promise<{ items: MetricMeta[] }> {
    return request("/api/v1/governed-ai/metrics");
  },
  async getMetric(id: string): Promise<MetricValue> {
    return request<MetricValue>(`/api/v1/governed-ai/metrics/${encodeURIComponent(id)}`);
  },
  async askMetric(question: string): Promise<MetricAnswer> {
    return request<MetricAnswer>("/api/v1/governed-ai/metrics/ask", { method: "POST", body: JSON.stringify({ question }) });
  },
  /** Phase 16 — document vs ERP field compare (no writes). */
  async postDocumentAiValidate(body: {
    entity_type: string;
    entity_id: number;
    extracted_fields: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/erp-ai/document/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** Phase 19 — whitelisted read-only intents only. */
  async postErpAiCopilotSafeQuery(body: { intent: string }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/erp-ai/copilot/safe-query", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** Phase 20 — propose a rule-based automation (approval required; no execution in this endpoint). */
  async postErpAiGovernanceProposal(body: {
    rule_code: string;
    payload_json?: Record<string, unknown> | null;
    idempotency_key?: string | null;
  }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/erp-ai/governance/proposals", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async postErpAiGovernanceApprove(proposalId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/erp-ai/governance/proposals/${proposalId}/approve`, {
      method: "POST",
    });
  },
  async postErpAiGovernanceReject(
    proposalId: number,
    body?: { reason?: string | null }
  ): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/erp-ai/governance/proposals/${proposalId}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async postErpAiGovernanceRollback(proposalId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/erp-ai/governance/proposals/${proposalId}/rollback`, {
      method: "POST",
    });
  },
  async getErpAiGovernanceProposals(params?: {
    status_filter?: "proposed" | "approved" | "rejected" | "rolled_back" | "all" | string;
    limit?: number;
    offset?: number;
  }): Promise<AiGovernanceProposal[]> {
    const q = new URLSearchParams();
    if (params?.status_filter != null) q.set("status_filter", params.status_filter);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiGovernanceProposal[]>(`/api/v1/erp-ai/governance/proposals${suffix}`);
  },
  async aiListAutomationRules(): Promise<AiAutomationRuleRow[]> {
    return request<AiAutomationRuleRow[]>("/api/v1/ai-tool/automation/rules");
  },
  async extractCustomerForm(file: File): Promise<CustomerExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<CustomerExtractionResponse>("/api/v1/ai-extract/customer-form", {
      method: "POST",
      body: fd,
    });
  },
  async extractInquiryForm(file: File): Promise<InquiryExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<InquiryExtractionResponse>("/api/v1/ai-extract/inquiry-form", {
      method: "POST",
      body: fd,
    });
  },
  async extractLcDocument(file: File): Promise<LcExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<LcExtractionResponse>("/api/v1/ai-extract/lc", {
      method: "POST",
      body: fd,
    });
  },
  async extractShippingDocument(
    file: File,
    opts?: { type?: "bl" | "awb" | "packing_list" },
  ): Promise<ShippingDocExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    const q = opts?.type ? `?type=${encodeURIComponent(opts.type)}` : "";
    return request<ShippingDocExtractionResponse>(`/api/v1/ai-extract/shipping-doc${q}`, {
      method: "POST",
      body: fd,
    });
  },
  async extractHrCv(file: File): Promise<HrDocExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<HrDocExtractionResponse>("/api/v1/ai-extract/hr/cv", { method: "POST", body: fd });
  },
  async extractHrNationalId(file: File): Promise<HrDocExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<HrDocExtractionResponse>("/api/v1/ai-extract/hr/national-id", { method: "POST", body: fd });
  },
  async extractHrMedicalCertificate(file: File): Promise<HrDocExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<HrDocExtractionResponse>("/api/v1/ai-extract/hr/medical-certificate", {
      method: "POST",
      body: fd,
    });
  },
  async extractHrBirthCertificate(file: File): Promise<HrDocExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<HrDocExtractionResponse>("/api/v1/ai-extract/hr/birth-certificate", {
      method: "POST",
      body: fd,
    });
  },

  // ── Production (garment manufacturing) ──
};
