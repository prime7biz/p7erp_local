/**
 * Merchandising (BOM, TNA, samples, costing, change requests, control tower) API calls.
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types live in `api/models.ts` (re-exported by `api/client.ts`).
 */
import { request, requestBlob, requestWithTotal, type ListWithTotal } from "@/api/core";
import type {
  BomCreate,
  BomDetailResponse,
  BomItemCreate,
  BomItemResponse,
  BomLineProcurementStatus,
  BomResponse,
  BomUpdate,
  CommercialChangePendingSummary,
  CommercialChangeRequestCreate,
  CommercialChangeRequestOut,
  ConsumptionPlanCreate,
  ConsumptionPlanDetailResponse,
  ConsumptionPlanItemCreate,
  ConsumptionPlanItemResponse,
  ConsumptionPlanResponse,
  ConsumptionPlanUpdate,
  ConsumptionReconciliationDashboardParams,
  ConsumptionReconciliationDashboardResponse,
  ConsumptionReconciliationMovementsResponse,
  ConsumptionReconciliationResponse,
  ConsumptionReconciliationTrendsResponse,
  ControlTowerCapacityHeatmapResponse,
  ControlTowerLcSnapshotResponse,
  ControlTowerSummaryResponse,
  ControlTowerTimelineResponse,
  CostingItemResponse,
  CreatePoFromOrderBomLinePayload,
  CurrencyMasterResponse,
  EligibleOrderForBom,
  FollowupActionCommentCreate,
  FollowupActionCommentOut,
  FollowupActionRejectionLogCreate,
  FollowupActionRejectionLogEntry,
  FollowupActionTemplateCreate,
  FollowupActionTemplateResponse,
  FollowupActionTemplateUpdate,
  FollowupCreate,
  FollowupResponse,
  FollowupSummaryResponse,
  FollowupUpdate,
  GeneratePOFromBOMResponse,
  ItemCategoryResponse,
  ItemUnitResponse,
  MaterialRequirementResponse,
  MerchAlertCommentItem,
  MerchAlertDetailResponse,
  MerchAlertHistoryItem,
  MerchAlertSavedView,
  MerchAlertsListResponse,
  MerchAlertsSummaryResponse,
  MerchControlTowerSummaryResponse,
  MerchCriticalAlertsResponse,
  MerchPipelineFullResponse,
  MerchReportsCatalogResponse,
  MerchSampleAiPlanApplyBody,
  MerchSampleAiPlanProposalResponse,
  MerchSampleCommentCreate,
  MerchSampleCommentOut,
  MerchSampleCostLineCreate,
  MerchSampleCostLineOut,
  MerchSampleCostLineUpdate,
  MerchSampleCreate,
  MerchSampleMaterialLineCreate,
  MerchSampleMaterialLineOut,
  MerchSampleMaterialLineUpdate,
  MerchSampleMetricsOut,
  MerchSampleOut,
  MerchSampleTaskCreate,
  MerchSampleTaskOut,
  MerchSampleTaskUpdate,
  MerchSampleUpdate,
  OrderDrivenBomDetailResponse,
  OrderDrivenBomLine,
  OrderDrivenBomLineCreate,
  OrderDrivenBomLinePatch,
  OrderFollowupActionCreate,
  OrderFollowupActionResponse,
  OrderFollowupActionUpdate,
  PipelineAnalyticsResponse,
  StyleColorwayCreate,
  StyleColorwayResponse,
  StyleComponentCreate,
  StyleComponentResponse,
  StyleCreate,
  StyleImageUploadResponse,
  StyleReportRow,
  StyleResponse,
  StyleSizeScaleCreate,
  StyleSizeScaleResponse,
  StyleSummaryResponse,
  StyleTimelineEvent,
  StyleUpdate,
  TnaGenerateRequest,
  UnifiedTnaActionResponse,
  UnifiedTnaSummaryResponse,
  WastageManagementSummaryResponse,
  WastageOrderDetailResponse,
  WastageReasonResponse,
  WastageReportRowResponse,
  WastageSavedViewResponse,
  WastageSummaryResponse,
  WastageThresholdRuleResponse,
  WastageTrendsResponse,
} from "@/api/models";

