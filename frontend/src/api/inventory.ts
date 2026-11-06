/**
 * Inventory & warehouse API calls (`/api/v1/inventory/*`).
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types still live in `api/client.ts`.
 */
import { fetchAllPaginated, request, requestBlob, requestWithTotal } from "@/api/core";
import type { ListWithTotal, PaginatedRows } from "@/api/core";
import { API_BASE } from "@/api/apiBase";
import type {
  AbcAnalysisReport,
  ConsignmentStockRow,
  ConsumptionChangeRequestCreate,
  ConsumptionChangeRequestResponse,
  ConsumptionIssueCreate,
  ConsumptionReservationRow,
  ConsumptionSnapshotResponse,
  CycleCountTask,
  DeliveryChallanCreate,
  DeliveryChallanResponse,
  DocumentHistoryEvent,
  EnhancedGatePassCreate,
  EnhancedGatePassResponse,
  EoqResult,
  GodownStockResponse,
  GoodsReceivingCreate,
  GoodsReceivingResponse,
  GrnQualityInspection,
  InterDepartmentTransferCreate,
  InterDepartmentTransferResponse,
  InventoryDocumentPrintPayload,
  InventoryDocumentVerifyResponse,
  InventoryGlPostingDetail,
  InventoryItemCreate,
  InventoryItemResponse,
  InventoryItemUpdate,
  InventoryQualityDashboardResponse,
  InventoryReconciliationOverview,
  ItemCategoryCreate,
  ItemCategoryResponse,
  ItemCategoryUpdate,
  ItemKitResponse,
  ItemSubcategoryCreate,
  ItemSubcategoryResponse,
  ItemSubcategoryUpdate,
  ItemUnitCreate,
  ItemUnitResponse,
  ItemUnitUpdate,
  LotTraceResponse,
  ManufacturingOrderCreate,
  ManufacturingOrderResponse,
  ManufacturingStageResponse,
  ManufacturingStageUpdate,
  MaterialControlStockMovementRow,
  MrpRunResult,
  PlannedOrderReleaseResult,
  PlannedOrderResponse,
  PoColorSizeGrid,
  PostCostingReportResponse,
  ProcessLossReportResponse,
  ProcessLossStandardResponse,
  ProcessOrderCreate,
  ProcessOrderReceive,
  ProcessOrderResponse,
  ProductionMaterialIssueCreate,
  ProductionMaterialIssueDetailResponse,
  ProductionMaterialIssueResponse,
  PurchaseOrderCreate,
  PurchaseOrderReceiptProgress,
  PurchaseOrderResponse,
  ReorderCheckResult,
  ReorderConvertResult,
  ReorderSuggestionResponse,
  SerialTrace,
  StockAdjustmentCreate,
  StockAdjustmentResponse,
  StockAgingReport,
  StockBatchRow,
  StockByGodownMatrixResponse,
  StockDashboardResponse,
  StockGroupCreate,
  StockGroupResponse,
  StockGroupTreeNode,
  StockGroupUpdate,
  StockItemCreateBody,
  StockItemDetailResponse,
  StockItemListResponse,
  StockItemListRow,
  StockItemPriceUpsert,
  StockLedgerPageResponse,
  StockOverviewResponse,
  StockSerialRow,
  StockSummaryByGroupResponse,
  StockSummaryByWarehouseResponse,
  StockSummaryRow,
  StockTransferCreateBody,
  StockTransferResult,
  StockValuationResponse,
  StockValuationResult,
  StockVsGlResponse,
  VendorAiApplySuggestionsRequest,
  VendorAiApplySuggestionsResponse,
  VendorAiAuditListResponse,
  VendorAiDedupeResponse,
  VendorAiEnrichResponse,
  VendorAiExtractWrapResponse,
  VendorAiFinalizeAfterCreateRequest,
  VendorAiFinalizeAfterCreateResponse,
  VendorAiMarkDecisionsRequest,
  VendorAiNextActionsResponse,
  VendorAiSummaryResponse,
  VendorAiValidateResponse,
  VendorCreate,
  VendorResponse,
  VendorScorecardRow,
  VendorUpdate,
  WarehouseCreate,
  WarehouseResponse,
  WarehouseTransferCreate,
  WarehouseTransferResponse,
  WarehouseUpdate,
  WipSummaryResponse,
  WipVsGlResponse,
} from "@/api/models";

