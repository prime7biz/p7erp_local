/**
 * Production, manufacturing and facility API calls.
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types live in `api/models.ts` (re-exported by `api/client.ts`).
 */
import { request, requestBlob } from "@/api/core";
import type {
  CountryHolidaysPreviewResponse,
  EmiPreviewResponse,
  FacilityRow,
  FacilityUtilizationRow,
  FactoryCalendarOverrideRow,
  MfgActualCostResponse,
  MfgCapaCreate,
  MfgCapaResponse,
  MfgCapaStatusUpdate,
  MfgCapacityLoadRow,
  MfgCostSnapshotResponse,
  MfgDowntimeCreate,
  MfgDowntimeReasonRow,
  MfgDowntimeResponse,
  MfgDowntimeTrendRow,
  MfgExecutionDashboardResponse,
  MfgFreezeSnapshotCreate,
  MfgMasterOperationCreate,
  MfgMasterOperationResponse,
  MfgMasterOperationUpdate,
  MfgMaterialReturnResponse,
  MfgMrpRecommendationResponse,
  MfgMrpRunCreate,
  MfgMrpRunResponse,
  MfgNcrCreate,
  MfgNcrResponse,
  MfgOperationAssignCreate,
  MfgOperationAssignmentResponse,
  MfgOperationQueueRow,
  MfgProductionPlanCreate,
  MfgProductionPlanResponse,
  MfgQualityCheckCreate,
  MfgQualityCheckResponse,
  MfgSampleRequestCreate,
  MfgSampleRequestResponse,
  MfgSampleRequestUpdate,
  MfgTnaDashboardSummary,
  MfgTnaPlanCreate,
  MfgTnaPlanResponse,
  MfgTnaPlanTaskResponse,
  MfgTnaPlanTaskUpdate,
  MfgTnaTemplateCreate,
  MfgTnaTemplateResponse,
  MfgTnaTemplateTaskCreate,
  MfgTnaTemplateTaskResponse,
  MfgVarianceResponse,
  MfgWorkOrderResponse,
  PredictiveHeuristicResponse,
  QualityDashboardResponse,
  WorkOrderOperationResponseApi,
} from "@/api/models";

