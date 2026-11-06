/**
 * Sales: customers, inquiries, quotations, orders, parties API calls.
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types live in `api/models.ts` (re-exported by `api/client.ts`).
 */
import { fetchAllPaginated, request } from "@/api/core";
import { inquiryWriteBodyForApi } from "@/api/models";
import type {
  CommercialChangeRequestOut,
  CommercialTimelineOut,
  CostBenchmarkHistoryResponse,
  CostBenchmarkResponse,
  CustomerAiApplySuggestionsRequest,
  CustomerAiApplySuggestionsResponse,
  CustomerAiAuditListResponse,
  CustomerAiDedupeResponse,
  CustomerAiEnrichResponse,
  CustomerAiExtractWrapResponse,
  CustomerAiFinalizeAfterCreateRequest,
  CustomerAiFinalizeAfterCreateResponse,
  CustomerAiMarkDecisionsRequest,
  CustomerAiNextActionsResponse,
  CustomerAiNlSearchResponse,
  CustomerAiSummaryResponse,
  CustomerAiValidateResponse,
  CustomerCreate,
  CustomerFacetsResponse,
  CustomerHealthResponse,
  CustomerIntermediaryLinkCreate,
  CustomerIntermediaryLinkResponse,
  CustomerIntermediaryLinkUpdate,
  CustomerListPageResponse,
  CustomerLogoUploadResponse,
  CustomerRelatedResponse,
  CustomerResponse,
  CustomerUpdate,
  InquiryAiApplySuggestionsRequest,
  InquiryAiApplySuggestionsResponse,
  InquiryAiAuditListResponse,
  InquiryAiDedupeResponse,
  InquiryAiEnrichResponse,
  InquiryAiExtractWrapResponse,
  InquiryAiFinalizeAfterCreateRequest,
  InquiryAiFinalizeAfterCreateResponse,
  InquiryAiMarkDecisionsRequest,
  InquiryAiNextActionsResponse,
  InquiryAiSummaryResponse,
  InquiryAiValidateResponse,
  InquiryCreate,
  InquiryEventResponse,
  InquiryListPageResponse,
  InquiryResponse,
  InquiryUpdate,
  IntermediaryCreate,
  IntermediaryResponse,
  IntermediaryUpdate,
  MaterialRequirementResponse,
  OrderAiApplySuggestionsRequest,
  OrderAiApplySuggestionsResponse,
  OrderAiAtpCtpSummaryResponse,
  OrderAiAuditListResponse,
  OrderAiCapacityBottleneckScanResponse,
  OrderAiDedupeResponse,
  OrderAiEnrichResponse,
  OrderAiExecutionPlanningSummaryResponse,
  OrderAiExtractWrapResponse,
  OrderAiFinalizeAfterCreateRequest,
  OrderAiFinalizeAfterCreateResponse,
  OrderAiMarkDecisionsRequest,
  OrderAiNextActionsResponse,
  OrderAiPlanningRiskCheckResponse,
  OrderAiPromiseSensitivityCheckResponse,
  OrderAiSummaryResponse,
  OrderAiValidateExecutionResponse,
  OrderAiValidateResponse,
  OrderAiWhatIfSimulationResponse,
  OrderAmendmentCreate,
  OrderAmendmentResponse,
  OrderColorSizeMatrix,
  OrderCommercialAlignmentResponse,
  OrderCostVarianceResponse,
  OrderCreate,
  OrderListPageResponse,
  OrderMilestonesResponse,
  OrderProfitabilitySummaryPage,
  OrderPromiseCheckResponse,
  OrderPromiseSummaryResponse,
  OrderResponse,
  OrderUpdate,
  PendingPriceVerificationItem,
  PlanningGroundingSnapshot,
  PlanningGroundingSummaryRow,
  QuotationAiApplySuggestionsRequest,
  QuotationAiApplySuggestionsResponse,
  QuotationAiAuditListResponse,
  QuotationAiDedupeResponse,
  QuotationAiEnrichResponse,
  QuotationAiExtractWrapResponse,
  QuotationAiFinalizeAfterCreateRequest,
  QuotationAiFinalizeAfterCreateResponse,
  QuotationAiMarkDecisionsRequest,
  QuotationAiNextActionsResponse,
  QuotationAiSummaryResponse,
  QuotationAiValidateResponse,
  QuotationCostingAiAnomalyScanResponse,
  QuotationCostingAiCompletenessResponse,
  QuotationCostingAiCostingSummaryResponse,
  QuotationCostingAiFxSensitivityResponse,
  QuotationCostingAiMarginRiskResponse,
  QuotationCostingAiNextActionsResponse,
  QuotationCostingSuggestionApplyResponse,
  QuotationCostingSuggestionBatchOut,
  QuotationCreate,
  QuotationDetailResponse,
  QuotationFullUpdate,
  QuotationListPageResponse,
  QuotationResponse,
  QuotationUpdate,
} from "@/api/models";