export const inventoryApi = {
  async listPurchaseOrderSupplierUpdates(
    poId: number,
  ): Promise<{ id: number; kind: string; expected_ship_date: string | null; message: string | null; created_at: string; supplier_user: string | null }[]> {
    return request(`/api/v1/inventory/purchase-orders/${poId}/supplier-updates`);
  },
  async vendorAiExtract(file: File, vendorId?: number): Promise<VendorAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (vendorId != null) fd.append("vendor_id", String(vendorId));
    return request<VendorAiExtractWrapResponse>("/api/v1/inventory/vendors/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async vendorAiEnrich(body: {
    vendor_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<VendorAiEnrichResponse> {
    return request<VendorAiEnrichResponse>("/api/v1/inventory/vendors/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiValidate(body: {
    fields: Record<string, unknown>;
    vendor_id?: number | null;
  }): Promise<VendorAiValidateResponse> {
    return request<VendorAiValidateResponse>("/api/v1/inventory/vendors/ai/validate", {
      method: "POST",
      body: JSON.stringify({
        fields: body.fields,
        vendor_id: body.vendor_id ?? undefined,
      }),
    });
  },
  async vendorAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_vendor_id?: number | null;
  }): Promise<VendorAiDedupeResponse> {
    return request<VendorAiDedupeResponse>("/api/v1/inventory/vendors/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiSummary(vendorId: number): Promise<VendorAiSummaryResponse> {
    return request<VendorAiSummaryResponse>("/api/v1/inventory/vendors/ai/summary", {
      method: "POST",
      body: JSON.stringify({ vendor_id: vendorId }),
    });
  },
  async vendorAiNextActions(vendorId: number): Promise<VendorAiNextActionsResponse> {
    return request<VendorAiNextActionsResponse>("/api/v1/inventory/vendors/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ vendor_id: vendorId }),
    });
  },
  async vendorAiAuditLog(params?: { vendor_id?: number; limit?: number }): Promise<VendorAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VendorAiAuditListResponse>(`/api/v1/inventory/vendors/ai/audit-log${suffix}`);
  },
  async vendorAiMarkSuggestionDecisions(body: VendorAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/vendors/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiApplySuggestions(body: VendorAiApplySuggestionsRequest): Promise<VendorAiApplySuggestionsResponse> {
    return request<VendorAiApplySuggestionsResponse>(
      "/api/v1/inventory/vendors/ai/suggestion-batch/apply-suggestions",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  async vendorAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/vendors/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiLinkSuggestionBatch(body: { batch_id: number; vendor_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/vendors/ai/suggestion-batch/link-vendor", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiFinalizeSuggestionBatchAfterCreate(
    body: VendorAiFinalizeAfterCreateRequest,
  ): Promise<VendorAiFinalizeAfterCreateResponse> {
    return request<VendorAiFinalizeAfterCreateResponse>(
      "/api/v1/inventory/vendors/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  // Inventory module (legacy parity wave)
  async listInventoryItemCategories(params?: { search?: string; limit?: number }): Promise<ItemCategoryResponse[]> {
    const q = new URLSearchParams();
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemCategoryResponse[]>(`/api/v1/inventory/item-categories${suffix}`);
  },
  async createInventoryItemCategory(data: ItemCategoryCreate): Promise<ItemCategoryResponse> {
    return request<ItemCategoryResponse>("/api/v1/inventory/item-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemCategory(id: number, data: ItemCategoryUpdate): Promise<ItemCategoryResponse> {
    return request<ItemCategoryResponse>(`/api/v1/inventory/item-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemCategory(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-categories/${id}`, { method: "DELETE" });
  },
  async listInventoryItemSubcategories(params?: {
    category_id?: number;
    search?: string;
    limit?: number;
  }): Promise<ItemSubcategoryResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemSubcategoryResponse[]>(`/api/v1/inventory/item-subcategories${suffix}`);
  },
  async createInventoryItemSubcategory(data: ItemSubcategoryCreate): Promise<ItemSubcategoryResponse> {
    return request<ItemSubcategoryResponse>("/api/v1/inventory/item-subcategories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemSubcategory(id: number, data: ItemSubcategoryUpdate): Promise<ItemSubcategoryResponse> {
    return request<ItemSubcategoryResponse>(`/api/v1/inventory/item-subcategories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemSubcategory(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-subcategories/${id}`, { method: "DELETE" });
  },
  async listInventoryItemUnits(params?: { search?: string; limit?: number }): Promise<ItemUnitResponse[]> {
    const q = new URLSearchParams();
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemUnitResponse[]>(`/api/v1/inventory/item-units${suffix}`);
  },
  async createInventoryItemUnit(data: ItemUnitCreate): Promise<ItemUnitResponse> {
    return request<ItemUnitResponse>("/api/v1/inventory/item-units", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemUnit(id: number, data: ItemUnitUpdate): Promise<ItemUnitResponse> {
    return request<ItemUnitResponse>(`/api/v1/inventory/item-units/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemUnit(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-units/${id}`, { method: "DELETE" });
  },
  async listInventoryItems(params?: { category_id?: number; subcategory_id?: number }): Promise<InventoryItemResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.category_id != null) q.set("category_id", String(params.category_id));
      if (params?.subcategory_id != null) q.set("subcategory_id", String(params.subcategory_id));
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<InventoryItemResponse>>(`/api/v1/inventory/items?${q.toString()}`);
    });
  },
  /** Single page of items (use for list UIs; avoids downloading the full catalog). */
  async listInventoryItemsPaginated(params?: {
    category_id?: number;
    subcategory_id?: number;
    /** Substring match on code or name (server-side). */
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<InventoryItemResponse>> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.subcategory_id != null) q.set("subcategory_id", String(params.subcategory_id));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<InventoryItemResponse>>(`/api/v1/inventory/items${suffix}`);
  },
  async getInventoryItem(id: number): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>(`/api/v1/inventory/items/${id}`);
  },
  async createInventoryItem(data: InventoryItemCreate): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>("/api/v1/inventory/items", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItem(id: number, data: InventoryItemUpdate): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>(`/api/v1/inventory/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItem(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/items/${id}`, { method: "DELETE" });
  },
  async listWarehouses(): Promise<WarehouseResponse[]> {
    return request<WarehouseResponse[]>("/api/v1/inventory/warehouses");
  },
  async createWarehouse(data: WarehouseCreate): Promise<WarehouseResponse> {
    return request<WarehouseResponse>("/api/v1/inventory/warehouses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateWarehouse(id: number, data: WarehouseUpdate): Promise<WarehouseResponse> {
    return request<WarehouseResponse>(`/api/v1/inventory/warehouses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteWarehouse(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/warehouses/${id}`, { method: "DELETE" });
  },
  async listVendors(params?: {
    search?: string;
    is_active?: boolean;
    vendor_type?: string;
    currency?: string;
    ledger_id?: number;
    has_ledger?: boolean;
  }): Promise<VendorResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
      if (params?.vendor_type) q.set("vendor_type", params.vendor_type);
      if (params?.currency) q.set("currency", params.currency);
      if (params?.ledger_id != null) q.set("ledger_id", String(params.ledger_id));
      if (params?.has_ledger !== undefined) q.set("has_ledger", String(params.has_ledger));
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<VendorResponse>>(`/api/v1/inventory/vendors?${q.toString()}`);
    });
  },
  async listVendorsPaginated(params?: {
    search?: string;
    is_active?: boolean;
    vendor_type?: string;
    currency?: string;
    ledger_id?: number;
    has_ledger?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<VendorResponse>> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
    if (params?.vendor_type) q.set("vendor_type", params.vendor_type);
    if (params?.currency) q.set("currency", params.currency);
    if (params?.ledger_id != null) q.set("ledger_id", String(params.ledger_id));
    if (params?.has_ledger !== undefined) q.set("has_ledger", String(params.has_ledger));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<VendorResponse>>(`/api/v1/inventory/vendors${suffix}`);
  },
  async getVendor(id: number): Promise<VendorResponse> {
    return request<VendorResponse>(`/api/v1/inventory/vendors/${id}`);
  },
  async createVendor(data: VendorCreate): Promise<VendorResponse> {
    return request<VendorResponse>("/api/v1/inventory/vendors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateVendor(id: number, data: VendorUpdate): Promise<VendorResponse> {
    return request<VendorResponse>(`/api/v1/inventory/vendors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteVendor(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/vendors/${id}`, { method: "DELETE" });
  },
  async listStockGroups(): Promise<StockGroupResponse[]> {
    return request<StockGroupResponse[]>("/api/v1/inventory/stock-groups");
  },
  async createStockGroup(data: StockGroupCreate): Promise<StockGroupResponse> {
    return request<StockGroupResponse>("/api/v1/inventory/stock-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStockGroup(id: number, data: StockGroupUpdate): Promise<StockGroupResponse> {
    return request<StockGroupResponse>(`/api/v1/inventory/stock-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStockGroup(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/stock-groups/${id}`, { method: "DELETE" });
  },

  // --- Sprint 2: stock hierarchy / batches / godown ---
  async getStockGroupsTree(): Promise<StockGroupTreeNode[]> {
    return request<StockGroupTreeNode[]>("/api/v1/inventory/stock-groups/tree");
  },
  async listStockGroupItems(groupId: number): Promise<StockItemListRow[]> {
    return request<StockItemListRow[]>(`/api/v1/inventory/stock-groups/${groupId}/items`);
  },
  async listStockItemsEnhanced(params?: {
    group_id?: number;
    search?: string;
    low_stock?: boolean;
    expiry_nearing?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<StockItemListResponse> {
    const q = new URLSearchParams();
    if (params?.group_id != null) q.set("group_id", String(params.group_id));
    if (params?.search) q.set("search", params.search);
    if (params?.low_stock) q.set("low_stock", "true");
    if (params?.expiry_nearing) q.set("expiry_nearing", "true");
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q}` : "";
    return request<StockItemListResponse>(`/api/v1/inventory/stock-items${suffix}`);
  },
  async getStockItemDetail(id: number): Promise<StockItemDetailResponse> {
    return request<StockItemDetailResponse>(`/api/v1/inventory/stock-items/${id}`);
  },
  async createStockItemEnhanced(data: StockItemCreateBody): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>("/api/v1/inventory/stock-items", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async putStockItemPrices(
    itemId: number,
    prices: StockItemPriceUpsert[],
  ): Promise<{ ok: boolean; count: number }> {
    return request(`/api/v1/inventory/stock-items/${itemId}/prices`, {
      method: "PUT",
      body: JSON.stringify({ prices }),
    });
  },
  async listStockItemBatches(
    itemId: number,
    godownId?: number,
  ): Promise<StockBatchRow[]> {
    const q = godownId != null ? `?godown_id=${godownId}` : "";
    return request<StockBatchRow[]>(`/api/v1/inventory/stock-items/${itemId}/batches${q}`);
  },
  async listExpiringBatches(days = 30): Promise<StockBatchRow[]> {
    return request<StockBatchRow[]>(`/api/v1/inventory/stock-batches/expiring?days=${days}`);
  },
  async getGodownStock(godownId: number): Promise<GodownStockResponse> {
    return request<GodownStockResponse>(`/api/v1/inventory/godowns/${godownId}/stock`);
  },
  async getStockByGodownMatrix(params?: {
    group_id?: number;
    godown_id?: number;
  }): Promise<StockByGodownMatrixResponse> {
    const q = new URLSearchParams();
    if (params?.group_id != null) q.set("group_id", String(params.group_id));
    if (params?.godown_id != null) q.set("godown_id", String(params.godown_id));
    const suffix = q.toString() ? `?${q}` : "";
    return request<StockByGodownMatrixResponse>(`/api/v1/inventory/stock-by-godown${suffix}`);
  },
  async createStockTransfer(data: StockTransferCreateBody): Promise<StockTransferResult> {
    return request<StockTransferResult>("/api/v1/inventory/stock-transfers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getStockItemValuation(
    itemId: number,
    params?: { godown_id?: number; method?: string; as_of_date?: string },
  ): Promise<StockValuationResult> {
    const q = new URLSearchParams();
    if (params?.godown_id != null) q.set("godown_id", String(params.godown_id));
    if (params?.method) q.set("method", params.method);
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    const suffix = q.toString() ? `?${q}` : "";
    return request<StockValuationResult>(`/api/v1/inventory/stock-items/${itemId}/valuation${suffix}`);
  },

  async getPurchaseOrder(id: number): Promise<PurchaseOrderResponse> {
    return request<PurchaseOrderResponse>(`/api/v1/inventory/purchase-orders/${id}`);
  },
  async listPurchaseOrders(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    source_bom_id?: number;
    vendor_id?: number;
    order_id?: number;
    exclude_po_linked_to_proforma?: number;
    exclude_linked_to_proforma_invoice_id?: number;
  }): Promise<PurchaseOrderResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.status_filter) q.set("status_filter", params.status_filter);
      if (params?.date_from) q.set("date_from", params.date_from);
      if (params?.date_to) q.set("date_to", params.date_to);
      if (params?.source_bom_id != null) q.set("source_bom_id", String(params.source_bom_id));
      if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
      if (params?.order_id != null) q.set("order_id", String(params.order_id));
      if (params?.exclude_po_linked_to_proforma != null) {
        q.set("exclude_po_linked_to_proforma", String(params.exclude_po_linked_to_proforma));
      }
      if (params?.exclude_linked_to_proforma_invoice_id != null) {
        q.set(
          "exclude_linked_to_proforma_invoice_id",
          String(params.exclude_linked_to_proforma_invoice_id)
        );
      }
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<PurchaseOrderResponse>>(`/api/v1/inventory/purchase-orders?${q.toString()}`);
    }, 100);
  },
  async listPurchaseOrdersPaginated(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    source_bom_id?: number;
    vendor_id?: number;
    order_id?: number;
    exclude_po_linked_to_proforma?: number;
    exclude_linked_to_proforma_invoice_id?: number;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<PurchaseOrderResponse>> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.source_bom_id != null) q.set("source_bom_id", String(params.source_bom_id));
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.exclude_po_linked_to_proforma != null) {
      q.set("exclude_po_linked_to_proforma", String(params.exclude_po_linked_to_proforma));
    }
    if (params?.exclude_linked_to_proforma_invoice_id != null) {
      q.set(
        "exclude_linked_to_proforma_invoice_id",
        String(params.exclude_linked_to_proforma_invoice_id)
      );
    }
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<PurchaseOrderResponse>>(`/api/v1/inventory/purchase-orders${suffix}`);
  },
  async createPurchaseOrder(data: PurchaseOrderCreate): Promise<PurchaseOrderResponse> {
    return request<PurchaseOrderResponse>("/api/v1/inventory/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updatePurchaseOrderStatus(id: number, status: string, reason?: string): Promise<PurchaseOrderResponse> {
    return request<PurchaseOrderResponse>(`/api/v1/inventory/purchase-orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(reason?.trim() ? { status, reason: reason.trim() } : { status }),
    });
  },
  async getPurchaseOrderHistory(id: number): Promise<{ purchase_order_id: number; events: DocumentHistoryEvent[] }> {
    return request(`/api/v1/inventory/purchase-orders/${id}/history`);
  },
  async getPurchaseOrderReceiptProgress(poId: number): Promise<PurchaseOrderReceiptProgress> {
    return request<PurchaseOrderReceiptProgress>(`/api/v1/inventory/purchase-orders/${poId}/receipt-progress`);
  },
  async getGoodsReceiving(id: number): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>(`/api/v1/inventory/goods-receiving/${id}`);
  },
  async listGoodsReceiving(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    purchase_order_id?: number;
  }): Promise<GoodsReceivingResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.status_filter) q.set("status_filter", params.status_filter);
      if (params?.date_from) q.set("date_from", params.date_from);
      if (params?.date_to) q.set("date_to", params.date_to);
      if (params?.purchase_order_id != null) q.set("purchase_order_id", String(params.purchase_order_id));
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<GoodsReceivingResponse>>(`/api/v1/inventory/goods-receiving?${q.toString()}`);
    }, 100);
  },
  async listGoodsReceivingPaginated(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    purchase_order_id?: number;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<GoodsReceivingResponse>> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.purchase_order_id != null) q.set("purchase_order_id", String(params.purchase_order_id));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<GoodsReceivingResponse>>(`/api/v1/inventory/goods-receiving${suffix}`);
  },
  async createGoodsReceiving(data: GoodsReceivingCreate): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>("/api/v1/inventory/goods-receiving", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async receiveGoods(id: number): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>(`/api/v1/inventory/goods-receiving/${id}/receive`, {
      method: "POST",
    });
  },
  async acknowledgeGoodsReceiving(id: number): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>(`/api/v1/inventory/goods-receiving/${id}/acknowledge`, { method: "POST" });
  },
  async getGoodsReceivingPrintData(id: number): Promise<InventoryDocumentPrintPayload & Record<string, unknown>> {
    return request<InventoryDocumentPrintPayload & Record<string, unknown>>(`/api/v1/inventory/goods-receiving/${id}/print-data`);
  },
  async getPoColorSizeGrid(poId: number): Promise<PoColorSizeGrid> {
    return request<PoColorSizeGrid>(`/api/v1/inventory/purchase-orders/${poId}/color-size`);
  },
  async savePoItemColorSizeGrid(
    poId: number,
    poItemId: number,
    body: {
      colors: { name: string; code?: string | null }[];
      sizes: string[];
      cells: { color: string; size: string; quantity: string }[];
    },
  ): Promise<PoColorSizeGrid> {
    return request<PoColorSizeGrid>(`/api/v1/inventory/purchase-orders/${poId}/items/${poItemId}/color-size`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async bulkPurchaseOrderStatus(
    ids: number[],
    status: string,
    reason?: string,
  ): Promise<{ updated: number; skipped?: { id: number; detail: string }[] }> {
    return request<{ updated: number; skipped?: { id: number; detail: string }[] }>("/api/v1/inventory/purchase-orders/bulk-status", {
      method: "POST",
      body: JSON.stringify(reason?.trim() ? { ids, status, reason: reason.trim() } : { ids, status }),
    });
  },
  async bulkReceiveGoods(ids: number[]): Promise<Array<{ id: number; ok: boolean; grn_code?: string; detail?: unknown }>> {
    return request(`/api/v1/inventory/goods-receiving/bulk-receive`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },
  async getStockSummary(params?: { limit?: number; offset?: number }): Promise<StockSummaryRow[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockSummaryRow[]>(`/api/v1/inventory/stock-summary${suffix}`);
  },
  async getStockSummaryWithTotal(params?: {
    limit?: number;
    offset?: number;
    search?: string;
    warehouse_id?: number;
    hide_zero?: boolean;
    sort?: "item" | "warehouse" | "in" | "out" | "on_hand";
    sort_dir?: "asc" | "desc";
  }): Promise<ListWithTotal<StockSummaryRow>> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    if (params?.hide_zero) q.set("hide_zero", "true");
    if (params?.sort) q.set("sort", params.sort);
    if (params?.sort_dir) q.set("sort_dir", params.sort_dir);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<StockSummaryRow>(`/api/v1/inventory/stock-summary${suffix}`);
  },
  async getStockValuation(params?: { as_of_date?: string }): Promise<StockValuationResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockValuationResponse>(`/api/v1/inventory/stock-valuation${suffix}`);
  },

  async postFifoRebuild(): Promise<{ ok: boolean; movements_replayed: number }> {
    return request<{ ok: boolean; movements_replayed: number }>("/api/v1/inventory/fifo-rebuild", { method: "POST" });
  },

  async getStockSummaryByGroup(as_of_date?: string): Promise<StockSummaryByGroupResponse> {
    const q = as_of_date ? `?as_of_date=${encodeURIComponent(as_of_date)}` : "";
    return request<StockSummaryByGroupResponse>(`/api/v1/inventory/stock-summary/by-group${q}`);
  },

  async getStockSummaryByWarehouse(as_of_date?: string): Promise<StockSummaryByWarehouseResponse> {
    const q = as_of_date ? `?as_of_date=${encodeURIComponent(as_of_date)}` : "";
    return request<StockSummaryByWarehouseResponse>(`/api/v1/inventory/stock-summary/by-warehouse${q}`);
  },

  async getStockSummaryWip(): Promise<WipSummaryResponse> {
    return request<WipSummaryResponse>("/api/v1/inventory/stock-summary/wip");
  },

  async getStockSummaryOverview(as_of_date?: string): Promise<StockOverviewResponse> {
    const q = as_of_date ? `?as_of_date=${encodeURIComponent(as_of_date)}` : "";
    return request<StockOverviewResponse>(`/api/v1/inventory/stock-summary/overview${q}`);
  },

  async getReconciliationStockVsGl(): Promise<StockVsGlResponse> {
    return request<StockVsGlResponse>("/api/v1/inventory/reconciliation/stock-vs-gl");
  },

  async getReconciliationWipVsGl(): Promise<WipVsGlResponse> {
    return request<WipVsGlResponse>("/api/v1/inventory/reconciliation/wip-vs-gl");
  },
  async getStockDashboard(params?: { low_stock_threshold?: number }): Promise<StockDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.low_stock_threshold != null) q.set("low_stock_threshold", String(params.low_stock_threshold));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockDashboardResponse>(`/api/v1/inventory/stock-dashboard${suffix}`);
  },
  async getStockLedger(params?: {
    item_id?: number;
    warehouse_id?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<StockLedgerPageResponse> {
    const q = new URLSearchParams();
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockLedgerPageResponse>(`/api/v1/inventory/stock-ledger${suffix}`);
  },
  async listWarehouseTransfers(params?: { status_filter?: string }): Promise<WarehouseTransferResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WarehouseTransferResponse[]>(`/api/v1/inventory/warehouse-transfers${suffix}`);
  },
  async createWarehouseTransfer(data: WarehouseTransferCreate): Promise<WarehouseTransferResponse> {
    return request<WarehouseTransferResponse>("/api/v1/inventory/warehouse-transfers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postWarehouseTransfer(id: number): Promise<WarehouseTransferResponse> {
    return request<WarehouseTransferResponse>(`/api/v1/inventory/warehouse-transfers/${id}/post`, { method: "POST" });
  },
  async listStockAdjustments(params?: { status_filter?: string }): Promise<StockAdjustmentResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockAdjustmentResponse[]>(`/api/v1/inventory/stock-adjustments${suffix}`);
  },
  async createStockAdjustment(data: StockAdjustmentCreate): Promise<StockAdjustmentResponse> {
    return request<StockAdjustmentResponse>("/api/v1/inventory/stock-adjustments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postStockAdjustment(id: number): Promise<StockAdjustmentResponse> {
    return request<StockAdjustmentResponse>(`/api/v1/inventory/stock-adjustments/${id}/post`, { method: "POST" });
  },
  async traceLotNumber(lotNumber: string): Promise<LotTraceResponse> {
    const q = new URLSearchParams({ lot_number: lotNumber });
    return request<LotTraceResponse>(`/api/v1/inventory/lot-trace?${q.toString()}`);
  },
  async listDeliveryChallans(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    order_id?: number;
  }): Promise<DeliveryChallanResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.order_id) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DeliveryChallanResponse[]>(`/api/v1/inventory/delivery-challans${suffix}`);
  },
  async createDeliveryChallan(data: DeliveryChallanCreate): Promise<DeliveryChallanResponse> {
    return request<DeliveryChallanResponse>("/api/v1/inventory/delivery-challans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateDeliveryChallanStatus(id: number, status: string): Promise<DeliveryChallanResponse> {
    return request<DeliveryChallanResponse>(`/api/v1/inventory/delivery-challans/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },
  async getDeliveryChallan(id: number): Promise<DeliveryChallanResponse> {
    return request<DeliveryChallanResponse>(`/api/v1/inventory/delivery-challans/${id}`);
  },
  async getDeliveryChallanPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/delivery-challans/${id}/print-data`);
  },
  async getDeliveryChallanGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/delivery-challans/${id}/gl-postings`);
  },
  async getEnhancedGatePass(id: number): Promise<EnhancedGatePassResponse> {
    return request<EnhancedGatePassResponse>(`/api/v1/inventory/enhanced-gate-passes/${id}`);
  },
  async getGatePassPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/enhanced-gate-passes/${id}/print-data`);
  },
  async getGatePassGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/enhanced-gate-passes/${id}/gl-postings`);
  },
  async getGoodsReceivingGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/goods-receiving/${id}/gl-postings`);
  },
  async verifyInventoryDocument(verificationId: string): Promise<InventoryDocumentVerifyResponse> {
    return request<InventoryDocumentVerifyResponse>(
      `/api/v1/inventory/documents/verify/${encodeURIComponent(verificationId)}`,
    );
  },
  async backfillInventoryDocumentSignatures(): Promise<{ ok: boolean; signed: Record<string, number> }> {
    return request(`/api/v1/inventory/documents/backfill-signatures`, { method: "POST" });
  },
  async getProductionMaterialIssueDetail(id: number): Promise<ProductionMaterialIssueDetailResponse> {
    return request<ProductionMaterialIssueDetailResponse>(`/api/v1/inventory/production-material-issues/${id}`);
  },
  async getProductionMaterialIssuePrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/production-material-issues/${id}/print-data`);
  },
  async getProductionMaterialIssueGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/production-material-issues/${id}/gl-postings`);
  },
  async getProcessOrderPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/process-orders/${id}/print-data`);
  },
  async getProcessOrderGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/process-orders/${id}/gl-postings`);
  },
  async getWarehouseTransferPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/warehouse-transfers/${id}/print-data`);
  },
  async getWarehouseTransferGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/warehouse-transfers/${id}/gl-postings`);
  },
  async listEnhancedGatePasses(params?: { status_filter?: string; date_from?: string; date_to?: string }): Promise<EnhancedGatePassResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<EnhancedGatePassResponse[]>(`/api/v1/inventory/enhanced-gate-passes${suffix}`);
  },
  async createEnhancedGatePass(data: EnhancedGatePassCreate): Promise<EnhancedGatePassResponse> {
    return request<EnhancedGatePassResponse>("/api/v1/inventory/enhanced-gate-passes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateEnhancedGatePassStatus(
    id: number,
    data: { status?: string; guard_acknowledged?: boolean },
  ): Promise<EnhancedGatePassResponse> {
    return request<EnhancedGatePassResponse>(`/api/v1/inventory/enhanced-gate-passes/${id}/status`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listProcessOrders(): Promise<ProcessOrderResponse[]> {
    return request<ProcessOrderResponse[]>("/api/v1/inventory/process-orders");
  },
  async getProcessOrder(id: number): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}`);
  },
  async createProcessOrder(data: ProcessOrderCreate): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>("/api/v1/inventory/process-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateProcessOrder(id: number, data: ProcessOrderCreate): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async issueProcessOrder(id: number): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}/issue`, { method: "POST" });
  },
  async receiveProcessOrder(id: number, data: ProcessOrderReceive): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveProcessOrder(id: number): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}/approve`, { method: "POST" });
  },
  async addProcessOrderCostLine(
    processOrderId: number,
    data: { cost_type?: string; description?: string | null; amount: string; vendor_id?: number | null; currency?: string | null; remarks?: string | null },
  ): Promise<{ id: number; process_order_id: number; amount: string; cost_type: string }> {
    return request(`/api/v1/inventory/process-orders/${processOrderId}/cost-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // --- Sprint I1 MRP / IDT / process loss ---
  async runMrp(data: {
    order_ids?: number[] | null;
    item_ids?: number[] | null;
    horizon_days?: number;
    as_of_date?: string | null;
  }): Promise<MrpRunResult> {
    return request<MrpRunResult>("/api/v1/inventory/mrp/run", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listPlannedOrders(params?: {
    status?: string;
    item_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<PlannedOrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PlannedOrderResponse[]>(`/api/v1/inventory/mrp/planned-orders${suffix}`);
  },
  async firmPlannedOrder(id: number): Promise<PlannedOrderResponse> {
    return request<PlannedOrderResponse>(`/api/v1/inventory/mrp/planned-orders/${id}/firm`, {
      method: "POST",
    });
  },
  async releasePlannedOrder(id: number): Promise<PlannedOrderReleaseResult> {
    return request<PlannedOrderReleaseResult>(`/api/v1/inventory/mrp/planned-orders/${id}/release`, {
      method: "POST",
    });
  },
  async listReorderSuggestions(params?: {
    status?: string;
    item_id?: number;
    warehouse_id?: number;
  }): Promise<ReorderSuggestionResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReorderSuggestionResponse[]>(`/api/v1/inventory/reorder-suggestions${suffix}`);
  },
  async checkReorderAll(warehouseId?: number): Promise<ReorderCheckResult> {
    const q = warehouseId != null ? `?warehouse_id=${warehouseId}` : "";
    return request<ReorderCheckResult>(`/api/v1/inventory/reorder/check-all${q}`, { method: "POST" });
  },
  async approveReorderSuggestion(id: number): Promise<ReorderSuggestionResponse> {
    return request<ReorderSuggestionResponse>(`/api/v1/inventory/reorder-suggestions/${id}/approve`, {
      method: "POST",
    });
  },
  async rejectReorderSuggestion(id: number): Promise<ReorderSuggestionResponse> {
    return request<ReorderSuggestionResponse>(`/api/v1/inventory/reorder-suggestions/${id}/reject`, {
      method: "POST",
    });
  },
  async convertReorderSuggestion(id: number): Promise<ReorderConvertResult> {
    return request<ReorderConvertResult>(`/api/v1/inventory/reorder-suggestions/${id}/convert`, {
      method: "POST",
    });
  },
  async bulkConvertReorderSuggestions(suggestionIds: number[]): Promise<ReorderConvertResult[]> {
    return request<ReorderConvertResult[]>("/api/v1/inventory/reorder-suggestions/bulk-convert", {
      method: "POST",
      body: JSON.stringify({ suggestion_ids: suggestionIds }),
    });
  },
  async listInterDepartmentTransfers(params?: {
    status?: string;
    process_name?: string;
    from_warehouse?: number;
    to_warehouse?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<InterDepartmentTransferResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.process_name) q.set("process_name", params.process_name);
    if (params?.from_warehouse != null) q.set("from_warehouse", String(params.from_warehouse));
    if (params?.to_warehouse != null) q.set("to_warehouse", String(params.to_warehouse));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InterDepartmentTransferResponse[]>(
      `/api/v1/inventory/inter-department-transfers${suffix}`,
    );
  },
  async getInterDepartmentTransfer(id: number): Promise<InterDepartmentTransferResponse> {
    return request<InterDepartmentTransferResponse>(`/api/v1/inventory/inter-department-transfers/${id}`);
  },
  async createInterDepartmentTransfer(
    data: InterDepartmentTransferCreate,
  ): Promise<InterDepartmentTransferResponse> {
    return request<InterDepartmentTransferResponse>("/api/v1/inventory/inter-department-transfers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async receiveInterDepartmentTransfer(
    id: number,
    data: { target_qty_received: string; target_batch_number?: string; notes?: string },
  ): Promise<InterDepartmentTransferResponse> {
    return request<InterDepartmentTransferResponse>(
      `/api/v1/inventory/inter-department-transfers/${id}/receive`,
      { method: "POST", body: JSON.stringify(data) },
    );
  },
  async listProcessLossStandards(): Promise<ProcessLossStandardResponse[]> {
    return request<ProcessLossStandardResponse[]>("/api/v1/inventory/process-loss-standards");
  },
  async createProcessLossStandard(data: {
    process_name: string;
    standard_loss_percent: string;
    warning_threshold_percent?: string;
    item_category_id?: number | null;
    is_active?: boolean;
  }): Promise<ProcessLossStandardResponse> {
    return request<ProcessLossStandardResponse>("/api/v1/inventory/process-loss-standards", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getProcessLossReport(params: {
    from_date: string;
    to_date: string;
    process_name?: string;
  }): Promise<ProcessLossReportResponse> {
    const q = new URLSearchParams({ from_date: params.from_date, to_date: params.to_date });
    if (params.process_name) q.set("process_name", params.process_name);
    return request<ProcessLossReportResponse>(`/api/v1/inventory/reports/process-loss?${q}`);
  },
  async getPostCostingReport(orderId: number): Promise<PostCostingReportResponse> {
    return request<PostCostingReportResponse>(
      `/api/v1/inventory/reports/post-costing?order_id=${orderId}`,
    );
  },

  async listGrnQcPending(grnId: number): Promise<GrnQualityInspection[]> {
    return request<GrnQualityInspection[]>(`/api/v1/inventory/grn/${grnId}/qc-pending`);
  },
  async submitGrnInspection(
    grnId: number,
    data: {
      lines: Array<{
        grn_item_id: number;
        accepted_qty: string;
        rejected_qty: string;
        hold_qty: string;
        parameters?: Record<string, unknown> | null;
        notes?: string | null;
        photos?: string[] | null;
        inspection_date?: string | null;
      }>;
    },
  ): Promise<GrnQualityInspection[]> {
    return request<GrnQualityInspection[]>(`/api/v1/inventory/grn/${grnId}/inspect`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listQualityInspections(params?: {
    status?: string;
    result?: string;
    vendor_id?: number;
    limit?: number;
  }): Promise<GrnQualityInspection[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.result) q.set("result", params.result);
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q}` : "";
    return request<GrnQualityInspection[]>(`/api/v1/inventory/quality/inspections${suffix}`);
  },
  async getInventoryQualityDashboard(): Promise<InventoryQualityDashboardResponse> {
    return request<InventoryQualityDashboardResponse>("/api/v1/inventory/quality/dashboard");
  },
  async getVendorQualityScorecard(days = 90): Promise<VendorScorecardRow[]> {
    return request<VendorScorecardRow[]>(`/api/v1/inventory/quality/vendor-scorecard?days=${days}`);
  },
  async getVendorQcRejectionRate(
    vendorId: number,
    days = 90,
  ): Promise<{ vendor_id: number; rejection_rate_pct: number | null; days: number }> {
    return request(`/api/v1/inventory/quality/vendors/${vendorId}/rejection-rate?days=${days}`);
  },

  async runAbcAnalysis(periodMonths = 12): Promise<AbcAnalysisReport> {
    return request<AbcAnalysisReport>("/api/v1/inventory/abc-analysis/run", {
      method: "POST",
      body: JSON.stringify({ period_months: periodMonths }),
    });
  },
  async getAbcAnalysisReport(params?: {
    abc_class?: string;
    category_id?: number;
  }): Promise<AbcAnalysisReport> {
    const q = new URLSearchParams();
    if (params?.abc_class) q.set("abc_class", params.abc_class);
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    const suffix = q.toString() ? `?${q}` : "";
    return request<AbcAnalysisReport>(`/api/v1/inventory/abc-analysis/report${suffix}`);
  },
  /** @deprecated Opening this URL directly sends no auth headers; use `exportAbcAnalysisCsv`. */
  abcAnalysisExportUrl(params?: { abc_class?: string; category_id?: number }): string {
    const q = new URLSearchParams({ export: "csv" });
    if (params?.abc_class) q.set("abc_class", params.abc_class);
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    return `${API_BASE}/api/v1/inventory/abc-analysis/report?${q}`;
  },
  async exportAbcAnalysisCsv(params?: { abc_class?: string; category_id?: number }): Promise<Blob> {
    const q = new URLSearchParams({ export: "csv" });
    if (params?.abc_class) q.set("abc_class", params.abc_class);
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    return requestBlob(`/api/v1/inventory/abc-analysis/report?${q}`, { method: "GET" });
  },
  async getItemEoq(itemId: number): Promise<EoqResult> {
    return request<EoqResult>(`/api/v1/inventory/items/${itemId}/eoq`);
  },
  async getEoqReport(limit = 200): Promise<EoqResult[]> {
    return request<EoqResult[]>(`/api/v1/inventory/eoq/report?limit=${limit}`);
  },
  async getStockAgingReport(params?: {
    item_id?: number;
    warehouse_id?: number;
    bucket?: string;
  }): Promise<StockAgingReport> {
    const q = new URLSearchParams();
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    if (params?.bucket) q.set("bucket", params.bucket);
    const suffix = q.toString() ? `?${q}` : "";
    return request<StockAgingReport>(`/api/v1/inventory/reports/stock-aging${suffix}`);
  },
  async listCycleCountSchedule(params?: {
    for_date?: string;
    status?: string;
    history_days?: number;
    generate?: boolean;
  }): Promise<CycleCountTask[]> {
    const q = new URLSearchParams();
    if (params?.for_date) q.set("for_date", params.for_date);
    if (params?.status) q.set("status", params.status);
    if (params?.history_days != null) q.set("history_days", String(params.history_days));
    if (params?.generate) q.set("generate", "true");
    const suffix = q.toString() ? `?${q}` : "";
    return request<CycleCountTask[]>(`/api/v1/inventory/cycle-count/schedule${suffix}`);
  },
  async generateCycleCountSchedule(data?: {
    frequency?: string;
    for_date?: string;
    force_all_due?: boolean;
  }): Promise<{ created: number; tasks: CycleCountTask[] }> {
    return request("/api/v1/inventory/cycle-count/generate", {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  async submitCycleCount(
    taskId: number,
    data: { counted_qty: string; notes?: string; create_adjustment?: boolean },
  ): Promise<CycleCountTask> {
    return request<CycleCountTask>(`/api/v1/inventory/cycle-count/${taskId}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async listStockSerials(params?: {
    item_id?: number;
    status?: string;
    q?: string;
    limit?: number;
  }): Promise<StockSerialRow[]> {
    const q = new URLSearchParams();
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.status) q.set("status", params.status);
    if (params?.q) q.set("q", params.q);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q}` : "";
    return request<StockSerialRow[]>(`/api/v1/inventory/serials${suffix}`);
  },
  async traceStockSerial(serialNumber: string): Promise<SerialTrace> {
    return request<SerialTrace>(
      `/api/v1/inventory/serials/trace?serial_number=${encodeURIComponent(serialNumber)}`,
    );
  },
  async issueStockSerials(data: {
    serial_ids: number[];
    status?: string;
    dc_item_id?: number;
  }): Promise<StockSerialRow[]> {
    return request<StockSerialRow[]>("/api/v1/inventory/serials/issue", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async importStockSerials(
    rows: Array<{ item_id: number; serial_number: string; warehouse_id?: number }>,
  ): Promise<{ created: number; errors: string[] }> {
    return request("/api/v1/inventory/serials/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
  },
  async listItemKits(): Promise<ItemKitResponse[]> {
    return request<ItemKitResponse[]>("/api/v1/inventory/kits");
  },
  async createItemKit(data: {
    kit_code?: string;
    name: string;
    kit_price: string;
    notes?: string;
    components: Array<{ item_id: number; quantity: string }>;
  }): Promise<ItemKitResponse> {
    return request<ItemKitResponse>("/api/v1/inventory/kits", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateItemKit(
    kitId: number,
    data: {
      name?: string;
      kit_price?: string;
      is_active?: boolean;
      notes?: string;
      components?: Array<{ item_id: number; quantity: string }>;
    },
  ): Promise<ItemKitResponse> {
    return request<ItemKitResponse>(`/api/v1/inventory/kits/${kitId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async explodeItemKit(data: {
    kit_id: number;
    qty: string;
    warehouse_id: number;
  }): Promise<Record<string, unknown>> {
    return request("/api/v1/inventory/kits/explode", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listConsignmentStock(vendorId?: number): Promise<ConsignmentStockRow[]> {
    const suffix = vendorId != null ? `?vendor_id=${vendorId}` : "";
    return request<ConsignmentStockRow[]>(`/api/v1/inventory/consignment${suffix}`);
  },
  async receiveConsignment(data: {
    vendor_id: number;
    item_id: number;
    warehouse_id: number;
    qty: string;
    unit_cost?: string;
    notes?: string;
  }): Promise<ConsignmentStockRow> {
    return request<ConsignmentStockRow>("/api/v1/inventory/consignment/receive", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async consumeConsignment(data: {
    consignment_id?: number;
    item_id?: number;
    warehouse_id?: number;
    qty: string;
  }): Promise<ConsignmentStockRow> {
    return request<ConsignmentStockRow>("/api/v1/inventory/consignment/consume", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settleConsignment(data: {
    vendor_id: number;
    consignment_id?: number;
  }): Promise<{ purchase_order_id: number; po_code: string; message?: string }> {
    return request("/api/v1/inventory/consignment/settle", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async listProductionMaterialIssues(params?: { limit?: number; offset?: number }): Promise<ProductionMaterialIssueResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ProductionMaterialIssueResponse[]>(`/api/v1/inventory/production-material-issues${suffix}`);
  },
  async createProductionMaterialIssue(data: ProductionMaterialIssueCreate): Promise<ProductionMaterialIssueResponse> {
    return request<ProductionMaterialIssueResponse>("/api/v1/inventory/production-material-issues", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listManufacturingOrders(params?: { limit?: number; offset?: number }): Promise<ManufacturingOrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ManufacturingOrderResponse[]>(`/api/v1/inventory/manufacturing-orders${suffix}`);
  },
  async listManufacturingOrdersWithTotal(params?: { limit?: number; offset?: number }): Promise<ListWithTotal<ManufacturingOrderResponse>> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders${suffix}`);
  },
  async getManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}`);
  },
  async createManufacturingOrder(data: ManufacturingOrderCreate): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>("/api/v1/inventory/manufacturing-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getManufacturingStages(id: number): Promise<ManufacturingStageResponse[]> {
    return request<ManufacturingStageResponse[]>(`/api/v1/inventory/manufacturing-orders/${id}/stages`);
  },
  async startManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/start`, { method: "POST" });
  },
  async holdManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/hold`, { method: "POST" });
  },
  async resumeManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/resume`, { method: "POST" });
  },
  async completeManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/complete`, { method: "POST" });
  },
  async startManufacturingStage(stageId: number): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}/start`, { method: "POST" });
  },
  async completeManufacturingStage(stageId: number): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}/complete`, { method: "POST" });
  },
  async skipManufacturingStage(stageId: number): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}/skip`, { method: "POST" });
  },
  async updateManufacturingStage(stageId: number, data: ManufacturingStageUpdate): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async finalizeConsumptionOrder(orderId: number): Promise<{ ok: boolean; already_finalized?: boolean }> {
    return request<{ ok: boolean; already_finalized?: boolean }>(
      `/api/v1/inventory/consumption-control/finalize-order/${orderId}`,
      { method: "POST" },
    );
  },
  async getConsumptionSnapshot(orderId: number): Promise<ConsumptionSnapshotResponse> {
    return request<ConsumptionSnapshotResponse>(`/api/v1/inventory/consumption-control/snapshot/${orderId}`);
  },
  async getConsumptionReservations(orderId: number): Promise<ConsumptionReservationRow[]> {
    return request<ConsumptionReservationRow[]>(`/api/v1/inventory/consumption-control/reservations/${orderId}`);
  },
  async issueConsumptionMaterial(data: ConsumptionIssueCreate): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/consumption-control/issue-material", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getInventoryReconciliationOverview(): Promise<InventoryReconciliationOverview> {
    return request<InventoryReconciliationOverview>("/api/v1/inventory/reconciliation/overview");
  },
  async getOrderMaterialVariance(orderId: number): Promise<Record<string, unknown>> {
    return request(`/api/v1/inventory/material-control/order/${orderId}/variance`);
  },
  async listMaterialControlStockMovements(params?: {
    order_id?: number;
    movement_kind?: string;
    limit?: number;
    offset?: number;
  }): Promise<MaterialControlStockMovementRow[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.movement_kind) q.set("movement_kind", params.movement_kind);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MaterialControlStockMovementRow[]>(`/api/v1/inventory/stock-movements${suffix}`);
  },
  async listConsumptionChangeRequests(params?: { status_filter?: string; order_id?: number }): Promise<ConsumptionChangeRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionChangeRequestResponse[]>(`/api/v1/inventory/consumption-control/change-requests${suffix}`);
  },
  async createConsumptionChangeRequest(data: ConsumptionChangeRequestCreate): Promise<ConsumptionChangeRequestResponse> {
    return request<ConsumptionChangeRequestResponse>("/api/v1/inventory/consumption-control/change-request", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveConsumptionChangeRequest(id: number, reason?: string): Promise<ConsumptionChangeRequestResponse> {
    return request<ConsumptionChangeRequestResponse>(`/api/v1/inventory/consumption-control/change-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    });
  },
  async rejectConsumptionChangeRequest(id: number, reason: string): Promise<ConsumptionChangeRequestResponse> {
    return request<ConsumptionChangeRequestResponse>(`/api/v1/inventory/consumption-control/change-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  /** Inventory alias for BOM → PO one-click (same backend as merch bulk generate). */
  async generatePurchaseOrdersFromBom(
    bomId: number,
  ): Promise<{ created: Array<{ id: number; po_code: string; line_count: number }> }> {
    return request(`/api/v1/inventory/purchase-orders/generate-from-bom/${bomId}`, {
      method: "POST",
    });
  },
  async getMaterialReadinessForOrder(order_id: number): Promise<unknown> {
    return request(`/api/v1/inventory/orders/${order_id}/material-readiness`);
  },
};
