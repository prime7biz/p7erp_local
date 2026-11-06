/**
 * Commercial, trade, logistics, compliance, currency, procurement API calls.
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types live in `api/models.ts` (re-exported by `api/client.ts`).
 */
import { request, requestBlob, requestPublic } from "@/api/core";
import type {
  BondRegister,
  BondedWarehouseEntryBody,
  BondedWarehouseEntryRow,
  BondedWarehouseListResponse,
  BtbLcAccountingRow,
  BtbLcCreate,
  BtbLcRecordDocumentsAcceptanceBody,
  BtbLcRecordOpeningBody,
  BtbLcRecordRealizationBody,
  BtbLcRow,
  BtbLcUpdate,
  CertificateType,
  CommercialInvoiceCreateReceiptResponse,
  CommercialInvoiceFromChallanBody,
  CommercialInvoiceFromChallanResponse,
  CommercialInvoiceListResponse,
  CommercialInvoicePaymentSummary,
  CommercialInvoiceRow,
  CommissionDirection,
  CommissionEntry,
  CommissionRule,
  CommissionSettings,
  CommissionShipment,
  CommissionStatement,
  ComparativeStatement,
  CurrencyExchangeRateCreate,
  CurrencyExchangeRateResponse,
  CurrencyExchangeRateUpdate,
  CutTicketFabricLot,
  ExportCaseCreate,
  ExportCaseRow,
  ExportCaseUpdate,
  LcPerformanceResponse,
  LiveRatesResponse,
  MasterContractCreate,
  MasterContractRow,
  MasterContractUpdate,
  MaterialCertificate,
  Mushak610,
  Mushak63,
  Mushak91Summary,
  MushakRegister,
  OrderTraceabilityReport,
  PackingCartonLine,
  PackingCartons,
  PackingListContainerCreate,
  PackingListCreate,
  PackingListRow,
  PackingListUpdate,
  PayrollStatutoryCalcBody,
  PayrollStatutoryCalcResponse,
  ProformaCreateReceiptBody,
  ProformaCreateReceiptResponse,
  ProformaInvoiceCreate,
  ProformaInvoiceForPrint,
  ProformaInvoiceRow,
  ProformaInvoiceUpdate,
  ProformaPaymentSummary,
  ProformaVerifyResponse,
  PublicDocumentVerification,
  RequisitionDetail,
  RequisitionInput,
  RequisitionSummary,
  ShipmentContainerCreate,
  ShipmentContainerRow,
  ShipmentContainerUpdate,
  ShipmentCreate,
  ShipmentRow,
  ShipmentUpdate,
  StatutoryTaxConfigBody,
  StatutoryTaxConfigListResponse,
  StatutoryTaxConfigRow,
  StatutoryTaxLineCalcBody,
  StatutoryTaxLineCalcResponse,
  SupplierQuotationInput,
  TradeCaseCreate,
  TradeCaseDashboardResponse,
  TradeCaseMarginResponse,
  TradeCaseRow,
  TradeCaseStageLogRow,
  TradeCaseStageRow,
  TradeCaseTransitionBody,
  TradeCaseUpdate,
  TradeDocumentRow,
  UdBodyInput,
  UdDetail,
  UdListItem,
  UdStatus,
} from "@/api/models";