export const merchApi = {
  async uploadStyleImage(styleId: number, file: File): Promise<StyleImageUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return request<StyleImageUploadResponse>(`/api/v1/merch/styles/${styleId}/upload-picture`, {
      method: "POST",
      body: form,
    });
  },
  async getCommercialChangeRequest(id: number): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}`);
  },
  async createCommercialChangeRequest(data: CommercialChangeRequestCreate): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>("/api/v1/change-requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveCommercialChangeRequest(id: number, note?: string): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    });
  },
  async rejectCommercialChangeRequest(id: number, note?: string): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    });
  },
  async applyCommercialChangeRequest(id: number): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async cancelCommercialChangeRequest(id: number): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async getCommercialChangePendingSummary(): Promise<CommercialChangePendingSummary> {
    return request<CommercialChangePendingSummary>("/api/v1/change-requests/pending-summary");
  },
  // Costing masters
  async listItemCategories(): Promise<ItemCategoryResponse[]> {
    return request<ItemCategoryResponse[]>("/api/v1/costing/item-categories");
  },
  async listItemUnits(): Promise<ItemUnitResponse[]> {
    return request<ItemUnitResponse[]>("/api/v1/costing/item-units");
  },
  async listCostingItems(params?: { category_id?: number; search?: string }): Promise<CostingItemResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostingItemResponse[]>(`/api/v1/costing/items${suffix}`);
  },
  async listCurrencies(): Promise<CurrencyMasterResponse[]> {
    return request<CurrencyMasterResponse[]>("/api/v1/costing/currencies");
  },
  // Merchandising linked module
  async listStyles(params?: {
    status?: string;
    search?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    lifecycle_stage?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
    style_ids?: number[];
    limit?: number;
    offset?: number;
  }): Promise<StyleResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<StyleResponse>(`/api/v1/merch/styles${suffix}`);
    return res.rows;
  },
  async listStylesWithTotal(params?: {
    status?: string;
    search?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    lifecycle_stage?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
    style_ids?: number[];
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<StyleResponse>> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<StyleResponse>(`/api/v1/merch/styles${suffix}`);
  },
  async createStyle(data: StyleCreate): Promise<StyleResponse> {
    return request<StyleResponse>("/api/v1/merch/styles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getStyle(id: number): Promise<StyleResponse> {
    return request<StyleResponse>(`/api/v1/merch/styles/${id}`);
  },
  async updateStyle(id: number, data: StyleUpdate): Promise<StyleResponse> {
    return request<StyleResponse>(`/api/v1/merch/styles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyle(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${id}`, { method: "DELETE" });
  },
  async getStyleSummary(id: number): Promise<StyleSummaryResponse> {
    return request<StyleSummaryResponse>(`/api/v1/merch/styles/${id}/summary`);
  },
  async listStyleTimeline(id: number, params?: { limit?: number }): Promise<StyleTimelineEvent[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StyleTimelineEvent[]>(`/api/v1/merch/styles/${id}/timeline${suffix}`);
  },
  async listStyleSummaryReport(params?: {
    search?: string;
    lifecycle_stage?: string;
    critical_only?: boolean;
    saved_view?: string;
    style_ids?: number[];
    report_limit?: number;
    report_offset?: number;
    status?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
  }): Promise<StyleReportRow[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.critical_only != null) q.set("critical_only", String(params.critical_only));
    if (params?.saved_view) q.set("saved_view", params.saved_view);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.report_limit != null) q.set("report_limit", String(params.report_limit));
    if (params?.report_offset != null) q.set("report_offset", String(params.report_offset));
    if (params?.status) q.set("status", params.status);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StyleReportRow[]>(`/api/v1/merch/styles/summary-report${suffix}`);
  },
  async listStyleSummaryReportWithTotal(params?: {
    search?: string;
    lifecycle_stage?: string;
    critical_only?: boolean;
    saved_view?: string;
    style_ids?: number[];
    report_limit?: number;
    report_offset?: number;
    status?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
  }): Promise<ListWithTotal<StyleReportRow>> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.critical_only != null) q.set("critical_only", String(params.critical_only));
    if (params?.saved_view) q.set("saved_view", params.saved_view);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.report_limit != null) q.set("report_limit", String(params.report_limit));
    if (params?.report_offset != null) q.set("report_offset", String(params.report_offset));
    if (params?.status) q.set("status", params.status);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<StyleReportRow>(`/api/v1/merch/styles/summary-report${suffix}`);
  },
  async listStyleComponents(styleId: number): Promise<StyleComponentResponse[]> {
    return request<StyleComponentResponse[]>(`/api/v1/merch/styles/${styleId}/components`);
  },
  async createStyleComponent(styleId: number, data: StyleComponentCreate): Promise<StyleComponentResponse> {
    return request<StyleComponentResponse>(`/api/v1/merch/styles/${styleId}/components`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStyleComponent(
    styleId: number,
    componentId: number,
    data: StyleComponentCreate
  ): Promise<StyleComponentResponse> {
    return request<StyleComponentResponse>(`/api/v1/merch/styles/${styleId}/components/${componentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyleComponent(styleId: number, componentId: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${styleId}/components/${componentId}`, { method: "DELETE" });
  },
  async listStyleColorways(styleId: number): Promise<StyleColorwayResponse[]> {
    return request<StyleColorwayResponse[]>(`/api/v1/merch/styles/${styleId}/colorways`);
  },
  async createStyleColorway(styleId: number, data: StyleColorwayCreate): Promise<StyleColorwayResponse> {
    return request<StyleColorwayResponse>(`/api/v1/merch/styles/${styleId}/colorways`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStyleColorway(
    styleId: number,
    colorwayId: number,
    data: StyleColorwayCreate
  ): Promise<StyleColorwayResponse> {
    return request<StyleColorwayResponse>(`/api/v1/merch/styles/${styleId}/colorways/${colorwayId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyleColorway(styleId: number, colorwayId: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${styleId}/colorways/${colorwayId}`, { method: "DELETE" });
  },
  async listStyleSizeScales(styleId: number): Promise<StyleSizeScaleResponse[]> {
    return request<StyleSizeScaleResponse[]>(`/api/v1/merch/styles/${styleId}/size-scales`);
  },
  async createStyleSizeScale(styleId: number, data: StyleSizeScaleCreate): Promise<StyleSizeScaleResponse> {
    return request<StyleSizeScaleResponse>(`/api/v1/merch/styles/${styleId}/size-scales`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStyleSizeScale(
    styleId: number,
    scaleId: number,
    data: StyleSizeScaleCreate
  ): Promise<StyleSizeScaleResponse> {
    return request<StyleSizeScaleResponse>(`/api/v1/merch/styles/${styleId}/size-scales/${scaleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyleSizeScale(styleId: number, scaleId: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${styleId}/size-scales/${scaleId}`, { method: "DELETE" });
  },
  async listBoms(params?: { style_id?: number }): Promise<BomResponse[]> {
    const q = new URLSearchParams();
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<BomResponse>(`/api/v1/merch/boms${suffix}`);
    return res.rows;
  },
  async listBomsWithTotal(params?: { style_id?: number }): Promise<ListWithTotal<BomResponse>> {
    const q = new URLSearchParams();
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<BomResponse>(`/api/v1/merch/boms${suffix}`);
  },
  async createBom(data: BomCreate): Promise<BomResponse> {
    return request<BomResponse>("/api/v1/merch/boms", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getBom(id: number): Promise<BomDetailResponse> {
    return request<BomDetailResponse>(`/api/v1/merch/boms/${id}`);
  },
  async updateBom(id: number, data: BomUpdate): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteBom(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/boms/${id}`, { method: "DELETE" });
  },
  async submitBom(id: number): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}/submit`, { method: "POST" });
  },
  async approveBom(id: number): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}/approve`, { method: "POST" });
  },
  async freezeBom(id: number): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}/freeze`, { method: "POST" });
  },
  async createBomItem(bomId: number, data: BomItemCreate): Promise<BomItemResponse> {
    return request<BomItemResponse>(`/api/v1/merch/boms/${bomId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateBomItem(bomId: number, itemId: number, data: BomItemCreate): Promise<BomItemResponse> {
    return request<BomItemResponse>(`/api/v1/merch/boms/${bomId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteBomItem(bomId: number, itemId: number): Promise<void> {
    return request<void>(`/api/v1/merch/boms/${bomId}/items/${itemId}`, { method: "DELETE" });
  },
  async getOrderMaterialRequirement(orderId: number): Promise<MaterialRequirementResponse> {
    return request<MaterialRequirementResponse>(`/api/v1/merch/orders/${orderId}/material-requirement`);
  },
  async generatePurchaseOrderFromBom(
    bomId: number,
    data: { quantity: number; supplier_name?: string; vendor_id?: number },
  ): Promise<GeneratePOFromBOMResponse> {
    return request<GeneratePOFromBOMResponse>(`/api/v1/merch/boms/${bomId}/generate-purchase-order`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listEligibleOrdersForBom(): Promise<EligibleOrderForBom[]> {
    return request<EligibleOrderForBom[]>("/api/v1/merch/order-boms/eligible-orders");
  },
  async createBomFromOrder(orderId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>("/api/v1/merch/order-boms/from-order", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    });
  },
  async getOrderDrivenBomByOrder(orderId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/by-order/${orderId}`);
  },
  async getOrderDrivenBomDetail(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/detail`);
  },
  async patchOrderDrivenBomLine(
    bomId: number,
    lineId: number,
    data: OrderDrivenBomLinePatch,
  ): Promise<OrderDrivenBomLine> {
    return request<OrderDrivenBomLine>(`/api/v1/merch/order-boms/${bomId}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async addOrderDrivenBomLine(bomId: number, data: OrderDrivenBomLineCreate): Promise<OrderDrivenBomLine> {
    return request<OrderDrivenBomLine>(`/api/v1/merch/order-boms/${bomId}/lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async deleteOrderDrivenBomLine(bomId: number, lineId: number): Promise<void> {
    return request<void>(`/api/v1/merch/order-boms/${bomId}/lines/${lineId}`, { method: "DELETE" });
  },
  async submitOrderDrivenBom(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/submit`, { method: "POST" });
  },
  async approveOrderDrivenBom(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/approve`, { method: "POST" });
  },
  async rejectOrderDrivenBom(bomId: number, comment: string): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/reject`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    });
  },
  async freezeOrderDrivenBom(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/freeze`, { method: "POST" });
  },
  async createPurchaseOrderFromOrderBomLine(
    lineId: number,
    data: CreatePoFromOrderBomLinePayload,
  ): Promise<GeneratePOFromBOMResponse> {
    return request<GeneratePOFromBOMResponse>(`/api/v1/merch/order-boms/lines/${lineId}/purchase-order`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async bulkGeneratePurchaseOrdersFromOrderBom(
    bomId: number,
    lineIds?: number[],
  ): Promise<{ created: Array<{ id: number; po_code: string; line_count: number }> }> {
    return request(`/api/v1/merch/order-boms/${bomId}/generate-purchase-orders-bulk`, {
      method: "POST",
      body: JSON.stringify({ line_ids: lineIds ?? null }),
    });
  },
  async getSuggestedVendorsForOrderBomLine(lineId: number): Promise<{
    suggestions: Array<{
      unit_price: string;
      vendor_id: number | null;
      po_code: string;
      purchase_order_id: number;
      vendor_name: string | null;
    }>;
  }> {
    return request(`/api/v1/merch/order-boms/lines/${lineId}/suggested-vendors`);
  },
  async getLinkedPurchaseOrdersForOrderBomLine(lineId: number): Promise<{
    items: Array<{
      purchase_order_id: number;
      po_code: string;
      status: string;
      line_quantity: string;
      unit_price: string;
      received_qty: number;
    }>;
  }> {
    return request(`/api/v1/merch/order-boms/lines/${lineId}/purchase-orders`);
  },
  async getOrderBomLineProcurementStatus(lineId: number): Promise<{ status: BomLineProcurementStatus }> {
    return request(`/api/v1/merch/order-boms/lines/${lineId}/procurement-status`);
  },
  async refreshOrderBomLineVendorPrice(
    lineId: number,
    vendorId: number,
  ): Promise<OrderDrivenBomLine> {
    const q = new URLSearchParams({ vendor_id: String(vendorId) });
    return request<OrderDrivenBomLine>(
      `/api/v1/merch/order-boms/lines/${lineId}/refresh-vendor-price?${q.toString()}`,
      { method: "POST" },
    );
  },
  /**
   * Returns rows only (`X-Total-Count` is ignored). For paginated UIs use `listConsumptionPlansWithTotal`.
   */
  async listConsumptionPlans(params?: { order_id?: number; limit?: number; offset?: number }): Promise<ConsumptionPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<ConsumptionPlanResponse>(`/api/v1/merch/consumption-plans${suffix}`);
    return res.rows;
  },
  async listConsumptionPlansWithTotal(params?: {
    order_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<ConsumptionPlanResponse>> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<ConsumptionPlanResponse>(`/api/v1/merch/consumption-plans${suffix}`);
  },
  async createConsumptionPlan(data: ConsumptionPlanCreate): Promise<ConsumptionPlanResponse> {
    return request<ConsumptionPlanResponse>("/api/v1/merch/consumption-plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getConsumptionPlan(id: number): Promise<ConsumptionPlanDetailResponse> {
    return request<ConsumptionPlanDetailResponse>(`/api/v1/merch/consumption-plans/${id}`);
  },
  async updateConsumptionPlan(id: number, data: ConsumptionPlanUpdate): Promise<ConsumptionPlanResponse> {
    return request<ConsumptionPlanResponse>(`/api/v1/merch/consumption-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteConsumptionPlan(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/consumption-plans/${id}`, { method: "DELETE" });
  },
  async createConsumptionPlanItem(planId: number, data: ConsumptionPlanItemCreate): Promise<ConsumptionPlanItemResponse> {
    return request<ConsumptionPlanItemResponse>(`/api/v1/merch/consumption-plans/${planId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateConsumptionPlanItem(
    planId: number,
    itemId: number,
    data: ConsumptionPlanItemCreate
  ): Promise<ConsumptionPlanItemResponse> {
    return request<ConsumptionPlanItemResponse>(`/api/v1/merch/consumption-plans/${planId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteConsumptionPlanItem(planId: number, itemId: number): Promise<void> {
    return request<void>(`/api/v1/merch/consumption-plans/${planId}/items/${itemId}`, { method: "DELETE" });
  },
  async listFollowups(params?: { order_id?: number; status?: string }): Promise<FollowupResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<FollowupResponse>(`/api/v1/merch/followups${suffix}`);
    return res.rows;
  },
  async listFollowupsWithTotal(params?: { order_id?: number; status?: string }): Promise<ListWithTotal<FollowupResponse>> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<FollowupResponse>(`/api/v1/merch/followups${suffix}`);
  },
  async createFollowup(data: FollowupCreate): Promise<FollowupResponse> {
    return request<FollowupResponse>("/api/v1/merch/followups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateFollowup(id: number, data: FollowupUpdate): Promise<FollowupResponse> {
    return request<FollowupResponse>(`/api/v1/merch/followups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteFollowup(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/followups/${id}`, { method: "DELETE" });
  },
  // TNA / Advanced follow-up
  async listFollowupTemplates(params?: { phase?: string; is_active?: boolean; buyer_id?: number }): Promise<FollowupActionTemplateResponse[]> {
    const q = new URLSearchParams();
    if (params?.phase) q.set("phase", params.phase);
    if (params?.is_active != null) q.set("is_active", String(params.is_active));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FollowupActionTemplateResponse[]>(`/api/v1/merch/followup-templates${suffix}`);
  },
  async getFollowupTemplate(id: number): Promise<FollowupActionTemplateResponse> {
    return request<FollowupActionTemplateResponse>(`/api/v1/merch/followup-templates/${id}`);
  },
  async createFollowupTemplate(data: FollowupActionTemplateCreate): Promise<FollowupActionTemplateResponse> {
    return request<FollowupActionTemplateResponse>("/api/v1/merch/followup-templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateFollowupTemplate(id: number, data: FollowupActionTemplateUpdate): Promise<FollowupActionTemplateResponse> {
    return request<FollowupActionTemplateResponse>(`/api/v1/merch/followup-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteFollowupTemplate(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/followup-templates/${id}`, { method: "DELETE" });
  },
  async listFollowupActions(params?: {
    order_id?: number;
    status?: string;
    phase?: string;
    assigned_to_id?: number;
    due_from?: string;
    due_to?: string;
    overdue_only?: boolean;
  }): Promise<OrderFollowupActionResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status) q.set("status", params.status);
    if (params?.phase) q.set("phase", params.phase);
    if (params?.assigned_to_id != null) q.set("assigned_to_id", String(params.assigned_to_id));
    if (params?.due_from) q.set("due_from", params.due_from);
    if (params?.due_to) q.set("due_to", params.due_to);
    if (params?.overdue_only) q.set("overdue_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderFollowupActionResponse[]>(`/api/v1/merch/followup-actions${suffix}`);
  },
  async getFollowupActionsSummary(params?: { order_id?: number }): Promise<FollowupSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FollowupSummaryResponse>(`/api/v1/merch/followup-actions/summary${suffix}`);
  },
  async listUnifiedTnaActions(params?: {
    order_id?: number;
    status_filter?: string;
    source?: "all" | "merch" | "manufacturing";
    overdue_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<UnifiedTnaActionResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.source) q.set("source", params.source);
    if (params?.overdue_only) q.set("overdue_only", "true");
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<UnifiedTnaActionResponse[]>(`/api/v1/tna-unified/actions${suffix}`);
  },
  async getUnifiedTnaSummary(params?: { order_id?: number }): Promise<UnifiedTnaSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<UnifiedTnaSummaryResponse>(`/api/v1/tna-unified/summary${suffix}`);
  },
  async searchFollowupActions(q: string): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>(`/api/v1/merch/followup-actions/search?q=${encodeURIComponent(q)}`);
  },
  async getFollowupActionsTimeline(orderId: number): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>(`/api/v1/merch/followup-actions/order/${orderId}/timeline`);
  },
  async generateFollowupActions(body: TnaGenerateRequest): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>("/api/v1/merch/followup-actions/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getFollowupActionsOverdue(): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>("/api/v1/merch/followup-actions/overdue");
  },
  async getFollowupAction(id: number): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}`);
  },
  async createFollowupAction(data: OrderFollowupActionCreate): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>("/api/v1/merch/followup-actions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateFollowupAction(id: number, data: OrderFollowupActionUpdate): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async completeFollowupAction(id: number): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}/complete`, { method: "POST" });
  },
  async reopenFollowupAction(id: number): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}/reopen`, { method: "POST" });
  },
  async deleteFollowupAction(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/followup-actions/${id}`, { method: "DELETE" });
  },
  async getFollowupActionComments(actionId: number): Promise<FollowupActionCommentOut[]> {
    return request<FollowupActionCommentOut[]>(`/api/v1/merch/followup-actions/${actionId}/comments`);
  },
  async createFollowupActionComment(actionId: number, data: FollowupActionCommentCreate): Promise<FollowupActionCommentOut> {
    return request<FollowupActionCommentOut>(`/api/v1/merch/followup-actions/${actionId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getFollowupActionRejectionHistory(actionId: number): Promise<FollowupActionRejectionLogEntry[]> {
    return request<FollowupActionRejectionLogEntry[]>(`/api/v1/merch/followup-actions/${actionId}/rejection-history`);
  },
  async addFollowupActionRejectionLog(
    actionId: number,
    data: FollowupActionRejectionLogCreate
  ): Promise<FollowupActionRejectionLogEntry> {
    return request<FollowupActionRejectionLogEntry>(`/api/v1/merch/followup-actions/${actionId}/rejection-history`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMerchPipeline(): Promise<{ inquiries: number; quotations: number; orders: number }> {
    return request<{ inquiries: number; quotations: number; orders: number }>("/api/v1/merch/pipeline");
  },
  async getMerchReportsCatalog(): Promise<MerchReportsCatalogResponse> {
    return request<MerchReportsCatalogResponse>("/api/v1/merch/reports/catalog");
  },
  async getMerchControlTowerSummary(): Promise<MerchControlTowerSummaryResponse> {
    return request<MerchControlTowerSummaryResponse>("/api/v1/merch/control-tower/summary");
  },
  async listMerchSamples(params?: {
    status?: string;
    sample_type?: string;
    style_id?: number;
    order_id?: number;
    target_from?: string;
    target_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<MerchSampleOut[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.sample_type) q.set("sample_type", params.sample_type);
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.target_from) q.set("target_from", params.target_from);
    if (params?.target_to) q.set("target_to", params.target_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchSampleOut[]>(`/api/v1/merch/samples${suffix}`);
  },
  async listMerchSamplesByStyle(styleId: number, params?: { limit?: number }): Promise<MerchSampleOut[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchSampleOut[]>(`/api/v1/merch/samples/by-style/${styleId}${suffix}`);
  },
  async getMerchSample(sampleId: number): Promise<MerchSampleOut> {
    return request<MerchSampleOut>(`/api/v1/merch/samples/${sampleId}`);
  },
  async createMerchSample(data: MerchSampleCreate): Promise<MerchSampleOut> {
    return request<MerchSampleOut>("/api/v1/merch/samples", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSample(sampleId: number, data: MerchSampleUpdate): Promise<MerchSampleOut> {
    return request<MerchSampleOut>(`/api/v1/merch/samples/${sampleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listMerchSampleComments(sampleId: number): Promise<MerchSampleCommentOut[]> {
    return request<MerchSampleCommentOut[]>(`/api/v1/merch/samples/${sampleId}/comments`);
  },
  async addMerchSampleComment(sampleId: number, data: MerchSampleCommentCreate): Promise<MerchSampleCommentOut> {
    return request<MerchSampleCommentOut>(`/api/v1/merch/samples/${sampleId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMerchSampleMetrics(sampleId: number): Promise<MerchSampleMetricsOut> {
    return request<MerchSampleMetricsOut>(`/api/v1/merch/samples/${sampleId}/metrics`);
  },
  async listMerchSampleTasks(sampleId: number): Promise<MerchSampleTaskOut[]> {
    return request<MerchSampleTaskOut[]>(`/api/v1/merch/samples/${sampleId}/tasks`);
  },
  async createMerchSampleTask(sampleId: number, data: MerchSampleTaskCreate): Promise<MerchSampleTaskOut> {
    return request<MerchSampleTaskOut>(`/api/v1/merch/samples/${sampleId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSampleTask(sampleId: number, taskId: number, data: MerchSampleTaskUpdate): Promise<MerchSampleTaskOut> {
    return request<MerchSampleTaskOut>(`/api/v1/merch/samples/${sampleId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteMerchSampleTask(sampleId: number, taskId: number): Promise<void> {
    await request<void>(`/api/v1/merch/samples/${sampleId}/tasks/${taskId}`, { method: "DELETE" });
  },
  async listMerchSampleCostLines(sampleId: number): Promise<MerchSampleCostLineOut[]> {
    return request<MerchSampleCostLineOut[]>(`/api/v1/merch/samples/${sampleId}/cost-lines`);
  },
  async createMerchSampleCostLine(sampleId: number, data: MerchSampleCostLineCreate): Promise<MerchSampleCostLineOut> {
    return request<MerchSampleCostLineOut>(`/api/v1/merch/samples/${sampleId}/cost-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSampleCostLine(sampleId: number, lineId: number, data: MerchSampleCostLineUpdate): Promise<MerchSampleCostLineOut> {
    return request<MerchSampleCostLineOut>(`/api/v1/merch/samples/${sampleId}/cost-lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteMerchSampleCostLine(sampleId: number, lineId: number): Promise<void> {
    await request<void>(`/api/v1/merch/samples/${sampleId}/cost-lines/${lineId}`, { method: "DELETE" });
  },
  async listMerchSampleMaterialLines(sampleId: number): Promise<MerchSampleMaterialLineOut[]> {
    return request<MerchSampleMaterialLineOut[]>(`/api/v1/merch/samples/${sampleId}/material-lines`);
  },
  async createMerchSampleMaterialLine(sampleId: number, data: MerchSampleMaterialLineCreate): Promise<MerchSampleMaterialLineOut> {
    return request<MerchSampleMaterialLineOut>(`/api/v1/merch/samples/${sampleId}/material-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSampleMaterialLine(sampleId: number, lineId: number, data: MerchSampleMaterialLineUpdate): Promise<MerchSampleMaterialLineOut> {
    return request<MerchSampleMaterialLineOut>(`/api/v1/merch/samples/${sampleId}/material-lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteMerchSampleMaterialLine(sampleId: number, lineId: number): Promise<void> {
    await request<void>(`/api/v1/merch/samples/${sampleId}/material-lines/${lineId}`, { method: "DELETE" });
  },
  async merchSampleAiPlanProposal(sampleId: number): Promise<MerchSampleAiPlanProposalResponse> {
    return request<MerchSampleAiPlanProposalResponse>(`/api/v1/merch/samples/${sampleId}/ai/plan-proposal`, {
      method: "POST",
    });
  },
  async merchSampleAiPlanApply(sampleId: number, data: MerchSampleAiPlanApplyBody): Promise<MerchSampleTaskOut[]> {
    return request<MerchSampleTaskOut[]>(`/api/v1/merch/samples/${sampleId}/ai/plan-apply`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMerchPipelineFull(params?: {
    document_type?: string;
    customer_id?: number;
    search?: string;
  }): Promise<MerchPipelineFullResponse> {
    const q = new URLSearchParams();
    if (params?.document_type) q.set("document_type", params.document_type);
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.search) q.set("search", params.search);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchPipelineFullResponse>(`/api/v1/merch/pipeline/full${suffix}`);
  },
  async getMerchPipelineAnalytics(params?: { years_back?: number }): Promise<PipelineAnalyticsResponse> {
    const q = new URLSearchParams();
    if (params?.years_back != null) q.set("years_back", String(params.years_back));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PipelineAnalyticsResponse>(`/api/v1/merch/pipeline/analytics${suffix}`);
  },
  async getMerchCriticalAlerts(params?: { wastage_threshold_pct?: number }): Promise<MerchCriticalAlertsResponse> {
    const q = new URLSearchParams();
    if (params?.wastage_threshold_pct != null) q.set("wastage_threshold_pct", String(params.wastage_threshold_pct));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchCriticalAlertsResponse>(`/api/v1/merch/critical-alerts${suffix}`);
  },
  async getMerchAlerts(params?: {
    severity?: string;
    status?: string;
    alert_type?: string;
    entity_type?: string;
    entity_id?: number;
    order_id?: number;
    assigned_to_id?: number;
    min_priority_score?: number;
    sla_bucket?: "at_risk" | "breach" | "met";
    page?: number;
    page_size?: number;
    sort?: string;
  }): Promise<MerchAlertsListResponse> {
    const q = new URLSearchParams();
    if (params?.severity) q.set("severity", params.severity);
    if (params?.status) q.set("status", params.status);
    if (params?.alert_type) q.set("alert_type", params.alert_type);
    if (params?.entity_type) q.set("entity_type", params.entity_type);
    if (params?.entity_id != null) q.set("entity_id", String(params.entity_id));
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.assigned_to_id != null) q.set("assigned_to_id", String(params.assigned_to_id));
    if (params?.min_priority_score != null) q.set("min_priority_score", String(params.min_priority_score));
    if (params?.sla_bucket) q.set("sla_bucket", params.sla_bucket);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    if (params?.sort) q.set("sort", params.sort);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchAlertsListResponse>(`/api/v1/merch/alerts${suffix}`);
  },
  async getMerchAlertsSummary(params?: {
    severity?: string;
    status?: string;
    alert_type?: string;
    entity_type?: string;
    entity_id?: number;
  }): Promise<MerchAlertsSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.severity) q.set("severity", params.severity);
    if (params?.status) q.set("status", params.status);
    if (params?.alert_type) q.set("alert_type", params.alert_type);
    if (params?.entity_type) q.set("entity_type", params.entity_type);
    if (params?.entity_id != null) q.set("entity_id", String(params.entity_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchAlertsSummaryResponse>(`/api/v1/merch/alerts/summary${suffix}`);
  },
  async getMerchAlertDetail(alertId: number): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}`);
  },
  async updateMerchAlertStatus(alertId: number, status: string): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  async snoozeMerchAlert(alertId: number, snoozed_until: string): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/snooze`, {
      method: "POST",
      body: JSON.stringify({ snoozed_until }),
    });
  },
  async assignMerchAlert(alertId: number, assigned_to_id: number | null): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/assign`, {
      method: "POST",
      body: JSON.stringify({ assigned_to_id }),
    });
  },
  async runMerchAlertsScan(): Promise<{ status: string; message?: string }> {
    return request<{ status: string; message?: string }>(`/api/v1/merch/alerts/scan`, { method: "POST" });
  },
  async getMerchAlertComments(alertId: number): Promise<MerchAlertCommentItem[]> {
    return request<MerchAlertCommentItem[]>(`/api/v1/merch/alerts/${alertId}/comments`);
  },
  async addMerchAlertComment(alertId: number, body: string, is_internal?: boolean): Promise<MerchAlertCommentItem> {
    return request<MerchAlertCommentItem>(`/api/v1/merch/alerts/${alertId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, is_internal: is_internal ?? false }),
    });
  },
  async getMerchAlertHistory(alertId: number): Promise<MerchAlertHistoryItem[]> {
    return request<MerchAlertHistoryItem[]>(`/api/v1/merch/alerts/${alertId}/history`);
  },
  async escalateMerchAlert(alertId: number, to_level?: number, assigned_to_id?: number | null, reason?: string | null): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/escalate`, {
      method: "POST",
      body: JSON.stringify({ to_level: to_level ?? 1, assigned_to_id: assigned_to_id ?? null, reason: reason ?? null }),
    });
  },
  async getMerchAlertViews(): Promise<MerchAlertSavedView[]> {
    return request<MerchAlertSavedView[]>(`/api/v1/merch/alerts/views`);
  },
  async createMerchAlertView(params: { name: string; description?: string; filter_json: Record<string, unknown>; is_default?: boolean }): Promise<MerchAlertSavedView> {
    return request<MerchAlertSavedView>(`/api/v1/merch/alerts/views`, {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        description: params.description ?? null,
        filter_json: params.filter_json,
        is_default: params.is_default ?? false,
      }),
    });
  },
  async deleteMerchAlertView(viewId: number): Promise<void> {
    return request(`/api/v1/merch/alerts/views/${viewId}`, { method: "DELETE" });
  },
  async getWastageReport(params?: {
    order_id?: number;
    style_id?: number;
    buyer_id?: number;
    date_from?: string;
    date_to?: string;
    threshold_pct?: number;
    above_threshold_only?: boolean;
  }): Promise<WastageReportRowResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.threshold_pct != null) q.set("threshold_pct", String(params.threshold_pct));
    if (params?.above_threshold_only === true) q.set("above_threshold_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageReportRowResponse[]>(`/api/v1/merch/reports/wastage${suffix}`);
  },
  async getWastageSummary(params?: {
    style_id?: number;
    buyer_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<WastageSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageSummaryResponse>(`/api/v1/merch/reports/wastage/summary${suffix}`);
  },
  async getWastageOrderDetail(orderId: number): Promise<WastageOrderDetailResponse> {
    return request<WastageOrderDetailResponse>(`/api/v1/merch/reports/wastage/order/${orderId}`);
  },
  async getWastageReasons(): Promise<WastageReasonResponse[]> {
    return request<WastageReasonResponse[]>("/api/v1/merch/reports/wastage/reasons");
  },
  async getWastageTrends(params?: {
    date_from?: string;
    date_to?: string;
    group_by?: "month" | "buyer" | "material_group";
  }): Promise<WastageTrendsResponse> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.group_by) q.set("group_by", params.group_by);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageTrendsResponse>(`/api/v1/merch/reports/wastage/trends${suffix}`);
  },
  async getWastageExportBlob(params?: {
    order_id?: number;
    style_id?: number;
    buyer_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<Blob> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    q.set("format", "xlsx");
    return requestBlob(`/api/v1/merch/reports/wastage/export?${q.toString()}`);
  },
  async getWastageThresholds(): Promise<WastageThresholdRuleResponse[]> {
    return request<WastageThresholdRuleResponse[]>("/api/v1/merch/reports/wastage/thresholds");
  },
  async createWastageThreshold(body: {
    scope_type: string;
    scope_id?: number | null;
    allowed_pct: number;
    critical_pct: number;
  }): Promise<WastageThresholdRuleResponse> {
    return request<WastageThresholdRuleResponse>("/api/v1/merch/reports/wastage/thresholds", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getWastageViews(): Promise<WastageSavedViewResponse[]> {
    return request<WastageSavedViewResponse[]>("/api/v1/merch/reports/wastage/views");
  },
  async createWastageView(body: {
    name: string;
    description?: string | null;
    filter_json: Record<string, unknown>;
    is_default?: boolean;
  }): Promise<WastageSavedViewResponse> {
    return request<WastageSavedViewResponse>("/api/v1/merch/reports/wastage/views", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteWastageView(viewId: number): Promise<void> {
    return request<void>(`/api/v1/merch/reports/wastage/views/${viewId}`, { method: "DELETE" });
  },
  async getWastageManagementSummary(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<WastageManagementSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageManagementSummaryResponse>(`/api/v1/merch/reports/wastage/management-summary${suffix}`);
  },
  async refreshWastageSummary(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{ updated_orders: number }> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ updated_orders: number }>(`/api/v1/merch/reports/wastage/refresh-summary${suffix}`, {
      method: "POST",
    });
  },
  async getConsumptionReconciliation(
    orderId: number,
    params?: { tolerance_pct?: number }
  ): Promise<ConsumptionReconciliationResponse> {
    const q = new URLSearchParams();
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionReconciliationResponse>(
      `/api/v1/merch/consumption-reconciliation/${orderId}${suffix}`
    );
  },
  async getConsumptionReconciliationExportBlob(
    orderId: number,
    params?: { tolerance_pct?: number }
  ): Promise<Blob> {
    const q = new URLSearchParams();
    q.set("format", "xlsx");
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    return requestBlob(
      `/api/v1/merch/consumption-reconciliation/${orderId}/export?${q.toString()}`
    );
  },
  async getConsumptionReconciliationDashboard(
    params?: ConsumptionReconciliationDashboardParams
  ): Promise<ConsumptionReconciliationDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.status) q.set("status", params.status);
    if (params?.material_type) q.set("material_type", params.material_type);
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.sort_by) q.set("sort_by", params.sort_by);
    if (params?.sort_dir) q.set("sort_dir", params.sort_dir);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionReconciliationDashboardResponse>(
      `/api/v1/merch/consumption-reconciliation/dashboard${suffix}`
    );
  },
  async getConsumptionReconciliationTrends(
    params?: { months?: number; buyer_id?: number; style_id?: number; tolerance_pct?: number }
  ): Promise<ConsumptionReconciliationTrendsResponse> {
    const q = new URLSearchParams();
    if (params?.months != null) q.set("months", String(params.months));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionReconciliationTrendsResponse>(
      `/api/v1/merch/consumption-reconciliation/trends${suffix}`
    );
  },
  async getConsumptionReconciliationDashboardExportBlob(
    params?: ConsumptionReconciliationDashboardParams
  ): Promise<Blob> {
    const q = new URLSearchParams();
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.status) q.set("status", params.status);
    if (params?.material_type) q.set("material_type", params.material_type);
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    return requestBlob(
      `/api/v1/merch/consumption-reconciliation/dashboard/export?${q.toString()}`
    );
  },
  async getConsumptionReconciliationMovements(
    orderId: number,
    itemId: number
  ): Promise<ConsumptionReconciliationMovementsResponse> {
    return request<ConsumptionReconciliationMovementsResponse>(
      `/api/v1/merch/consumption-reconciliation/${orderId}/movements/${itemId}`
    );
  },
  /** Phase 15 — TNA follow-up insights (requires TNA_FOLLOWUP_AI_ENABLED + tenant flag). */
  async getTnaFollowupAiInsights(orderId?: number): Promise<Record<string, unknown>> {
    const q = orderId != null ? `?order_id=${orderId}` : "";
    return request<Record<string, unknown>>(`/api/v1/tna-unified/ai/followup-insights${q}`);
  },
  async getControlTowerSummary(params: {
    delivery_from: string;
    delivery_to: string;
    limit?: number;
    offset?: number;
  }): Promise<ControlTowerSummaryResponse> {
    const q = new URLSearchParams();
    q.set("delivery_from", params.delivery_from);
    q.set("delivery_to", params.delivery_to);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return request(`/api/v1/control-tower/summary?${q}`);
  },
  async getControlTowerOrderTimeline(orderId: number): Promise<ControlTowerTimelineResponse> {
    return request(`/api/v1/control-tower/order/${orderId}/timeline`);
  },
  async getControlTowerMasterLcSnapshot(masterContractId: number): Promise<ControlTowerLcSnapshotResponse> {
    return request(`/api/v1/control-tower/master-lc/${masterContractId}/snapshot`);
  },
  async getControlTowerCapacityHeatmap(date_from: string, date_to: string): Promise<ControlTowerCapacityHeatmapResponse> {
    const q = new URLSearchParams();
    q.set("date_from", date_from);
    q.set("date_to", date_to);
    return request(`/api/v1/control-tower/capacity-heatmap?${q}`);
  },
};