export const salesApi = {
  async listCustomers(): Promise<CustomerResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<CustomerListPageResponse>(`/api/v1/customers/paginated?${q.toString()}`);
    }, 200);
  },
  async listCustomersPaginated(params?: {
    q?: string;
    status?: string;
    country?: string;
    customer_type?: string;
    page?: number;
    page_size?: number;
    include_ai_fields?: boolean;
    stale_only?: boolean;
    incomplete_only?: boolean;
    high_duplicate_risk_only?: boolean;
    stale_days?: number;
  }): Promise<CustomerListPageResponse> {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.status) q.set("status", params.status);
    if (params?.country) q.set("country", params.country);
    if (params?.customer_type) q.set("customer_type", params.customer_type);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    if (params?.include_ai_fields) q.set("include_ai_fields", "true");
    if (params?.stale_only) q.set("stale_only", "true");
    if (params?.incomplete_only) q.set("incomplete_only", "true");
    if (params?.high_duplicate_risk_only) q.set("high_duplicate_risk_only", "true");
    if (params?.stale_days != null) q.set("stale_days", String(params.stale_days));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerListPageResponse>(`/api/v1/customers/paginated${suffix}`);
  },
  async getCustomerFacets(): Promise<CustomerFacetsResponse> {
    return request<CustomerFacetsResponse>("/api/v1/customers/facets");
  },
  async getCustomerRelated(customerId: number, limit?: number): Promise<CustomerRelatedResponse> {
    const q = new URLSearchParams();
    if (limit != null) q.set("limit", String(limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerRelatedResponse>(`/api/v1/customers/${customerId}/related${suffix}`);
  },
  async getCustomerHealth(customerId: number): Promise<CustomerHealthResponse> {
    return request<CustomerHealthResponse>(`/api/v1/customers/${customerId}/health`);
  },
  async customerAiExtract(file: File, customerId?: number): Promise<CustomerAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (customerId != null) fd.append("customer_id", String(customerId));
    return request<CustomerAiExtractWrapResponse>("/api/v1/customers/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async customerAiEnrich(body: {
    customer_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<CustomerAiEnrichResponse> {
    return request<CustomerAiEnrichResponse>("/api/v1/customers/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiValidate(body: {
    fields: Record<string, unknown>;
    customer_id?: number | null;
  }): Promise<CustomerAiValidateResponse> {
    return request<CustomerAiValidateResponse>("/api/v1/customers/ai/validate", {
      method: "POST",
      body: JSON.stringify({
        fields: body.fields,
        customer_id: body.customer_id ?? undefined,
      }),
    });
  },
  async customerAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_customer_id?: number | null;
  }): Promise<CustomerAiDedupeResponse> {
    return request<CustomerAiDedupeResponse>("/api/v1/customers/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiSummary(customerId: number): Promise<CustomerAiSummaryResponse> {
    return request<CustomerAiSummaryResponse>("/api/v1/customers/ai/summary", {
      method: "POST",
      body: JSON.stringify({ customer_id: customerId }),
    });
  },
  async customerAiNextActions(customerId: number): Promise<CustomerAiNextActionsResponse> {
    return request<CustomerAiNextActionsResponse>("/api/v1/customers/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ customer_id: customerId }),
    });
  },
  async customerAiNlSearch(q: string): Promise<CustomerAiNlSearchResponse> {
    const qs = new URLSearchParams({ q });
    return request<CustomerAiNlSearchResponse>(`/api/v1/customers/ai/nl-search?${qs.toString()}`);
  },
  async customerAiAuditLog(params?: { customer_id?: number; limit?: number }): Promise<CustomerAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerAiAuditListResponse>(`/api/v1/customers/ai/audit-log${suffix}`);
  },
  async customerAiMarkSuggestionDecisions(body: CustomerAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/customers/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiApplySuggestions(body: CustomerAiApplySuggestionsRequest): Promise<CustomerAiApplySuggestionsResponse> {
    return request<CustomerAiApplySuggestionsResponse>("/api/v1/customers/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/customers/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiLinkSuggestionBatch(body: { batch_id: number; customer_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/customers/ai/suggestion-batch/link-customer", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiFinalizeSuggestionBatchAfterCreate(
    body: CustomerAiFinalizeAfterCreateRequest,
  ): Promise<CustomerAiFinalizeAfterCreateResponse> {
    return request<CustomerAiFinalizeAfterCreateResponse>(
      "/api/v1/customers/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  async inquiryAiExtract(file: File, inquiryId?: number): Promise<InquiryAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (inquiryId != null) fd.append("inquiry_id", String(inquiryId));
    return request<InquiryAiExtractWrapResponse>("/api/v1/inquiries/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async inquiryAiEnrich(body: {
    inquiry_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<InquiryAiEnrichResponse> {
    return request<InquiryAiEnrichResponse>("/api/v1/inquiries/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiValidate(body: {
    fields: Record<string, unknown>;
    inquiry_id?: number | null;
  }): Promise<InquiryAiValidateResponse> {
    return request<InquiryAiValidateResponse>("/api/v1/inquiries/ai/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_inquiry_id?: number | null;
  }): Promise<InquiryAiDedupeResponse> {
    return request<InquiryAiDedupeResponse>("/api/v1/inquiries/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiSummary(inquiryId: number): Promise<InquiryAiSummaryResponse> {
    return request<InquiryAiSummaryResponse>("/api/v1/inquiries/ai/summary", {
      method: "POST",
      body: JSON.stringify({ inquiry_id: inquiryId }),
    });
  },
  async inquiryAiNextActions(inquiryId: number): Promise<InquiryAiNextActionsResponse> {
    return request<InquiryAiNextActionsResponse>("/api/v1/inquiries/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ inquiry_id: inquiryId }),
    });
  },
  async inquiryAiAuditLog(params?: { inquiry_id?: number; limit?: number }): Promise<InquiryAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.inquiry_id != null) q.set("inquiry_id", String(params.inquiry_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryAiAuditListResponse>(`/api/v1/inquiries/ai/audit-log${suffix}`);
  },
  async inquiryAiMarkSuggestionDecisions(body: InquiryAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inquiries/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiApplySuggestions(body: InquiryAiApplySuggestionsRequest): Promise<InquiryAiApplySuggestionsResponse> {
    return request<InquiryAiApplySuggestionsResponse>("/api/v1/inquiries/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inquiries/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiLinkSuggestionBatch(body: { batch_id: number; inquiry_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inquiries/ai/suggestion-batch/link-inquiry", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiFinalizeSuggestionBatchAfterCreate(
    body: InquiryAiFinalizeAfterCreateRequest,
  ): Promise<InquiryAiFinalizeAfterCreateResponse> {
    return request<InquiryAiFinalizeAfterCreateResponse>(
      "/api/v1/inquiries/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  // ---------- Quotation AI ----------

  async quotationAiExtract(file: File, quotationId?: number): Promise<QuotationAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (quotationId != null) fd.append("quotation_id", String(quotationId));
    return request<QuotationAiExtractWrapResponse>("/api/v1/quotations/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async quotationAiEnrich(body: {
    quotation_id?: number;
    website?: string;
    domain?: string;
    email?: string;
    company_name?: string;
    fields?: Record<string, string | null>;
  }): Promise<QuotationAiEnrichResponse> {
    return request<QuotationAiEnrichResponse>("/api/v1/quotations/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiValidate(body: {
    fields: Record<string, unknown>;
    quotation_id?: number;
  }): Promise<QuotationAiValidateResponse> {
    return request<QuotationAiValidateResponse>("/api/v1/quotations/ai/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_quotation_id?: number;
  }): Promise<QuotationAiDedupeResponse> {
    return request<QuotationAiDedupeResponse>("/api/v1/quotations/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiSummary(quotationId: number): Promise<QuotationAiSummaryResponse> {
    return request<QuotationAiSummaryResponse>("/api/v1/quotations/ai/summary", {
      method: "POST",
      body: JSON.stringify({ quotation_id: quotationId }),
    });
  },
  async quotationAiNextActions(quotationId: number): Promise<QuotationAiNextActionsResponse> {
    return request<QuotationAiNextActionsResponse>("/api/v1/quotations/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ quotation_id: quotationId }),
    });
  },
  async quotationAiAuditLog(params?: { quotation_id?: number; limit?: number }): Promise<QuotationAiAuditListResponse> {
    const parts: string[] = [];
    if (params?.quotation_id != null) parts.push(`quotation_id=${params.quotation_id}`);
    if (params?.limit != null) parts.push(`limit=${params.limit}`);
    const suffix = parts.length ? `?${parts.join("&")}` : "";
    return request<QuotationAiAuditListResponse>(`/api/v1/quotations/ai/audit-log${suffix}`);
  },
  async quotationAiMarkSuggestionDecisions(body: QuotationAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiApplySuggestions(body: QuotationAiApplySuggestionsRequest): Promise<QuotationAiApplySuggestionsResponse> {
    return request<QuotationAiApplySuggestionsResponse>("/api/v1/quotations/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiLinkSuggestionBatch(body: { batch_id: number; quotation_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/suggestion-batch/link-quotation", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiFinalizeSuggestionBatchAfterCreate(
    body: QuotationAiFinalizeAfterCreateRequest,
  ): Promise<QuotationAiFinalizeAfterCreateResponse> {
    return request<QuotationAiFinalizeAfterCreateResponse>(
      "/api/v1/quotations/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  async quotationCostingCompletenessCheck(
    body: { quotation_id: number },
  ): Promise<QuotationCostingAiCompletenessResponse> {
    return request<QuotationCostingAiCompletenessResponse>("/api/v1/quotations/ai/cost-completeness-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingAnomalyScan(body: { quotation_id: number }): Promise<QuotationCostingAiAnomalyScanResponse> {
    return request<QuotationCostingAiAnomalyScanResponse>("/api/v1/quotations/ai/costing-anomaly-scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingMarginRisk(body: { quotation_id: number }): Promise<QuotationCostingAiMarginRiskResponse> {
    return request<QuotationCostingAiMarginRiskResponse>("/api/v1/quotations/ai/margin-risk-explanation", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingFxSensitivity(body: { quotation_id: number }): Promise<QuotationCostingAiFxSensitivityResponse> {
    return request<QuotationCostingAiFxSensitivityResponse>("/api/v1/quotations/ai/fx-sensitivity-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSummary(body: { quotation_id: number }): Promise<QuotationCostingAiCostingSummaryResponse> {
    return request<QuotationCostingAiCostingSummaryResponse>("/api/v1/quotations/ai/costing-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingNextActions(body: { quotation_id: number }): Promise<QuotationCostingAiNextActionsResponse> {
    return request<QuotationCostingAiNextActionsResponse>("/api/v1/quotations/ai/costing-next-actions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingAuditLog(params?: { quotation_id?: number; limit?: number }): Promise<QuotationAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.quotation_id != null) q.set("quotation_id", String(params.quotation_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationAiAuditListResponse>(`/api/v1/quotations/ai/costing-audit-log${suffix}`);
  },

  async quotationCostingSuggestionsGenerate(body: { quotation_id: number }): Promise<QuotationCostingSuggestionBatchOut> {
    return request<QuotationCostingSuggestionBatchOut>("/api/v1/quotations/ai/costing-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSuggestionsGet(batchId: number): Promise<QuotationCostingSuggestionBatchOut> {
    return request<QuotationCostingSuggestionBatchOut>(`/api/v1/quotations/ai/costing-suggestions/${batchId}`);
  },
  async quotationCostingSuggestionsMarkDecisions(body: {
    batch_id: number;
    decisions: Array<{ item_id: number; decision: "apply" | "reject" | "skip" }>;
  }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/costing-suggestions/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSuggestionsApply(body: {
    quotation_id: number;
    batch_id: number;
    items: Array<{ item_id: number; decision: "apply" | "reject" | "skip" }>;
  }): Promise<QuotationCostingSuggestionApplyResponse> {
    return request<QuotationCostingSuggestionApplyResponse>("/api/v1/quotations/ai/costing-suggestions/apply", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSuggestionsDiscard(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/costing-suggestions/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostBenchmark(body: {
    quotation_id: number;
    same_customer_only?: boolean;
    months_back?: number;
  }): Promise<CostBenchmarkResponse> {
    return request<CostBenchmarkResponse>("/api/v1/quotations/ai/cost-benchmark", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostBenchmarkHistory(params?: { quotation_id?: number; limit?: number }): Promise<CostBenchmarkHistoryResponse> {
    const q = new URLSearchParams();
    if (params?.quotation_id != null) q.set("quotation_id", String(params.quotation_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostBenchmarkHistoryResponse>(`/api/v1/quotations/ai/cost-benchmark-history${suffix}`);
  },

  // ---------- Order AI ----------
  async orderAiExtract(file: File, orderId?: number): Promise<OrderAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (orderId != null) fd.append("order_id", String(orderId));
    return request<OrderAiExtractWrapResponse>("/api/v1/orders/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async orderAiEnrich(body: {
    order_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<OrderAiEnrichResponse> {
    return request<OrderAiEnrichResponse>("/api/v1/orders/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiValidate(body: {
    fields: Record<string, unknown>;
    order_id?: number | null;
  }): Promise<OrderAiValidateResponse> {
    return request<OrderAiValidateResponse>("/api/v1/orders/ai/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiValidateExecution(body: {
    fields: Record<string, unknown>;
    order_id?: number | null;
    include_promise_snapshot?: boolean;
  }): Promise<OrderAiValidateExecutionResponse> {
    return request<OrderAiValidateExecutionResponse>("/api/v1/orders/ai/validate-execution", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiPlanningRiskCheck(body: { order_id: number }): Promise<OrderAiPlanningRiskCheckResponse> {
    return request<OrderAiPlanningRiskCheckResponse>("/api/v1/orders/ai/planning-risk-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiAtpCtpSummary(body: { order_id: number }): Promise<OrderAiAtpCtpSummaryResponse> {
    return request<OrderAiAtpCtpSummaryResponse>("/api/v1/orders/ai/atp-ctp-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_order_id?: number | null;
  }): Promise<OrderAiDedupeResponse> {
    return request<OrderAiDedupeResponse>("/api/v1/orders/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiSummary(orderId: number): Promise<OrderAiSummaryResponse> {
    return request<OrderAiSummaryResponse>("/api/v1/orders/ai/summary", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    });
  },
  async orderAiNextActions(orderId: number, includePlanningContext?: boolean): Promise<OrderAiNextActionsResponse> {
    return request<OrderAiNextActionsResponse>("/api/v1/orders/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId, include_planning_context: Boolean(includePlanningContext) }),
    });
  },
  async orderAiAuditLog(params?: {
    order_id?: number;
    limit?: number;
    surface?: "all" | "planning";
  }): Promise<OrderAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.surface) q.set("surface", params.surface);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderAiAuditListResponse>(`/api/v1/orders/ai/audit-log${suffix}`);
  },
  async orderAiPlanningAuditLog(params?: { order_id?: number; limit?: number }): Promise<OrderAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderAiAuditListResponse>(`/api/v1/orders/ai/planning-audit-log${suffix}`);
  },
  async orderAiSimulationAuditLog(params?: { order_id?: number; limit?: number }): Promise<OrderAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderAiAuditListResponse>(`/api/v1/orders/ai/simulation-audit-log${suffix}`);
  },
  async orderAiCapacityBottleneckScan(body: { order_id: number }): Promise<OrderAiCapacityBottleneckScanResponse> {
    return request<OrderAiCapacityBottleneckScanResponse>("/api/v1/orders/ai/capacity-bottleneck-scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiWhatIfSimulation(body: {
    order_id: number;
    scenario_label?: string | null;
    delivery_date_shift_days?: number;
    quantity_scale_pct?: number | null;
    capacity_load_pct?: number | null;
    material_assumption?: "as_is" | "strict" | "relaxed";
  }): Promise<OrderAiWhatIfSimulationResponse> {
    return request<OrderAiWhatIfSimulationResponse>("/api/v1/orders/ai/what-if-simulation", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiPromiseSensitivityCheck(body: {
    order_id: number;
    delivery_offsets_days?: number[];
  }): Promise<OrderAiPromiseSensitivityCheckResponse> {
    return request<OrderAiPromiseSensitivityCheckResponse>("/api/v1/orders/ai/promise-sensitivity-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiExecutionPlanningSummary(body: { order_id: number }): Promise<OrderAiExecutionPlanningSummaryResponse> {
    return request<OrderAiExecutionPlanningSummaryResponse>("/api/v1/orders/ai/planning-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiMarkSuggestionDecisions(body: OrderAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/orders/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiApplySuggestions(body: OrderAiApplySuggestionsRequest): Promise<OrderAiApplySuggestionsResponse> {
    return request<OrderAiApplySuggestionsResponse>("/api/v1/orders/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/orders/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiLinkSuggestionBatch(body: { batch_id: number; order_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/orders/ai/suggestion-batch/link-order", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiFinalizeSuggestionBatchAfterCreate(
    body: OrderAiFinalizeAfterCreateRequest,
  ): Promise<OrderAiFinalizeAfterCreateResponse> {
    return request<OrderAiFinalizeAfterCreateResponse>(
      "/api/v1/orders/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  async uploadCustomerLogo(file: File): Promise<CustomerLogoUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return request<CustomerLogoUploadResponse>("/api/v1/customers/upload-logo", {
      method: "POST",
      body: form,
    });
  },
  async getCustomer(id: number): Promise<CustomerResponse> {
    return request<CustomerResponse>(`/api/v1/customers/${id}`);
  },
  async createCustomer(data: CustomerCreate): Promise<CustomerResponse> {
    return request<CustomerResponse>("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCustomer(id: number, data: CustomerUpdate): Promise<CustomerResponse> {
    return request<CustomerResponse>(`/api/v1/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteCustomer(id: number): Promise<void> {
    return request<void>(`/api/v1/customers/${id}`, { method: "DELETE" });
  },
  async listIntermediaries(params?: {
    kind?: "BUYING_HOUSE" | "AGENT";
    is_active?: boolean;
    q?: string;
  }): Promise<IntermediaryResponse[]> {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.is_active != null) q.set("is_active", String(params.is_active));
    if (params?.q) q.set("q", params.q);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<IntermediaryResponse[]>(`/api/v1/parties/intermediaries${suffix}`);
  },
  async createIntermediary(data: IntermediaryCreate): Promise<IntermediaryResponse> {
    return request<IntermediaryResponse>("/api/v1/parties/intermediaries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateIntermediary(id: number, data: IntermediaryUpdate): Promise<IntermediaryResponse> {
    return request<IntermediaryResponse>(`/api/v1/parties/intermediaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteIntermediary(id: number): Promise<void> {
    return request<void>(`/api/v1/parties/intermediaries/${id}`, { method: "DELETE" });
  },
  async listCustomerIntermediaryLinks(params?: {
    customer_id?: number;
    intermediary_id?: number;
  }): Promise<CustomerIntermediaryLinkResponse[]> {
    const q = new URLSearchParams();
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.intermediary_id != null) q.set("intermediary_id", String(params.intermediary_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerIntermediaryLinkResponse[]>(`/api/v1/parties/customer-intermediaries${suffix}`);
  },
  async createCustomerIntermediaryLink(
    data: CustomerIntermediaryLinkCreate
  ): Promise<CustomerIntermediaryLinkResponse> {
    return request<CustomerIntermediaryLinkResponse>("/api/v1/parties/customer-intermediaries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCustomerIntermediaryLink(
    id: number,
    data: CustomerIntermediaryLinkUpdate
  ): Promise<CustomerIntermediaryLinkResponse> {
    return request<CustomerIntermediaryLinkResponse>(`/api/v1/parties/customer-intermediaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteCustomerIntermediaryLink(id: number): Promise<void> {
    return request<void>(`/api/v1/parties/customer-intermediaries/${id}`, {
      method: "DELETE",
    });
  },
  async listInquiries(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    limit?: number;
    offset?: number;
    /** 1 = include rules-based AI indicators per row (no LLM). */
    ai_indicators?: 0 | 1;
  }): Promise<InquiryResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.ai_indicators === 1) q.set("ai_indicators", "1");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryResponse[]>(`/api/v1/inquiries${suffix}`);
  },
  async listInquiriesPaginated(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: 0 | 1;
    page?: number;
    page_size?: number;
  }): Promise<InquiryListPageResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators === 1) q.set("ai_indicators", "1");
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryListPageResponse>(`/api/v1/inquiries/paginated${suffix}`);
  },
  async getInquiry(id: number): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}`);
  },
  async createInquiry(data: InquiryCreate): Promise<InquiryResponse> {
    return request<InquiryResponse>("/api/v1/inquiries", {
      method: "POST",
      body: JSON.stringify(inquiryWriteBodyForApi(data)),
    });
  },
  async updateInquiry(id: number, data: InquiryUpdate): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(inquiryWriteBodyForApi(data)),
    });
  },
  async deleteInquiry(id: number): Promise<void> {
    return request<void>(`/api/v1/inquiries/${id}`, { method: "DELETE" });
  },
  async listQuotations(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    benchmark_hint?: number;
    /** When true, hide superseded (older) revisions. */
    latest_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<QuotationResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.benchmark_hint != null) q.set("benchmark_hint", String(params.benchmark_hint));
    if (params?.latest_only) q.set("latest_only", "true");
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationResponse[]>(`/api/v1/quotations${suffix}`);
  },
  async listQuotationsPaginated(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    benchmark_hint?: number;
    /** When true, hide superseded (older) revisions. */
    latest_only?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<QuotationListPageResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.benchmark_hint != null) q.set("benchmark_hint", String(params.benchmark_hint));
    if (params?.latest_only) q.set("latest_only", "true");
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationListPageResponse>(`/api/v1/quotations/paginated${suffix}`);
  },
  async getQuotation(id: number, params?: { ai_indicators?: 0 | 1 }): Promise<QuotationDetailResponse> {
    const q =
      params?.ai_indicators === 1 ? `?ai_indicators=${params.ai_indicators}` : "";
    return request<QuotationDetailResponse>(`/api/v1/quotations/${id}${q}`);
  },
  async createQuotation(data: QuotationCreate): Promise<QuotationResponse> {
    return request<QuotationResponse>("/api/v1/quotations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateQuotation(id: number, data: QuotationUpdate): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteQuotation(id: number): Promise<void> {
    return request<void>(`/api/v1/quotations/${id}`, { method: "DELETE" });
  },
  async updateQuotationFull(id: number, data: QuotationFullUpdate): Promise<QuotationDetailResponse> {
    return request<QuotationDetailResponse>(`/api/v1/quotations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async listOrders(params?: {
    search?: string;
    status?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    limit?: number;
    offset?: number;
  }): Promise<OrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderResponse[]>(`/api/v1/orders${suffix}`);
  },
  async listOrdersPaginated(params?: {
    search?: string;
    status?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    page?: number;
    page_size?: number;
  }): Promise<OrderListPageResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderListPageResponse>(`/api/v1/orders/paginated${suffix}`);
  },
  async getOrder(id: number, params?: { ai_indicators?: number }): Promise<OrderResponse> {
    const q = new URLSearchParams();
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderResponse>(`/api/v1/orders/${id}${suffix}`);
  },
  /** Same data as GET /merch/orders/{id}/material-requirement (PrimeX-style path). */
  async getOrderMaterials(orderId: number): Promise<MaterialRequirementResponse> {
    return request<MaterialRequirementResponse>(`/api/v1/orders/${orderId}/materials`);
  },
  async getOrderPromiseCheck(id: number): Promise<OrderPromiseCheckResponse> {
    return request<OrderPromiseCheckResponse>(`/api/v1/orders/${id}/promise-check`);
  },
  async getOrderCommercialAlignment(orderId: number): Promise<OrderCommercialAlignmentResponse> {
    return request<OrderCommercialAlignmentResponse>(`/api/v1/orders/${orderId}/commercial-alignment`);
  },
  async getOrderCostVariance(orderId: number): Promise<OrderCostVarianceResponse> {
    return request<OrderCostVarianceResponse>(`/api/v1/orders/${orderId}/cost-variance`);
  },
  async getOrdersProfitabilitySummary(params?: {
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<OrderProfitabilitySummaryPage> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderProfitabilitySummaryPage>(`/api/v1/orders/profitability-summary${suffix}`);
  },
  async getPendingPriceVerifications(params?: { limit?: number }): Promise<PendingPriceVerificationItem[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PendingPriceVerificationItem[]>(`/api/v1/orders/pending-price-verifications${suffix}`);
  },
  async getOrderPromiseSummary(params?: { statuses?: string; limit?: number }): Promise<OrderPromiseSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.statuses) q.set("statuses", params.statuses);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderPromiseSummaryResponse>(`/api/v1/orders/promise-summary${suffix}`);
  },
  async createOrder(data: OrderCreate): Promise<OrderResponse> {
    return request<OrderResponse>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateOrder(id: number, data: OrderUpdate): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/v1/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteOrder(id: number): Promise<void> {
    return request<void>(`/api/v1/orders/${id}`, { method: "DELETE" });
  },
  async convertQuotationToOrder(id: number): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/v1/orders/from-quotation/${id}`, {
      method: "POST",
    });
  },
  async updateOrderStatus(
    id: number,
    status: string,
    opts?: { force_pipeline_status?: string | null },
  ): Promise<OrderResponse> {
    const body: Record<string, unknown> = { status };
    if (opts?.force_pipeline_status) {
      body.force_pipeline_status = opts.force_pipeline_status;
    }
    return request<OrderResponse>(`/api/v1/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getOrderMilestones(orderId: number): Promise<OrderMilestonesResponse> {
    return request<OrderMilestonesResponse>(`/api/v1/orders/${orderId}/milestones`);
  },
  async updateOrderPipelineSettings(
    orderId: number,
    data: { na_steps?: string[]; order_type?: string },
  ): Promise<OrderMilestonesResponse> {
    return request<OrderMilestonesResponse>(`/api/v1/orders/${orderId}/pipeline-settings`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listOrderAmendments(id: number): Promise<OrderAmendmentResponse[]> {
    return request<OrderAmendmentResponse[]>(`/api/v1/orders/${id}/amendments`);
  },
  async createOrderAmendment(id: number, data: OrderAmendmentCreate): Promise<OrderAmendmentResponse> {
    return request<OrderAmendmentResponse>(`/api/v1/orders/${id}/amendments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getOrderPlanningGrounding(orderId: number): Promise<PlanningGroundingSnapshot> {
    return request<PlanningGroundingSnapshot>(`/api/v1/orders/${orderId}/planning-grounding`);
  },
  async getOrdersPlanningGroundingSummary(orderIds: number[]): Promise<PlanningGroundingSummaryRow[]> {
    if (!orderIds.length) return [];
    const q = new URLSearchParams();
    q.set("order_ids", orderIds.join(","));
    return request<PlanningGroundingSummaryRow[]>(`/api/v1/orders/planning-grounding-summary?${q.toString()}`);
  },
  async listOrderChangeRequests(
    orderId: number,
    params?: { status?: string; limit?: number; offset?: number }
  ): Promise<CommercialChangeRequestOut[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialChangeRequestOut[]>(`/api/v1/orders/${orderId}/change-requests${suffix}`);
  },
  async listQuotationChangeRequests(
    quotationId: number,
    params?: { status?: string; limit?: number; offset?: number }
  ): Promise<CommercialChangeRequestOut[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialChangeRequestOut[]>(
      `/api/v1/quotations/${quotationId}/change-requests${suffix}`
    );
  },
  async getOrderCommercialTimeline(orderId: number, params?: { limit?: number }): Promise<CommercialTimelineOut> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialTimelineOut>(`/api/v1/orders/${orderId}/commercial-timeline${suffix}`);
  },
  async getQuotationCommercialTimeline(
    quotationId: number,
    params?: { limit?: number }
  ): Promise<CommercialTimelineOut> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialTimelineOut>(
      `/api/v1/quotations/${quotationId}/commercial-timeline${suffix}`
    );
  },
  async convertInquiryToQuotation(
    id: number,
    data?: { profit_percentage?: number }
  ): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/from-inquiry/${id}`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  async getOrderColorSizeMatrix(orderId: number): Promise<OrderColorSizeMatrix> {
    return request<OrderColorSizeMatrix>(`/api/v1/orders/${orderId}/color-size-matrix`);
  },
  async saveOrderColorSizeMatrix(
    orderId: number,
    body: {
      colors: { name: string; code?: string | null }[];
      sizes: string[];
      cells: { color: string; size: string; quantity: number }[];
      sync_order_quantity?: boolean;
    },
  ): Promise<OrderColorSizeMatrix> {
    return request<OrderColorSizeMatrix>(`/api/v1/orders/${orderId}/color-size-matrix`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async submitQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/submit`, { method: "POST" });
  },
  async approveQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/approve`, { method: "POST" });
  },
  async sendQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/send`, { method: "POST" });
  },
  async reviseQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/revise`, { method: "POST" });
  },
  /** All versions of a quotation (v1 first); the current one has is_latest_revision = true. */
  async listQuotationRevisions(id: number): Promise<QuotationResponse[]> {
    return request<QuotationResponse[]>(`/api/v1/quotations/${id}/revisions`);
  },
  async updateInquiryStatus(id: number, status: string, notes?: string): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    });
  },
  async getInquiryTrace(id: number): Promise<InquiryEventResponse[]> {
    return request<InquiryEventResponse[]>(`/api/v1/inquiries/${id}/trace`);
  },
};