export const commercialApi = {
  async listStatutoryTaxConfig(): Promise<StatutoryTaxConfigListResponse> {
    return request<StatutoryTaxConfigListResponse>("/api/v1/compliance/tax-config");
  },
  async upsertStatutoryTaxConfig(body: StatutoryTaxConfigBody): Promise<StatutoryTaxConfigRow> {
    return request<StatutoryTaxConfigRow>("/api/v1/compliance/tax-config", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async calculateStatutoryTaxLine(body: StatutoryTaxLineCalcBody): Promise<StatutoryTaxLineCalcResponse> {
    return request<StatutoryTaxLineCalcResponse>("/api/v1/compliance/tax/calculate-line", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listBondedWarehouseEntries(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<BondedWarehouseListResponse> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BondedWarehouseListResponse>(`/api/v1/compliance/bonded-warehouse${suffix}`);
  },
  async createBondedWarehouseEntry(body: BondedWarehouseEntryBody): Promise<BondedWarehouseEntryRow> {
    return request<BondedWarehouseEntryRow>("/api/v1/compliance/bonded-warehouse", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async calculatePayrollStatutory(body: PayrollStatutoryCalcBody): Promise<PayrollStatutoryCalcResponse> {
    return request<PayrollStatutoryCalcResponse>("/api/v1/compliance/payroll/statutory-calculate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listRequisitions(params?: { status?: string; limit?: number; offset?: number }): Promise<{ rows: RequisitionSummary[]; total: number }> {
    const q = new URLSearchParams({ limit: String(params?.limit ?? 50), offset: String(params?.offset ?? 0) });
    if (params?.status) q.set("status", params.status);
    return request(`/api/v1/procurement/requisitions?${q.toString()}`);
  },
  async createRequisition(data: RequisitionInput): Promise<RequisitionDetail> {
    return request("/api/v1/procurement/requisitions", { method: "POST", body: JSON.stringify(data) });
  },
  async getRequisition(id: number): Promise<RequisitionDetail> {
    return request(`/api/v1/procurement/requisitions/${id}`);
  },
  async updateRequisition(id: number, data: RequisitionInput): Promise<RequisitionDetail> {
    return request(`/api/v1/procurement/requisitions/${id}`, { method: "PUT", body: JSON.stringify(data) });
  },
  async setRequisitionStatus(id: number, status: string, reason?: string): Promise<RequisitionDetail> {
    return request(`/api/v1/procurement/requisitions/${id}/status`, {
      method: "POST",
      body: JSON.stringify(reason?.trim() ? { status, reason: reason.trim() } : { status }),
    });
  },
  async addSupplierQuotation(requisitionId: number, data: SupplierQuotationInput): Promise<RequisitionDetail> {
    return request(`/api/v1/procurement/requisitions/${requisitionId}/quotations`, { method: "POST", body: JSON.stringify(data) });
  },
  async deleteSupplierQuotation(quotationId: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/procurement/quotations/${quotationId}`, { method: "DELETE" });
  },
  async getComparativeStatement(requisitionId: number): Promise<ComparativeStatement> {
    return request(`/api/v1/procurement/requisitions/${requisitionId}/comparative-statement`);
  },
  async selectQuotation(requisitionId: number, quotationId: number, reason: string): Promise<ComparativeStatement> {
    return request(`/api/v1/procurement/requisitions/${requisitionId}/select`, {
      method: "POST",
      body: JSON.stringify({ quotation_id: quotationId, reason }),
    });
  },
  async createPoFromRequisition(
    requisitionId: number,
    data?: { expected_date?: string | null },
  ): Promise<{ requisition_id: number; purchase_order_id: number; po_code: string }> {
    return request(`/api/v1/procurement/requisitions/${requisitionId}/create-po`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  async getPackingCartons(packingListId: number): Promise<PackingCartons> {
    return request<PackingCartons>(`/api/v1/logistics/packing-lists/${packingListId}/cartons`);
  },
  async savePackingCartons(packingListId: number, body: { lines: PackingCartonLine[]; sync_header?: boolean }): Promise<PackingCartons> {
    return request<PackingCartons>(`/api/v1/logistics/packing-lists/${packingListId}/cartons`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async listMaterialCertificates(params?: { status?: "valid" | "expiring" | "expired" }): Promise<MaterialCertificate[]> {
    const q = params?.status ? `?status=${params.status}` : "";
    return request<MaterialCertificate[]>(`/api/v1/traceability/certificates${q}`);
  },
  async saveMaterialCertificate(
    body: {
      cert_type: CertificateType;
      certificate_number: string;
      issuer?: string | null;
      vendor_id?: number | null;
      item_id?: number | null;
      valid_from?: string | null;
      valid_until?: string | null;
      notes?: string | null;
    },
    id?: number,
  ): Promise<MaterialCertificate> {
    return request<MaterialCertificate>(`/api/v1/traceability/certificates${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteMaterialCertificate(id: number): Promise<void> {
    return request<void>(`/api/v1/traceability/certificates/${id}`, { method: "DELETE" });
  },
  async listFabricLotOptions(q?: string): Promise<{ id: number; batch_number: string; item_name: string | null; current_qty: string; grn_code: string | null }[]> {
    return request(`/api/v1/traceability/fabric-lots${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  },
  async listCutTicketFabricLots(cutTicketId: number): Promise<CutTicketFabricLot[]> {
    return request<CutTicketFabricLot[]>(`/api/v1/traceability/cut-tickets/${cutTicketId}/fabric-lots`);
  },
  async addCutTicketFabricLot(
    cutTicketId: number,
    body: { stock_batch_id: number; qty_used?: string | null; roll_numbers?: string | null },
  ): Promise<CutTicketFabricLot> {
    return request<CutTicketFabricLot>(`/api/v1/traceability/cut-tickets/${cutTicketId}/fabric-lots`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async removeCutTicketFabricLot(cutTicketId: number, linkId: number): Promise<void> {
    return request<void>(`/api/v1/traceability/cut-tickets/${cutTicketId}/fabric-lots/${linkId}`, { method: "DELETE" });
  },
  async getOrderTraceability(orderId: number): Promise<OrderTraceabilityReport> {
    return request<OrderTraceabilityReport>(`/api/v1/traceability/orders/${orderId}`);
  },
  async getCommissionSettings(): Promise<CommissionSettings> {
    return request<CommissionSettings>("/api/v1/commission/settings");
  },
  async saveCommissionSettings(body: Omit<CommissionSettings, "enabled">): Promise<CommissionSettings> {
    return request<CommissionSettings>("/api/v1/commission/settings", { method: "PUT", body: JSON.stringify(body) });
  },
  async listCommissionRules(): Promise<CommissionRule[]> {
    return request<CommissionRule[]>("/api/v1/commission/rules");
  },
  async createCommissionRule(body: {
    direction: CommissionDirection;
    scope: CommissionRule["scope"];
    customer_id?: number | null;
    vendor_id?: number | null;
    intermediary_id?: number | null;
    rate_type: "PERCENTAGE" | "FIXED";
    rate: string;
    notes?: string | null;
  }): Promise<CommissionRule> {
    return request<CommissionRule>("/api/v1/commission/rules", { method: "POST", body: JSON.stringify(body) });
  },
  async updateCommissionRule(id: number, body: { rate?: string; rate_type?: string; is_active?: boolean }): Promise<CommissionRule> {
    return request<CommissionRule>(`/api/v1/commission/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async deleteCommissionRule(id: number): Promise<void> {
    return request<void>(`/api/v1/commission/rules/${id}`, { method: "DELETE" });
  },
  async listCommissionShipments(params?: { order_id?: number }): Promise<CommissionShipment[]> {
    const q = params?.order_id ? `?order_id=${params.order_id}` : "";
    return request<CommissionShipment[]>(`/api/v1/commission/shipments${q}`);
  },
  async createCommissionShipment(body: {
    order_id: number;
    vendor_id?: number | null;
    shipment_ref: string;
    shipment_date: string;
    shipped_qty?: number | null;
    shipped_value: string;
    currency: string;
    exchange_rate_to_base: string;
    notes?: string | null;
  }): Promise<CommissionShipment> {
    return request<CommissionShipment>("/api/v1/commission/shipments", { method: "POST", body: JSON.stringify(body) });
  },
  async recalculateCommissionShipment(id: number): Promise<CommissionShipment> {
    return request<CommissionShipment>(`/api/v1/commission/shipments/${id}/recalculate`, { method: "POST" });
  },
  async deleteCommissionShipment(id: number): Promise<void> {
    return request<void>(`/api/v1/commission/shipments/${id}`, { method: "DELETE" });
  },
  async listCommissionEntries(params?: { status?: "PENDING" | "STATEMENTED"; direction?: CommissionDirection }): Promise<CommissionEntry[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.direction) q.set("direction", params.direction);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommissionEntry[]>(`/api/v1/commission/entries${suffix}`);
  },
  async listCommissionStatements(): Promise<CommissionStatement[]> {
    return request<CommissionStatement[]>("/api/v1/commission/statements");
  },
  async getCommissionStatement(id: number): Promise<CommissionStatement> {
    return request<CommissionStatement>(`/api/v1/commission/statements/${id}`);
  },
  async createCommissionStatement(body: {
    direction: CommissionDirection;
    counterparty_type: CommissionEntry["counterparty_type"];
    counterparty_id: number;
    currency: string;
  }): Promise<CommissionStatement> {
    return request<CommissionStatement>("/api/v1/commission/statements", { method: "POST", body: JSON.stringify(body) });
  },
  async issueCommissionStatement(id: number): Promise<CommissionStatement> {
    return request<CommissionStatement>(`/api/v1/commission/statements/${id}/issue`, { method: "POST" });
  },
  async cancelCommissionStatement(id: number): Promise<CommissionStatement> {
    return request<CommissionStatement>(`/api/v1/commission/statements/${id}/cancel`, { method: "POST" });
  },
  async listUds(params: { status?: string; q?: string } = {}): Promise<{ items: UdListItem[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    return request(`/api/v1/compliance/bd/ud${qs.toString() ? `?${qs}` : ""}`);
  },
  async getUd(id: number): Promise<UdDetail> {
    return request<UdDetail>(`/api/v1/compliance/bd/ud/${id}`);
  },
  async createUd(body: UdBodyInput): Promise<UdDetail> {
    return request<UdDetail>("/api/v1/compliance/bd/ud", { method: "POST", body: JSON.stringify(body) });
  },
  async updateUd(id: number, body: UdBodyInput): Promise<UdDetail> {
    return request<UdDetail>(`/api/v1/compliance/bd/ud/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  async setUdStatus(id: number, status: UdStatus): Promise<UdDetail> {
    return request<UdDetail>(`/api/v1/compliance/bd/ud/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },
  async deleteUd(id: number): Promise<void> {
    return request<void>(`/api/v1/compliance/bd/ud/${id}`, { method: "DELETE" });
  },
  async getBondRegister(params: { from_date?: string; to_date?: string; ud_no?: string } = {}): Promise<BondRegister> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return request<BondRegister>(`/api/v1/compliance/bd/bond-register${qs.toString() ? `?${qs}` : ""}`);
  },
  async createBondEntry(body: {
    reference_no: string;
    entry_type: "IMPORT" | "EXPORT";
    ud_entitlement_id?: number | null;
    ud_no?: string | null;
    up_no?: string | null;
    item_description?: string | null;
    quantity: string;
    value_bdt?: string | null;
    entry_date?: string | null;
    notes?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/compliance/bd/bond-entries", { method: "POST", body: JSON.stringify(body) });
  },
  async getMushakRegister(register: "6-1" | "6-2", year: number, month: number): Promise<MushakRegister> {
    return request<MushakRegister>(`/api/v1/compliance/bd/mushak/${register}?year=${year}&month=${month}`);
  },
  async getLcPerformance(): Promise<LcPerformanceResponse> {
    return request<LcPerformanceResponse>("/api/v1/commercial/lc-performance");
  },
  async getMushak610(year: number, month: number): Promise<Mushak610> {
    return request<Mushak610>(`/api/v1/compliance/bd/mushak/6-10?year=${year}&month=${month}`);
  },
  async getMushak91(year: number, month: number): Promise<Mushak91Summary> {
    return request<Mushak91Summary>(`/api/v1/compliance/bd/mushak/9-1?year=${year}&month=${month}`);
  },
  async getMushak63(invoiceId: number): Promise<Mushak63> {
    return request<Mushak63>(`/api/v1/compliance/bd/mushak/6-3/${invoiceId}`);
  },
  // Currency module (exchange rates – PrimeX parity)
  async listCurrencyExchangeRates(params?: { active_only?: boolean }): Promise<CurrencyExchangeRateResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only !== false) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CurrencyExchangeRateResponse[]>(`/api/v1/currency/exchange-rates${suffix}`);
  },
  async getCurrencyExchangeRatePair(fromCode: string, toCode: string): Promise<CurrencyExchangeRateResponse> {
    return request<CurrencyExchangeRateResponse>(
      `/api/v1/currency/exchange-rates/${encodeURIComponent(fromCode)}/${encodeURIComponent(toCode)}`
    );
  },
  async createCurrencyExchangeRate(data: CurrencyExchangeRateCreate): Promise<CurrencyExchangeRateResponse> {
    return request<CurrencyExchangeRateResponse>("/api/v1/currency/exchange-rates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCurrencyExchangeRate(
    rateId: number,
    data: CurrencyExchangeRateUpdate
  ): Promise<CurrencyExchangeRateResponse> {
    return request<CurrencyExchangeRateResponse>(`/api/v1/currency/exchange-rates/${rateId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteCurrencyExchangeRate(rateId: number): Promise<void> {
    return request<void>(`/api/v1/currency/exchange-rates/${rateId}`, { method: "DELETE" });
  },
  async getLiveRates(base?: string): Promise<LiveRatesResponse> {
    const q = base ? `?base=${encodeURIComponent(base)}` : "";
    return request<LiveRatesResponse>(`/api/v1/currency/live-rates${q}`);
  },
  async listExportCases(params?: { status?: string; order_id?: number }): Promise<ExportCaseRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ExportCaseRow[]>(`/api/v1/commercial/export-cases${suffix}`);
  },
  async getExportCase(id: number): Promise<ExportCaseRow> {
    return request<ExportCaseRow>(`/api/v1/commercial/export-cases/${id}`);
  },
  async createExportCase(body: ExportCaseCreate): Promise<ExportCaseRow> {
    return request<ExportCaseRow>("/api/v1/commercial/export-cases", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateExportCase(id: number, body: ExportCaseUpdate): Promise<ExportCaseRow> {
    return request<ExportCaseRow>(`/api/v1/commercial/export-cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listProformaInvoices(params?: {
    status?: string;
    direction?: string;
    vendor_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<ProformaInvoiceRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.direction) q.set("direction", params.direction);
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ProformaInvoiceRow[]>(`/api/v1/commercial/proforma-invoices${suffix}`);
  },
  async createProformaInvoice(body: ProformaInvoiceCreate): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>("/api/v1/commercial/proforma-invoices", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateProformaInvoice(id: number, body: ProformaInvoiceUpdate): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>(`/api/v1/commercial/proforma-invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getProformaInvoice(id: number): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>(`/api/v1/commercial/proforma-invoices/${id}`);
  },
  async getIssuedExportProformaOrderIds(): Promise<{ order_ids: number[] }> {
    return request<{ order_ids: number[] }>(
      "/api/v1/commercial/proforma-invoices/issued-export-order-ids"
    );
  },
  async getProformaInvoiceForPrint(id: number): Promise<ProformaInvoiceForPrint> {
    return request<ProformaInvoiceForPrint>(`/api/v1/commercial/proforma-invoices/${id}/for-print`);
  },
  async finalizeProformaInvoice(id: number): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>(`/api/v1/commercial/proforma-invoices/${id}/finalize`, { method: "POST" });
  },
  async getProformaPaymentSummary(id: number): Promise<ProformaPaymentSummary> {
    return request<ProformaPaymentSummary>(`/api/v1/commercial/proforma-invoices/${id}/payment-summary`);
  },
  async createProformaReceipt(
    id: number,
    body: ProformaCreateReceiptBody,
  ): Promise<ProformaCreateReceiptResponse> {
    return request<ProformaCreateReceiptResponse>(`/api/v1/commercial/proforma-invoices/${id}/create-receipt`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listCommercialInvoices(params?: {
    status?: string;
    customer_id?: number;
    order_id?: number;
    challan_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    page_size?: number;
    limit?: number;
  }): Promise<CommercialInvoiceListResponse> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.challan_id != null) q.set("challan_id", String(params.challan_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.page != null) q.set("page", String(params.page));
    const pageSize = params?.page_size ?? params?.limit;
    if (pageSize != null) q.set("page_size", String(pageSize));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialInvoiceListResponse>(`/api/v1/commercial/invoices${suffix}`);
  },
  async getCommercialInvoice(id: number): Promise<CommercialInvoiceRow> {
    return request<CommercialInvoiceRow>(`/api/v1/commercial/invoices/${id}`);
  },
  async createCommercialInvoiceFromChallan(
    challanId: number,
    body: CommercialInvoiceFromChallanBody,
  ): Promise<CommercialInvoiceFromChallanResponse> {
    return request<CommercialInvoiceFromChallanResponse>(
      `/api/v1/commercial/invoices/from-delivery-challan/${challanId}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  async issueCommercialInvoice(id: number): Promise<CommercialInvoiceRow> {
    return request<CommercialInvoiceRow>(`/api/v1/commercial/invoices/${id}/issue`, { method: "POST" });
  },
  async cancelCommercialInvoice(id: number): Promise<CommercialInvoiceRow> {
    return request<CommercialInvoiceRow>(`/api/v1/commercial/invoices/${id}/cancel`, { method: "POST" });
  },
  async getCommercialInvoicePaymentSummary(id: number): Promise<CommercialInvoicePaymentSummary> {
    return request<CommercialInvoicePaymentSummary>(`/api/v1/commercial/invoices/${id}/payment-summary`);
  },
  async createCommercialInvoiceReceipt(
    id: number,
    body: ProformaCreateReceiptBody,
  ): Promise<CommercialInvoiceCreateReceiptResponse> {
    return request<CommercialInvoiceCreateReceiptResponse>(
      `/api/v1/commercial/invoices/${id}/create-receipt`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  async deleteProformaInvoice(id: number): Promise<void> {
    return request<void>(`/api/v1/commercial/proforma-invoices/${id}`, { method: "DELETE" });
  },
  async verifyProformaToken(token: string): Promise<ProformaVerifyResponse> {
    const q = new URLSearchParams({ token });
    return requestPublic<ProformaVerifyResponse>(`/api/v1/public/verify/proforma?${q.toString()}`);
  },
  /** Public (no login) check of a printed voucher / inventory document QR code. */
  async verifyDocumentPublic(verificationId: string): Promise<PublicDocumentVerification> {
    return requestPublic<PublicDocumentVerification>(
      `/api/v1/public/verify/document/${encodeURIComponent(verificationId)}`,
    );
  },
  async listBtbLcs(params?: {
    status?: string;
    master_contract_id?: number;
    vendor_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<BtbLcRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.master_contract_id != null) q.set("master_contract_id", String(params.master_contract_id));
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BtbLcRow[]>(`/api/v1/commercial/btb-lcs${suffix}`);
  },
  async createBtbLc(body: BtbLcCreate): Promise<BtbLcRow> {
    return request<BtbLcRow>("/api/v1/commercial/btb-lcs", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateBtbLc(id: number, body: BtbLcUpdate): Promise<BtbLcRow> {
    return request<BtbLcRow>(`/api/v1/commercial/btb-lcs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getBtbLc(id: number): Promise<BtbLcRow> {
    return request<BtbLcRow>(`/api/v1/commercial/btb-lcs/${id}`);
  },
  async getBtbLcAccounting(id: number): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/accounting`);
  },
  async recordBtbLcOpening(id: number, body: BtbLcRecordOpeningBody): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/record-opening`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async recordBtbLcDocumentsAcceptance(
    id: number,
    body: BtbLcRecordDocumentsAcceptanceBody
  ): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/record-documents-acceptance`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async recordBtbLcRealization(id: number, body: BtbLcRecordRealizationBody): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/record-realization`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listMasterContracts(params?: { status?: string }): Promise<MasterContractRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MasterContractRow[]>(`/api/v1/commercial/master-contracts${suffix}`);
  },
  async getMasterContract(id: number): Promise<MasterContractRow> {
    return request<MasterContractRow>(`/api/v1/commercial/master-contracts/${id}`);
  },
  async createMasterContract(body: MasterContractCreate): Promise<MasterContractRow> {
    return request<MasterContractRow>("/api/v1/commercial/master-contracts", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateMasterContract(id: number, body: MasterContractUpdate): Promise<MasterContractRow> {
    return request<MasterContractRow>(`/api/v1/commercial/master-contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listTradeCases(params?: {
    status?: string;
    current_stage?: string;
    direction?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    at_risk?: boolean;
    at_risk_days?: number;
    limit?: number;
    offset?: number;
  }): Promise<TradeCaseRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.current_stage) q.set("current_stage", params.current_stage);
    if (params?.direction) q.set("direction", params.direction);
    if (params?.search) q.set("search", params.search);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.at_risk === true) q.set("at_risk", "true");
    if (params?.at_risk_days != null) q.set("at_risk_days", String(params.at_risk_days));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<TradeCaseRow[]>(`/api/v1/trade-cases${suffix}`);
  },
  async getTradeCaseDocumentCounts(): Promise<{
    documents: Record<string, number>;
    shipments: Record<string, number>;
  }> {
    return request("/api/v1/trade-cases/document-counts");
  },
  async getTradeCase(id: number): Promise<TradeCaseRow> {
    return request<TradeCaseRow>(`/api/v1/trade-cases/${id}`);
  },
  async createTradeCase(body: TradeCaseCreate): Promise<TradeCaseRow> {
    return request<TradeCaseRow>("/api/v1/trade-cases", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateTradeCase(id: number, body: TradeCaseUpdate): Promise<TradeCaseRow> {
    return request<TradeCaseRow>(`/api/v1/trade-cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async transitionTradeCase(id: number, body: TradeCaseTransitionBody): Promise<TradeCaseRow> {
    return request<TradeCaseRow>(`/api/v1/trade-cases/${id}/transition`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getTradeCaseStages(id: number): Promise<TradeCaseStageRow[]> {
    return request<TradeCaseStageRow[]>(`/api/v1/trade-cases/${id}/stages`);
  },
  async getTradeCaseStageLog(id: number): Promise<TradeCaseStageLogRow[]> {
    return request<TradeCaseStageLogRow[]>(`/api/v1/trade-cases/${id}/stage-log`);
  },
  async uploadTradeDocument(
    tradeCaseId: number,
    payload: {
      file: File;
      document_type: string;
      shipment_id?: number | null;
      linked_entity_type?: string | null;
      linked_entity_id?: number | null;
    }
  ): Promise<{ id: number; trade_case_id: number; document_type: string; file_name: string; version: number; created_at: string }> {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("document_type", payload.document_type);
    if (payload.shipment_id != null) form.append("shipment_id", String(payload.shipment_id));
    if (payload.linked_entity_type) form.append("linked_entity_type", payload.linked_entity_type);
    if (payload.linked_entity_id != null) form.append("linked_entity_id", String(payload.linked_entity_id));
    return request(`/api/v1/trade-cases/${tradeCaseId}/documents`, {
      method: "POST",
      body: form,
    });
  },
  async listTradeDocuments(tradeCaseId: number): Promise<TradeDocumentRow[]> {
    return request<TradeDocumentRow[]>(`/api/v1/trade-cases/${tradeCaseId}/documents`);
  },
  async downloadTradeDocument(tradeCaseId: number, documentId: number): Promise<Blob> {
    return requestBlob(`/api/v1/trade-cases/${tradeCaseId}/documents/${documentId}/download`);
  },
  async getTradeCaseMargin(tradeCaseId: number): Promise<TradeCaseMarginResponse> {
    return request<TradeCaseMarginResponse>(`/api/v1/trade-cases/${tradeCaseId}/margin`);
  },
  async getTradeDashboardSummary(): Promise<TradeCaseDashboardResponse> {
    return request<TradeCaseDashboardResponse>("/api/v1/trade-cases/dashboard/summary");
  },
  async listShipments(params?: {
    trade_case_id?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ShipmentRow[]> {
    const q = new URLSearchParams();
    if (params?.trade_case_id != null) q.set("trade_case_id", String(params.trade_case_id));
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ShipmentRow[]>(`/api/v1/logistics/shipments${suffix}`);
  },
  async getShipment(id: number): Promise<ShipmentRow> {
    return request<ShipmentRow>(`/api/v1/logistics/shipments/${id}`);
  },
  async createShipment(body: ShipmentCreate): Promise<ShipmentRow> {
    return request<ShipmentRow>("/api/v1/logistics/shipments", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateShipment(id: number, body: ShipmentUpdate): Promise<ShipmentRow> {
    return request<ShipmentRow>(`/api/v1/logistics/shipments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listPackingLists(params?: {
    order_id?: number;
    shipment_id?: number;
    delivery_challan_id?: number;
    limit?: number;
  }): Promise<PackingListRow[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.shipment_id != null) q.set("shipment_id", String(params.shipment_id));
    if (params?.delivery_challan_id != null) q.set("delivery_challan_id", String(params.delivery_challan_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PackingListRow[]>(`/api/v1/logistics/packing-lists${suffix}`);
  },
  async getPackingList(id: number): Promise<PackingListRow> {
    return request<PackingListRow>(`/api/v1/logistics/packing-lists/${id}`);
  },
  async createPackingList(body: PackingListCreate): Promise<PackingListRow> {
    return request<PackingListRow>("/api/v1/logistics/packing-lists", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updatePackingList(id: number, body: PackingListUpdate): Promise<PackingListRow> {
    return request<PackingListRow>(`/api/v1/logistics/packing-lists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async finalizePackingList(id: number): Promise<PackingListRow> {
    return request<PackingListRow>(`/api/v1/logistics/packing-lists/${id}/finalize`, {
      method: "PUT",
    });
  },
  async addPackingListContainer(
    packingListId: number,
    body: PackingListContainerCreate,
  ): Promise<ShipmentContainerRow> {
    return request<ShipmentContainerRow>(`/api/v1/logistics/packing-lists/${packingListId}/containers`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listShipmentContainers(params?: {
    shipment_id?: number;
    packing_list_id?: number;
    limit?: number;
  }): Promise<ShipmentContainerRow[]> {
    const q = new URLSearchParams();
    if (params?.shipment_id != null) q.set("shipment_id", String(params.shipment_id));
    if (params?.packing_list_id != null) q.set("packing_list_id", String(params.packing_list_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ShipmentContainerRow[]>(`/api/v1/logistics/containers${suffix}`);
  },
  async createShipmentContainer(body: ShipmentContainerCreate): Promise<ShipmentContainerRow> {
    return request<ShipmentContainerRow>("/api/v1/logistics/containers", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateShipmentContainer(id: number, body: ShipmentContainerUpdate): Promise<ShipmentContainerRow> {
    return request<ShipmentContainerRow>(`/api/v1/logistics/containers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  // ── Bill-Wise Tracking ──
};