export const productionApi = {
  async getScanSetup(): Promise<{
    lines: { id: number; line_code: string; name: string }[];
    orders: { id: number; order_code: string; style_ref: string | null }[];
  }> {
    return request("/api/v1/production/scan/setup");
  },
  async getScanOperations(orderId: number): Promise<{
    order_id: number;
    order_code: string;
    ob_code: string | null;
    operations: { id: number; sequence_no: number; operation_name: string; smv: string; is_critical: boolean }[];
  }> {
    return request(`/api/v1/production/scan/orders/${orderId}/operations`);
  },
  async uploadScans(body: { device_id: string; scans: unknown[] }): Promise<{
    results: { client_key: string; status: "accepted" | "duplicate" | "already_scanned" | "error"; message?: string | null; bundle_no?: string | null; operation_name?: string | null; pieces?: number | null }[];
    accepted: number;
  }> {
    return request("/api/v1/production/scan/batch", { method: "POST", body: JSON.stringify(body) });
  },
  async getScanSummary(params: { sewing_line_id?: number; order_id?: number }): Promise<{
    day: string;
    total_pieces: number;
    earned_minutes: string;
    hours: { hour: number; pieces: number; earned_minutes: string }[];
    operations: { operation_name: string; pieces: number }[];
    operators: { operator_code: string; pieces: number; earned_minutes: string }[];
  }> {
    const q = new URLSearchParams({ tz_offset_minutes: String(-new Date().getTimezoneOffset()) });
    if (params.sewing_line_id) q.set("sewing_line_id", String(params.sewing_line_id));
    if (params.order_id) q.set("order_id", String(params.order_id));
    return request(`/api/v1/production/scan/summary?${q.toString()}`);
  },
  async listMfgProductionPlans(params?: { status_filter?: string }): Promise<MfgProductionPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgProductionPlanResponse[]>(`/api/v1/manufacturing/planning/production-plans${suffix}`);
  },
  async createMfgProductionPlan(data: MfgProductionPlanCreate): Promise<MfgProductionPlanResponse> {
    return request<MfgProductionPlanResponse>("/api/v1/manufacturing/planning/production-plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async generateMfgWorkOrders(planId: number): Promise<MfgWorkOrderResponse[]> {
    return request<MfgWorkOrderResponse[]>(`/api/v1/manufacturing/planning/production-plans/${planId}/generate-work-orders`, {
      method: "POST",
    });
  },
  async releaseWorkOrdersToShopFloor(body: {
    plan_id?: number;
    order_ids?: number[];
  }): Promise<{ released: number; work_order_ids: number[]; message?: string }> {
    return request<{ released: number; work_order_ids: number[]; message?: string }>(
      "/api/v1/production/planning/release-work-orders",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  async listMfgWorkOrders(params?: { status_filter?: string }): Promise<MfgWorkOrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgWorkOrderResponse[]>(`/api/v1/manufacturing/execution/work-orders${suffix}`);
  },
  async runMfgMrp(data: MfgMrpRunCreate): Promise<MfgMrpRunResponse> {
    return request<MfgMrpRunResponse>("/api/v1/manufacturing/planning/mrp/runs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMfgMrpRecommendations(runId: number): Promise<MfgMrpRecommendationResponse[]> {
    return request<MfgMrpRecommendationResponse[]>(`/api/v1/manufacturing/planning/mrp/runs/${runId}/recommendations`);
  },
  async getMfgCapacityLoads(): Promise<MfgCapacityLoadRow[]> {
    return request<MfgCapacityLoadRow[]>("/api/v1/manufacturing/planning/capacity/loads");
  },
  async getMfgActualCost(workOrderId: number): Promise<MfgActualCostResponse> {
    return request<MfgActualCostResponse>(`/api/v1/manufacturing/costing/work-orders/${workOrderId}/actual-cost`);
  },
  async freezeMfgCostSnapshot(workOrderId: number, data: MfgFreezeSnapshotCreate): Promise<MfgCostSnapshotResponse> {
    return request<MfgCostSnapshotResponse>(`/api/v1/manufacturing/costing/work-orders/${workOrderId}/freeze-cost-snapshot`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMfgCostVariance(workOrderId: number): Promise<MfgVarianceResponse> {
    return request<MfgVarianceResponse>(`/api/v1/manufacturing/costing/work-orders/${workOrderId}/variance`);
  },
  async getMfgExecutionDashboard(): Promise<MfgExecutionDashboardResponse> {
    return request<MfgExecutionDashboardResponse>("/api/v1/manufacturing/execution/dashboard");
  },
  async getMfgDowntimeReasonSummary(params?: { start_date?: string; end_date?: string }): Promise<MfgDowntimeReasonRow[]> {
    const q = new URLSearchParams();
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgDowntimeReasonRow[]>(`/api/v1/manufacturing/execution/dashboard/downtime-reasons${suffix}`);
  },
  async getMfgDowntimeTrend(params?: { start_date?: string; end_date?: string }): Promise<MfgDowntimeTrendRow[]> {
    const q = new URLSearchParams();
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgDowntimeTrendRow[]>(`/api/v1/manufacturing/execution/dashboard/downtime-trend${suffix}`);
  },
  async listMfgMasterOperations(params?: { active_only?: boolean }): Promise<MfgMasterOperationResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgMasterOperationResponse[]>(`/api/v1/manufacturing/master/operations${suffix}`);
  },
  async createMfgMasterOperation(data: MfgMasterOperationCreate): Promise<MfgMasterOperationResponse> {
    return request<MfgMasterOperationResponse>("/api/v1/manufacturing/master/operations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgMasterOperation(operationId: number, data: MfgMasterOperationUpdate): Promise<MfgMasterOperationResponse> {
    return request<MfgMasterOperationResponse>(`/api/v1/manufacturing/master/operations/${operationId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listMfgSampleRequests(params?: { status_filter?: string; priority?: string }): Promise<MfgSampleRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.priority) q.set("priority", params.priority);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgSampleRequestResponse[]>(`/api/v1/manufacturing/samples/requests${suffix}`);
  },
  async createMfgSampleRequest(data: MfgSampleRequestCreate): Promise<MfgSampleRequestResponse> {
    return request<MfgSampleRequestResponse>("/api/v1/manufacturing/samples/requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgSampleRequest(sampleId: number, data: MfgSampleRequestUpdate): Promise<MfgSampleRequestResponse> {
    return request<MfgSampleRequestResponse>(`/api/v1/manufacturing/samples/requests/${sampleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async updateMfgSampleRequestStatus(sampleId: number, statusValue: string, note?: string): Promise<MfgSampleRequestResponse> {
    return request<MfgSampleRequestResponse>(`/api/v1/manufacturing/samples/requests/${sampleId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: statusValue, note: note ?? null }),
    });
  },
  async listMfgTnaTemplates(params?: { active_only?: boolean }): Promise<MfgTnaTemplateResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgTnaTemplateResponse[]>(`/api/v1/manufacturing/tna/templates${suffix}`);
  },
  async createMfgTnaTemplate(data: MfgTnaTemplateCreate): Promise<MfgTnaTemplateResponse> {
    return request<MfgTnaTemplateResponse>("/api/v1/manufacturing/tna/templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgTnaTemplateTasks(templateId: number): Promise<MfgTnaTemplateTaskResponse[]> {
    return request<MfgTnaTemplateTaskResponse[]>(`/api/v1/manufacturing/tna/templates/${templateId}/tasks`);
  },
  async addMfgTnaTemplateTask(templateId: number, data: MfgTnaTemplateTaskCreate): Promise<MfgTnaTemplateTaskResponse> {
    return request<MfgTnaTemplateTaskResponse>(`/api/v1/manufacturing/tna/templates/${templateId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgTnaPlans(params?: { status_filter?: string }): Promise<MfgTnaPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgTnaPlanResponse[]>(`/api/v1/manufacturing/tna/plans${suffix}`);
  },
  async getMfgTnaPlan(planId: number): Promise<MfgTnaPlanResponse> {
    return request<MfgTnaPlanResponse>(`/api/v1/manufacturing/tna/plans/${planId}`);
  },
  async createMfgTnaPlan(data: MfgTnaPlanCreate): Promise<MfgTnaPlanResponse> {
    return request<MfgTnaPlanResponse>("/api/v1/manufacturing/tna/plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgTnaPlanTasks(planId: number): Promise<MfgTnaPlanTaskResponse[]> {
    return request<MfgTnaPlanTaskResponse[]>(`/api/v1/manufacturing/tna/plans/${planId}/tasks`);
  },
  async updateMfgTnaPlanTask(taskId: number, data: MfgTnaPlanTaskUpdate): Promise<MfgTnaPlanTaskResponse> {
    return request<MfgTnaPlanTaskResponse>(`/api/v1/manufacturing/tna/plan-tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async getMfgTnaDashboardSummary(): Promise<MfgTnaDashboardSummary> {
    return request<MfgTnaDashboardSummary>("/api/v1/manufacturing/tna/dashboard/summary");
  },
  async listMfgOperationQueue(params?: {
    work_center_id?: number;
    status_filter?: string;
    area?: "cutting" | "sewing" | "finishing";
    limit?: number;
  }): Promise<MfgOperationQueueRow[]> {
    const q = new URLSearchParams();
    if (params?.work_center_id != null) q.set("work_center_id", String(params.work_center_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.area) q.set("area", params.area);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgOperationQueueRow[]>(`/api/v1/manufacturing/execution/operations/queue${suffix}`);
  },
  async assignMfgOperation(data: MfgOperationAssignCreate): Promise<MfgOperationAssignmentResponse> {
    return request<MfgOperationAssignmentResponse>("/api/v1/manufacturing/execution/operations/assignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async startMfgOperation(workOrderOperationId: number): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/start`, {
      method: "POST",
    });
  },
  async holdMfgOperation(workOrderOperationId: number): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/hold`, {
      method: "POST",
    });
  },
  async resumeMfgOperation(workOrderOperationId: number): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/resume`, {
      method: "POST",
    });
  },
  async completeMfgOperation(
    workOrderOperationId: number,
    data: { qty_in?: number; qty_out?: number; scrap_qty?: number },
  ): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/complete`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async createMfgDowntime(data: MfgDowntimeCreate): Promise<MfgDowntimeResponse> {
    return request<MfgDowntimeResponse>("/api/v1/manufacturing/execution/operations/downtime", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgDowntime(params?: { work_order_operation_id?: number; open_only?: boolean }): Promise<MfgDowntimeResponse[]> {
    const q = new URLSearchParams();
    if (params?.work_order_operation_id != null) q.set("work_order_operation_id", String(params.work_order_operation_id));
    if (params?.open_only) q.set("open_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgDowntimeResponse[]>(`/api/v1/manufacturing/execution/operations/downtime${suffix}`);
  },
  async endMfgDowntime(downtimeId: number, endedAt?: string): Promise<MfgDowntimeResponse> {
    return request<MfgDowntimeResponse>(`/api/v1/manufacturing/execution/operations/downtime/${downtimeId}/end`, {
      method: "POST",
      body: JSON.stringify({ ended_at: endedAt ?? null }),
    });
  },
  async listMfgMaterialReturns(params?: { work_order_id?: number }): Promise<MfgMaterialReturnResponse[]> {
    const q = new URLSearchParams();
    if (params?.work_order_id != null) q.set("work_order_id", String(params.work_order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgMaterialReturnResponse[]>(`/api/v1/manufacturing/execution/material-returns${suffix}`);
  },
  async listMfgQualityChecks(params?: { work_order_id?: number; check_type?: string }): Promise<MfgQualityCheckResponse[]> {
    const q = new URLSearchParams();
    if (params?.work_order_id != null) q.set("work_order_id", String(params.work_order_id));
    if (params?.check_type) q.set("check_type", params.check_type);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgQualityCheckResponse[]>(`/api/v1/manufacturing/quality/checks${suffix}`);
  },
  async createMfgQualityCheck(data: MfgQualityCheckCreate): Promise<MfgQualityCheckResponse> {
    return request<MfgQualityCheckResponse>("/api/v1/manufacturing/quality/checks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgNcrs(params?: { status_filter?: string; work_order_id?: number }): Promise<MfgNcrResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.work_order_id != null) q.set("work_order_id", String(params.work_order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgNcrResponse[]>(`/api/v1/manufacturing/quality/ncrs${suffix}`);
  },
  async createMfgNcr(data: MfgNcrCreate): Promise<MfgNcrResponse> {
    return request<MfgNcrResponse>("/api/v1/manufacturing/quality/ncrs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgNcrStatus(ncrId: number, statusValue: string, note?: string): Promise<MfgNcrResponse> {
    return request<MfgNcrResponse>(`/api/v1/manufacturing/quality/ncrs/${ncrId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: statusValue, note: note ?? null }),
    });
  },
  async listMfgCapas(params?: { status_filter?: string; ncr_id?: number }): Promise<MfgCapaResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.ncr_id != null) q.set("ncr_id", String(params.ncr_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgCapaResponse[]>(`/api/v1/manufacturing/quality/capas${suffix}`);
  },
  async createMfgCapa(data: MfgCapaCreate): Promise<MfgCapaResponse> {
    return request<MfgCapaResponse>("/api/v1/manufacturing/quality/capas", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgCapaStatus(capaId: number, data: MfgCapaStatusUpdate): Promise<MfgCapaResponse> {
    return request<MfgCapaResponse>(`/api/v1/manufacturing/quality/capas/${capaId}/status`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getQualityDashboard(params?: { date_from?: string; date_to?: string }): Promise<QualityDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QualityDashboardResponse>(`/api/v1/manufacturing/quality/dashboard${suffix}`);
  },
  /** Phase 14 — planning capacity/sequencing advisory (POST, requires PRODUCTION_PLANNING_AI_ENHANCED_ENABLED). */
  async postProductionPlanningAdvisory(body: {
    from_date: string;
    to_date: string;
  }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/production/planning/advisory/capacity-sequencing", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listFinancierPrincipalsForFacility(): Promise<{ id: number; full_name: string | null; email: string | null }[]> {
    return request("/api/v1/facility/financier-principals");
  },
  async listFacilities(params?: { status_filter?: string; limit?: number; offset?: number }): Promise<FacilityRow[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FacilityRow[]>(`/api/v1/facility/facilities${suffix}`);
  },
  async getFacility(id: number): Promise<{ facility: FacilityRow; utilizations: FacilityUtilizationRow[] }> {
    return request(`/api/v1/facility/facilities/${id}`);
  },
  async createFacility(body: Record<string, unknown>): Promise<FacilityRow> {
    return request<FacilityRow>("/api/v1/facility/facilities", { method: "POST", body: JSON.stringify(body) });
  },
  async patchFacility(id: number, body: Record<string, unknown>): Promise<FacilityRow> {
    return request<FacilityRow>(`/api/v1/facility/facilities/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async deleteFacility(id: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/facility/facilities/${id}`, { method: "DELETE" });
  },
  async listFacilityUtilizations(facilityId: number): Promise<FacilityUtilizationRow[]> {
    return request<FacilityUtilizationRow[]>(`/api/v1/facility/facilities/${facilityId}/utilizations`);
  },
  async createFacilityUtilization(facilityId: number, body: Record<string, unknown>): Promise<FacilityUtilizationRow> {
    return request<FacilityUtilizationRow>(`/api/v1/facility/facilities/${facilityId}/utilizations`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getFacilityUtilization(id: number): Promise<{
    utilization: FacilityUtilizationRow;
    facility: FacilityRow | null;
    schedule: Record<string, unknown>[];
  }> {
    return request(`/api/v1/facility/utilizations/${id}`);
  },
  async patchFacilityUtilization(id: number, body: Record<string, unknown>): Promise<FacilityUtilizationRow> {
    return request<FacilityUtilizationRow>(`/api/v1/facility/utilizations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async getUtilizationSchedule(utilizationId: number): Promise<Record<string, unknown>[]> {
    return request(`/api/v1/facility/utilizations/${utilizationId}/schedule`);
  },
  async calculateFacilityEmi(body: Record<string, unknown>): Promise<EmiPreviewResponse> {
    return request<EmiPreviewResponse>("/api/v1/facility/calculate-emi", { method: "POST", body: JSON.stringify(body) });
  },
  async getFacilitySummary(): Promise<Record<string, unknown>> {
    return request("/api/v1/facility/summary");
  },
  async getFacilityUpcomingObligations(): Promise<Record<string, unknown>> {
    return request("/api/v1/facility/upcoming-obligations");
  },
  async activateFacilityUtilization(utilizationId: number, body?: { grace_days?: number | null }): Promise<Record<string, unknown>> {
    return request(`/api/v1/facility/utilizations/${utilizationId}/activate`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async generateFacilitySnapshots(body: { snapshot_month: string; facility_id?: number | null }): Promise<Record<string, unknown>> {
    return request("/api/v1/facility/snapshots/generate", { method: "POST", body: JSON.stringify(body) });
  },
  async listFactoryProfiles(): Promise<
    Array<{
      key: string;
      label: string;
      description: string;
      enabled_optional_units: string[];
      feature_flags: Record<string, boolean>;
    }>
  > {
    return request("/api/v1/production/factory-profiles");
  },
  async getProductionSettings(): Promise<{
    tenant_id: number;
    factory_profile?: string | null;
    enabled_optional_units: string[];
    weekend_days: string[];
    cm_alert_threshold_pct: number;
    ai_provider_config?: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/settings");
  },
  async updateProductionSettings(body: {
    factory_profile?: string | null;
    enabled_optional_units?: string[];
    weekend_days?: string[];
    cm_alert_threshold_pct?: number;
    ai_provider_config?: Record<string, unknown> | null;
  }): Promise<{
    tenant_id: number;
    factory_profile?: string | null;
    enabled_optional_units: string[];
    weekend_days: string[];
    cm_alert_threshold_pct: number;
    ai_provider_config?: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/settings", { method: "PUT", body: JSON.stringify(body) });
  },
  async listProductionShifts(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      shift_code: string;
      name: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/shifts");
  },
  async createProductionShift(body: {
    shift_code: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/shifts", { method: "POST", body: JSON.stringify(body) });
  },
  async updateProductionShift(
    shift_id: number,
    body: {
      shift_code?: string;
      name?: string;
      start_time?: string;
      end_time?: string;
      break_minutes?: number;
      is_active?: boolean;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/shifts/${shift_id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async listSewingLines(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      line_code: string;
      name: string;
      default_machine_count: number;
      running_machine_count: number;
      default_operator_count: number;
      default_helper_count: number;
      supervisor_user_id: number | null;
      is_active: boolean;
      factory_unit?: string | null;
    }>
  > {
    return request("/api/v1/production/sewing-lines");
  },
  async createSewingLine(body: {
    line_code: string;
    name: string;
    default_machine_count?: number;
    running_machine_count?: number;
    default_operator_count?: number;
    default_helper_count?: number;
    supervisor_user_id?: number | null;
    is_active?: boolean;
    factory_unit?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/sewing-lines", { method: "POST", body: JSON.stringify(body) });
  },
  async updateSewingLine(
    line_id: number,
    body: {
      name?: string;
      default_machine_count?: number;
      running_machine_count?: number;
      default_operator_count?: number;
      default_helper_count?: number;
      supervisor_user_id?: number | null;
      is_active?: boolean;
      factory_unit?: string | null;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/sewing-lines/${line_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async deleteSewingLine(line_id: number): Promise<void> {
    return request(`/api/v1/production/sewing-lines/${line_id}`, { method: "DELETE" });
  },
  async listDepartmentMachines(department_type?: string): Promise<
    Array<{
      id: number;
      tenant_id: number;
      department_type: string;
      machine_code: string;
      name: string;
      machine_type: string | null;
      status: string;
      is_active: boolean;
    }>
  > {
    const q = department_type ? `?department_type=${encodeURIComponent(department_type)}` : "";
    return request(`/api/v1/production/machines${q}`);
  },
  async createDepartmentMachine(body: {
    department_type: string;
    machine_code: string;
    name: string;
    machine_type?: string | null;
    status?: string;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/machines", { method: "POST", body: JSON.stringify(body) });
  },
  async listCrewRoles(department_type?: string): Promise<
    Array<{
      id: number;
      tenant_id: number;
      department_type: string;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      sort_order: number;
      is_active: boolean;
    }>
  > {
    const q = department_type ? `?department_type=${encodeURIComponent(department_type)}` : "";
    return request(`/api/v1/production/crew-roles${q}`);
  },
  async createCrewRole(body: {
    department_type: string;
    role_key: string;
    role_name: string;
    is_named?: boolean;
    designation_id?: number | null;
    designation_filter?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/crew-roles", { method: "POST", body: JSON.stringify(body) });
  },
  async updateCrewRole(
    crew_role_id: number,
    body: {
      role_name?: string;
      is_named?: boolean;
      designation_id?: number | null;
      designation_filter?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/crew-roles/${crew_role_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async deleteCrewRole(crew_role_id: number): Promise<void> {
    return request(`/api/v1/production/crew-roles/${crew_role_id}`, { method: "DELETE" });
  },
  async listHrEmployeesForCrew(params?: { designation_filter?: string; designation_id?: number }): Promise<{
    items: Array<{
      id: number;
      employee_code: string;
      name: string;
      designation_id: number | null;
      designation_title: string | null;
      user_id: number | null;
    }>;
  }> {
    const q = new URLSearchParams();
    if (params?.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params?.designation_filter) q.set("designation_filter", params.designation_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/production/hr-employees${suffix}`);
  },
  async getHrAvailableForCrew(params: {
    date: string;
    designation_id?: number;
    designation_filter?: string;
  }): Promise<{
    designation_id: number | null;
    designation_filter: string | null;
    date: string;
    available_count: number;
    active_count: number;
    on_leave_count: number;
    employees: Array<{ id: number; employee_code: string; name: string; designation_id: number | null }>;
  }> {
    const q = new URLSearchParams();
    q.set("date", params.date);
    if (params.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params.designation_filter) q.set("designation_filter", params.designation_filter);
    return request(`/api/v1/production/hr-available?${q.toString()}`);
  },
  async getLineCrewTemplate(line_id: number): Promise<
    Array<{
      crew_role_id: number;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      default_count: number;
      employee_id: number | null;
      employee_name: string | null;
      sort_order: number;
    }>
  > {
    return request(`/api/v1/production/sewing-lines/${line_id}/crew-template`);
  },
  async putLineCrewTemplate(
    line_id: number,
    rows: Array<{ crew_role_id: number; default_count: number; employee_id?: number | null }>,
  ): Promise<unknown> {
    return request(`/api/v1/production/sewing-lines/${line_id}/crew-template`, {
      method: "PUT",
      body: JSON.stringify({ rows }),
    });
  },
  async getUnitCrewTemplate(
    department_type: string,
    machine_id?: number | null,
  ): Promise<
    Array<{
      crew_role_id: number;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      default_count: number;
      employee_id: number | null;
      employee_name: string | null;
      sort_order: number;
    }>
  > {
    const q = machine_id != null ? `?machine_id=${machine_id}` : "";
    return request(`/api/v1/production/units/${encodeURIComponent(department_type)}/crew-template${q}`);
  },
  async putUnitCrewTemplate(
    department_type: string,
    body: {
      machine_id?: number | null;
      rows: Array<{ crew_role_id: number; default_count: number; employee_id?: number | null }>;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/units/${encodeURIComponent(department_type)}/crew-template`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async getCrewDaily(params: {
    production_date: string;
    shift_id: number;
    line_id?: number | null;
    department_type?: string | null;
    machine_id?: number | null;
  }): Promise<
    Array<{
      id: number;
      crew_role_id: number;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      planned_count: number;
      actual_present: number;
      shortfall: number;
      employee_id: number | null;
      employee_name: string | null;
      notes: string | null;
      sort_order: number;
      validation_warning: string | null;
    }>
  > {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    if (params.line_id != null) q.set("line_id", String(params.line_id));
    if (params.department_type) q.set("department_type", params.department_type);
    if (params.machine_id != null) q.set("machine_id", String(params.machine_id));
    return request(`/api/v1/production/crew-daily?${q.toString()}`);
  },
  async putCrewDaily(body: {
    production_date: string;
    shift_id: number;
    line_id?: number | null;
    department_type?: string | null;
    machine_id?: number | null;
    rows: Array<{ crew_role_id: number; planned_count: number; employee_id?: number | null; notes?: string | null }>;
    override_validation?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/crew-daily", { method: "PUT", body: JSON.stringify(body) });
  },
  async initCrewDailyFromTemplate(body: {
    production_date: string;
    shift_id: number;
    line_id?: number | null;
    department_type?: string | null;
    machine_id?: number | null;
  }): Promise<unknown> {
    return request("/api/v1/production/crew-daily/init-from-template", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async syncCrewAttendance(date: string): Promise<{ ok: boolean; updated_rows: number }> {
    return request(`/api/v1/production/crew-daily/sync-attendance?date=${encodeURIComponent(date)}`, {
      method: "POST",
    });
  },
  async getCrewDailyFilters(): Promise<{
    shifts: Array<{ id: number; code: string; name: string }>;
    lines: Array<{ id: number; line_code: string; name: string }>;
    optional_units: string[];
  }> {
    return request("/api/v1/production/crew-daily/filters");
  },
  async getProductionDashboard(production_date: string): Promise<{
    production_date: string;
    total_output_today: number;
    overall_efficiency_pct: number | null;
    crew_fill_rate_pct: number | null;
    cm_alerts_open: number;
    lines: Array<Record<string, unknown>>;
    cutting_bundles_pending: number;
    cutting_bundles_issued: number;
  }> {
    return request(`/api/v1/production/dashboard?production_date=${encodeURIComponent(production_date)}`);
  },
  async getCrewSubstituteSuggestions(params: {
    production_date: string;
    shift_id: number;
    line_id: number;
  }): Promise<{
    production_date: string;
    line_id: number;
    shift_id: number;
    gaps: Array<{
      crew_role_id: number;
      role_name: string;
      current_employee_id: number;
      suggested_substitutes: Array<{ id: number; employee_code: string; name: string }>;
    }>;
  }> {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/crew-daily/substitute-suggestions?${q.toString()}`);
  },
  async getLineCrewSheetStatus(params: { production_date: string; shift_id: number; line_id: number }): Promise<{
    id: number | null;
    sewing_line_id: number;
    shift_id: number;
    production_date: string;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
    locked_at: string | null;
  }> {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/line-crew-sheet/status?${q.toString()}`);
  },
  async updateLineCrewSheetStatus(
    params: { production_date: string; shift_id: number; line_id: number },
    body: { action: string },
  ): Promise<unknown> {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/line-crew-sheet/status?${q.toString()}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listProductionDefectCodes(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      code: string;
      name: string;
      category: string | null;
      severity: string;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/quality/defect-codes");
  },
  async createProductionDefectCode(body: {
    code: string;
    name: string;
    category?: string | null;
    severity?: string;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/quality/defect-codes", { method: "POST", body: JSON.stringify(body) });
  },
  async listProductionQcChecks(params: { production_date: string; shift_id?: number; line_id?: number }): Promise<
    Array<{
      id: number;
      tenant_id: number;
      sewing_line_id: number;
      shift_id: number;
      production_date: string;
      hour_slot: number;
      check_type: string;
      total_checked: number;
      pass_qty: number;
      fail_qty: number;
      defect_codes: unknown[] | null;
      notes: string | null;
    }>
  > {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    if (params.shift_id != null) q.set("shift_id", String(params.shift_id));
    if (params.line_id != null) q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/quality/checks?${q.toString()}`);
  },
  async upsertProductionQcCheck(body: {
    sewing_line_id: number;
    shift_id: number;
    production_date: string;
    hour_slot: number;
    check_type?: string;
    total_checked?: number;
    pass_qty?: number;
    fail_qty?: number;
    defect_codes?: unknown[] | null;
    notes?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/quality/checks", { method: "PUT", body: JSON.stringify(body) });
  },
  async listWorkerSkills(params?: { employee_id?: number }): Promise<
    Array<{
      id: number;
      tenant_id: number;
      employee_id: number;
      ie_operation_id: number;
      operation_code: string | null;
      operation_name: string | null;
      skill_level: string;
      certified_at: string | null;
      is_active: boolean;
    }>
  > {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/production/skills${suffix}`);
  },
  async createWorkerSkill(body: {
    employee_id: number;
    ie_operation_id: number;
    skill_level?: string;
    certified_at?: string | null;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/skills", { method: "POST", body: JSON.stringify(body) });
  },
  async listCrewRosterWeekly(params: {
    week_start_date: string;
    sewing_line_id?: number;
    shift_id?: number;
  }): Promise<
    Array<{
      id: number;
      week_start_date: string;
      sewing_line_id: number;
      shift_id: number;
      crew_role_id: number;
      role_name: string | null;
      day_of_week: number;
      employee_id: number | null;
      planned_count: number;
      notes: string | null;
    }>
  > {
    const q = new URLSearchParams();
    q.set("week_start_date", params.week_start_date);
    if (params.sewing_line_id != null) q.set("sewing_line_id", String(params.sewing_line_id));
    if (params.shift_id != null) q.set("shift_id", String(params.shift_id));
    return request(`/api/v1/production/roster-weekly?${q.toString()}`);
  },
  async upsertCrewRosterCell(body: {
    week_start_date: string;
    sewing_line_id: number;
    shift_id: number;
    crew_role_id: number;
    day_of_week: number;
    employee_id?: number | null;
    planned_count?: number;
    notes?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/roster-weekly/cell", { method: "PUT", body: JSON.stringify(body) });
  },
  async generateCrewDailyFromRoster(body: {
    week_start_date: string;
    sewing_line_id: number;
    shift_id: number;
    target_date: string;
  }): Promise<void> {
    return request("/api/v1/production/roster-weekly/generate-daily", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getEmployeeProductionProfile(employee_id: number, limit_days?: number): Promise<{
    employee_id: number;
    line_assignment: { line_id: number; line_code: string; last_date: string } | null;
    skills: Array<{ operation_code: string; name: string; skill_level: string }>;
    attendance_trend: Array<{ date: string; status: string }>;
    hourly_good_qty_total_period: number;
  }> {
    const q = limit_days != null ? `?limit_days=${limit_days}` : "";
    return request(`/api/v1/production/employees/${employee_id}/production-profile${q}`);
  },
  async getPlanBoard(
    from_date: string,
    to_date: string,
  ): Promise<{
    items: unknown[];
    conflicts?: Array<{
      kind: "LINE_OVERLAP" | "LATE_DELIVERY" | "INACTIVE_LINE" | string;
      severity: "error" | "warning" | string;
      config_ids: number[];
      line_id: number;
      order_id: number | null;
      message: string;
    }>;
    factory_load?: Array<{
      factory_unit: string;
      line_count: number;
      plan_count: number;
      planned_qty: number;
      completed_qty: number;
    }>;
  }> {
    return request(`/api/v1/production/plan-board?from_date=${encodeURIComponent(from_date)}&to_date=${encodeURIComponent(to_date)}`);
  },
  async proposeLineReservation(order_id: number): Promise<{ id: number; reservation_status: string }> {
    return request("/api/v1/production/reservations/propose", {
      method: "POST",
      body: JSON.stringify({ order_id }),
    });
  },
  async confirmReservationSoft(config_id: number): Promise<{ id: number; reservation_status: string }> {
    return request(`/api/v1/production/reservations/${config_id}/confirm-soft`, { method: "POST" });
  },
  async confirmReservationFirm(config_id: number): Promise<{ id: number; reservation_status: string }> {
    return request(`/api/v1/production/reservations/${config_id}/confirm-firm`, { method: "POST" });
  },
  async releaseLineReservation(config_id: number): Promise<{ id: number; reservation_status: string }> {
    return request(`/api/v1/production/reservations/${config_id}/release`, { method: "POST" });
  },
  async replanMaterialDelay(body: { order_id: number; delay_days: number }): Promise<{ shifted_config_ids: number[] }> {
    return request("/api/v1/production/replan/material-delay", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getPlanSuggest(start_date: string): Promise<{ suggestions: unknown[] }> {
    return request(`/api/v1/production/plan-board/suggest?start_date=${encodeURIComponent(start_date)}`);
  },
  async getOrderReadiness(order_id: number): Promise<unknown> {
    return request(`/api/v1/production/plan-board/readiness/${order_id}`);
  },
  /** Full chain readiness (style, OB, TNA, materials, line). */
  async getOrderChainReadiness(order_id: number): Promise<unknown> {
    return request(`/api/v1/production/planning/pipeline/${order_id}/readiness`);
  },
  /** Orders with readiness; optional group_by=style */
  async getProductionPipeline(params?: { group_by?: "style" }): Promise<unknown> {
    const q = params?.group_by === "style" ? "?group_by=style" : "";
    return request(`/api/v1/production/planning/pipeline${q}`);
  },
  async aiAnalyzePipeline(): Promise<{ summary: string | null; pipeline_snapshot: unknown }> {
    return request("/api/v1/production/planning/ai/analyze", { method: "POST" });
  },
  async aiSuggestAllocation(order_id: number): Promise<{ suggestion: Record<string, unknown> | null }> {
    return request("/api/v1/production/planning/ai/suggest-allocation", {
      method: "POST",
      body: JSON.stringify({ order_id }),
    });
  },
  async aiPredictMove(body: {
    config_id: number;
    target_line_id: number;
    target_start_date: string;
  }): Promise<{
    prediction: string | null;
    ai_status?: {
      enabled: boolean;
      has_api_key: boolean;
      model: string;
      rate_limited: boolean;
      reason: string;
    };
  }> {
    return request("/api/v1/production/planning/ai/predict-move", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async aiOptimizeBoard(): Promise<{
    moves: Array<Record<string, unknown>>;
    ai_status?: {
      enabled: boolean;
      has_api_key: boolean;
      model: string;
      rate_limited: boolean;
      reason: string;
    };
  }> {
    return request("/api/v1/production/planning/ai/optimize", { method: "POST" });
  },
  async aiRiskAlerts(): Promise<{ alerts: Array<Record<string, unknown>> | null }> {
    return request("/api/v1/production/planning/ai/risk-alerts");
  },
  async aiEfficiencyForecast(): Promise<{
    forecast_text: string;
    lines: Array<Record<string, unknown>>;
    generated_at: string;
  }> {
    return request("/api/v1/production/planning/ai/efficiency-forecast");
  },
  async getPredictiveDefectRisk(lookbackDays?: number): Promise<PredictiveHeuristicResponse> {
    const q = lookbackDays != null ? `?lookback_days=${lookbackDays}` : "";
    return request<PredictiveHeuristicResponse>(`/api/v1/production/planning/predictive/defect-risk${q}`);
  },
  async getPredictiveLineBalance(lookbackDays?: number): Promise<PredictiveHeuristicResponse> {
    const q = lookbackDays != null ? `?lookback_days=${lookbackDays}` : "";
    return request<PredictiveHeuristicResponse>(`/api/v1/production/planning/predictive/line-balance${q}`);
  },
  async getPredictiveMaintenance(lookbackDays?: number): Promise<PredictiveHeuristicResponse> {
    const q = lookbackDays != null ? `?lookback_days=${lookbackDays}` : "";
    return request<PredictiveHeuristicResponse>(`/api/v1/production/planning/predictive/maintenance${q}`);
  },
  async getAiPlanningSettings(): Promise<{
    effective_enabled: boolean;
    effective_model: string;
    tenant_override: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/planning/ai/settings");
  },
  async putAiPlanningSettings(body: { enabled?: boolean | null; model?: string | null }): Promise<{
    effective_enabled: boolean;
    effective_model: string;
    tenant_override: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/planning/ai/settings", { method: "PUT", body: JSON.stringify(body) });
  },
  async listFactoryCalendar(from_date?: string, to_date?: string): Promise<FactoryCalendarOverrideRow[]> {
    const q = new URLSearchParams();
    if (from_date) q.set("from_date", from_date);
    if (to_date) q.set("to_date", to_date);
    const s = q.toString();
    return request(`/api/v1/production/calendar${s ? `?${s}` : ""}`);
  },
  async upsertFactoryCalendar(body: {
    override_date: string;
    override_type: string;
    name?: string | null;
    notes?: string | null;
    category?: string | null;
    source?: string | null;
    is_paid?: boolean;
    affects_hr?: boolean;
  }): Promise<FactoryCalendarOverrideRow> {
    return request("/api/v1/production/calendar", { method: "POST", body: JSON.stringify(body) });
  },
  async deleteFactoryCalendarOverride(override_id: number): Promise<void> {
    return request(`/api/v1/production/calendar/${override_id}`, { method: "DELETE" });
  },
  async getCountryHolidaysPreview(year: number): Promise<CountryHolidaysPreviewResponse> {
    return request(`/api/v1/production/calendar/country-holidays?year=${encodeURIComponent(String(year))}`);
  },
  async importCountryHolidays(body: { year: number; selected_dates: string[] }): Promise<{
    imported_count: number;
    skipped_count: number;
  }> {
    return request("/api/v1/production/calendar/import-holidays", { method: "POST", body: JSON.stringify(body) });
  },
  async deleteProductionShift(shift_id: number): Promise<void> {
    return request(`/api/v1/production/shifts/${shift_id}`, { method: "DELETE" });
  },
  async listIeOperations(): Promise<
    Array<{
      id: number;
      operation_code: string;
      name: string;
      category: string;
      default_smv: number;
      machine_type_required: string | null;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/ie/operations");
  },
  async createIeOperation(body: {
    operation_code: string;
    name: string;
    category?: string;
    default_smv?: number;
    machine_type_required?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/ie/operations", { method: "POST", body: JSON.stringify(body) });
  },
  async listOperationBulletins(style_id?: number): Promise<
    Array<{ id: number; style_id: number; ob_code: string; version_no: number; total_smv: number; status: string }>
  > {
    const q = style_id != null ? `?style_id=${style_id}` : "";
    return request(`/api/v1/production/ie/bulletins${q}`);
  },
  async createOperationBulletin(body: {
    style_id: number;
    ob_code: string;
    version_no?: number;
    notes?: string | null;
    operations: Array<{
      sequence_no: number;
      operation_id?: number | null;
      operation_name: string;
      smv?: number;
      machine_type?: string | null;
      attachment_needed?: string | null;
      is_critical?: boolean;
    }>;
  }): Promise<unknown> {
    return request("/api/v1/production/ie/bulletins", { method: "POST", body: JSON.stringify(body) });
  },
  async runLineBalance(body: { ob_id: number; line_id: number; num_workstations: number }): Promise<unknown> {
    return request("/api/v1/production/ie/line-balance", { method: "POST", body: JSON.stringify(body) });
  },
  async assignPlanBoard(body: {
    line_id: number;
    order_id?: number | null;
    style_id?: number | null;
    ob_id?: number | null;
    machine_count?: number;
    operator_count?: number;
    helper_count?: number;
    target_efficiency_pct?: number;
    shift_id?: number | null;
    start_date: string;
    planned_qty?: number;
    sort_order?: number;
  }): Promise<{ id: number }> {
    return request("/api/v1/production/plan-board/assign", { method: "POST", body: JSON.stringify(body) });
  },
  async movePlanBoard(config_id: number, body: { line_id?: number | null; start_date?: string | null }): Promise<{ ok: boolean }> {
    return request(`/api/v1/production/plan-board/${config_id}/move`, { method: "PUT", body: JSON.stringify(body) });
  },
  async upsertHourlyEntry(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/hourly/upsert", { method: "POST", body: JSON.stringify(body) });
  },
  async getHourlySheet(params: {
    department_type: string;
    production_date: string;
    line_id?: number | null;
    machine_id?: number | null;
  }): Promise<{ items: unknown[] }> {
    const q = new URLSearchParams();
    q.set("department_type", params.department_type);
    q.set("production_date", params.production_date);
    if (params.line_id != null) q.set("line_id", String(params.line_id));
    if (params.machine_id != null) q.set("machine_id", String(params.machine_id));
    return request(`/api/v1/production/hourly/sheet?${q.toString()}`);
  },
  async getHourlySummary(line_style_config_id: number, production_date: string): Promise<unknown> {
    return request(
      `/api/v1/production/hourly/summary?line_style_config_id=${line_style_config_id}&production_date=${encodeURIComponent(production_date)}`,
    );
  },
  async listMarkerPlans(): Promise<{ items: Array<{ id: number; marker_code: string; status: string }> }> {
    return request("/api/v1/production/cutting/marker-plans");
  },
  async createMarkerPlan(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/cutting/marker-plans", { method: "POST", body: JSON.stringify(body) });
  },
  async createLayPlan(body: { marker_plan_id: number; lay_code: string; fabric_item_id?: number | null }): Promise<{ id: number }> {
    return request("/api/v1/production/cutting/lay-plans", { method: "POST", body: JSON.stringify(body) });
  },
  async createCutTicket(body: { lay_plan_id: number; ticket_code: string }): Promise<{ id: number }> {
    return request("/api/v1/production/cutting/cut-tickets", { method: "POST", body: JSON.stringify(body) });
  },
  async generateCuttingBundles(
    ticket_id: number,
    lines?: Array<{ size?: string; color?: string | null; qty_in_bundle?: number; bundle_count?: number }>,
  ): Promise<{ barcodes: string[] }> {
    return request(`/api/v1/production/cutting/cut-tickets/${ticket_id}/generate-bundles`, {
      method: "POST",
      body: JSON.stringify({ lines: lines ?? null }),
    });
  },
  async lookupCuttingBundle(barcode: string): Promise<unknown> {
    return request(`/api/v1/production/cutting/bundles/lookup/${encodeURIComponent(barcode)}`);
  },
  async issueCuttingBundles(body: { bundle_ids: number[]; issued_to_line_id: number }): Promise<{ ok: boolean }> {
    return request("/api/v1/production/cutting/bundles/issue", { method: "POST", body: JSON.stringify(body) });
  },
  async downloadCuttingBundlePdf(cut_ticket_id: number): Promise<Blob> {
    return requestBlob(`/api/v1/production/cutting/bundles/barcode-pdf/${cut_ticket_id}`, { method: "GET" });
  },
  async postProductionDailyCost(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/costs/daily", { method: "POST", body: JSON.stringify(body) });
  },
  async getCmAnalysis(period_date: string): Promise<{ items: unknown[] }> {
    return request(`/api/v1/production/costs/cm-analysis?period_date=${encodeURIComponent(period_date)}`);
  },
  async recalcCm(period_date: string): Promise<unknown> {
    return request(`/api/v1/production/costs/cm-recalc?period_date=${encodeURIComponent(period_date)}`, { method: "POST" });
  },
  async getCmAlerts(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/costs/cm-alerts");
  },
  async listCmOverheadConfig(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      cost_category: string;
      account_id: number | null;
      cost_center_id: number | null;
      allocation_method: string;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/costs/overhead-config");
  },
  async upsertCmOverheadConfig(
    rows: Array<{
      cost_category: string;
      account_id?: number | null;
      cost_center_id?: number | null;
      allocation_method?: string;
      is_active?: boolean;
    }>,
  ): Promise<unknown> {
    return request("/api/v1/production/costs/overhead-config", {
      method: "PUT",
      body: JSON.stringify(rows),
    });
  },
  async createWipJournal(body: Record<string, unknown>): Promise<{ id: number; voucher_id?: number | null }> {
    return request("/api/v1/production/costs/wip-journal", { method: "POST", body: JSON.stringify(body) });
  },
  async listWipJournals(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/costs/wip-journal");
  },
  async listKnittingPlans(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/knitting/plans");
  },
  async createKnittingPlan(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/knitting/plans", { method: "POST", body: JSON.stringify(body) });
  },
  async listKnittingChargeRates(activeOnly?: boolean): Promise<{ items: unknown[] }> {
    const q = typeof activeOnly === "boolean" ? `?active_only=${activeOnly ? "true" : "false"}` : "";
    return request(`/api/v1/production/knitting/charge-rates${q}`);
  },
  async createKnittingChargeRate(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/knitting/charge-rates", { method: "POST", body: JSON.stringify(body) });
  },
  async patchKnittingChargeRate(rateId: number, body: Record<string, unknown>): Promise<{ ok: boolean }> {
    return request(`/api/v1/production/knitting/charge-rates/${rateId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getKnittingChargePreview(params: Record<string, string | number>): Promise<{
    suggested_charge: number;
    currency_hint?: string;
  }> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
    return request(`/api/v1/production/knitting/charge-preview?${sp.toString()}`);
  },
  async listKnittingWorkOrders(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/knitting/work-orders");
  },
  async createKnittingWorkOrder(body: Record<string, unknown>): Promise<unknown> {
    return request("/api/v1/production/knitting/work-orders", { method: "POST", body: JSON.stringify(body) });
  },
  async getKnittingWorkOrder(woId: number): Promise<unknown> {
    return request(`/api/v1/production/knitting/work-orders/${woId}`);
  },
  async patchKnittingWorkOrder(woId: number, body: Record<string, unknown>): Promise<unknown> {
    return request(`/api/v1/production/knitting/work-orders/${woId}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async linkKnittingWorkOrderDocuments(
    woId: number,
    body: { delivery_challan_id?: number | null; gate_pass_id?: number | null },
  ): Promise<unknown> {
    return request(`/api/v1/production/knitting/work-orders/${woId}/link-documents`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async createKnittingWorkOrderProcessOrder(woId: number): Promise<unknown> {
    return request(`/api/v1/production/knitting/work-orders/${woId}/process-order`, { method: "POST" });
  },
  async refreshKnittingWorkOrderStatus(woId: number): Promise<unknown> {
    return request(`/api/v1/production/knitting/work-orders/${woId}/refresh-status`, { method: "POST" });
  },
  async getKnittingDashboardStats(): Promise<unknown> {
    return request("/api/v1/production/knitting/dashboard-stats");
  },
  async listDyeRecipes(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/dyeing/recipes");
  },
  async createDyeRecipe(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/dyeing/recipes", { method: "POST", body: JSON.stringify(body) });
  },
  async listDyeBatches(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/dyeing/batches");
  },
  async createDyeBatch(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/dyeing/batches", { method: "POST", body: JSON.stringify(body) });
  },
  async listDepartmentProductionPlans(department_type?: string): Promise<{ items: unknown[] }> {
    const q = department_type ? `?department_type=${encodeURIComponent(department_type)}` : "";
    return request(`/api/v1/production/departments/plans${q}`);
  },
  async createDepartmentProductionPlan(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/departments/plans", { method: "POST", body: JSON.stringify(body) });
  },

};
