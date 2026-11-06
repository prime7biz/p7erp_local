/**
 * Finance & accounting API calls (`/api/v1/finance/*`).
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types still live in `api/client.ts`.
 */
import { request, requestText, requestWithTotal } from "@/api/core";
import type { ListWithTotal } from "@/api/core";
import type {
  AccountGroupCreate,
  AccountGroupHierarchyNode,
  AccountGroupResponse,
  AccountingPeriodCreate,
  AccountingPeriodResponse,
  AdvancedVoucherTypeRow,
  AdvancedVoucherTypesResponse,
  BankAccountCreate,
  BankAccountResponse,
  BankReconciliationCreate,
  BankReconciliationResponse,
  BankReconciliationSummaryResponse,
  BankStatementLineCreate,
  BankStatementLineResponse,
  BankStatementMatchLogResponse,
  BillAllocationCreate,
  BillReferenceCreate,
  BillReferenceDetail,
  BillReferenceRow,
  BillWiseAgingReport,
  BillWiseOutstandingReport,
  BillsAgingResponse,
  BudgetCreate,
  BudgetResponse,
  BudgetVsActualResponse,
  BusinessHealthScoreResponse,
  BusinessOverviewResponse,
  CashBreakEvenResponse,
  CashFlowStatementResponse,
  CashForecastScenarioCreate,
  CashForecastScenarioResponse,
  CashForecastScenarioUpdate,
  CashForecastSummaryResponse,
  CashRunwayResponse,
  CashScenarioAnalysisResponse,
  CashSensitivityResponse,
  ChartOfAccountCreate,
  ChartOfAccountResponse,
  CoAConfigResponse,
  CoAConfigUpdate,
  CoAImportResult,
  ComparativeStatementResponse,
  CostCenterCreate,
  CostCenterDashboardRow,
  CostCenterResponse,
  CreditDebitNoteBody,
  CreditDebitNoteResult,
  DayBookResponse,
  ExceptionChallanRow,
  ExceptionGrnRow,
  ExceptionList,
  ExceptionNegativeLedgerRow,
  ExceptionNegativeStockRow,
  ExceptionOverdueBillRow,
  ExceptionSummaryResponse,
  FinanceMasterLcExposureResponse,
  FinanceMaturityTrancheRow,
  FinanceStockTransferVoucherBody,
  FinancialStatementsResponse,
  FundFlowResponse,
  FxReceiptCreate,
  FxReceiptResponse,
  FxUnsettledSummaryResponse,
  GstReturnPayload,
  GstSettings,
  LedgerActivityResponse,
  MemorandumRegisterRow,
  MisHealthResponse,
  MisRatioAnalysisResponse,
  MisRatioTrendResponse,
  MultiCurrencyRevaluationResponse,
  OutstandingBillCreate,
  OutstandingBillResponse,
  PartyLedgerAgingResponse,
  PartyLedgerAllocationResponse,
  PartyLedgerBillResponse,
  PartyLedgerCreate,
  PartyLedgerListResponse,
  PartyLedgerResponse,
  PartyLedgerStatementResponse,
  PaymentRunAdviceResponse,
  PaymentRunCreate,
  PaymentRunResponse,
  PostDatedRegisterRow,
  ProfitabilityResponse,
  PurchaseApOverviewResponse,
  RecurringVoucherBody,
  RecurringVoucherHistoryRow,
  RecurringVoucherResponse,
  ReportBasis,
  ReportingImpactResponse,
  SettlementAuditPresetCreate,
  SettlementAuditPresetResponse,
  SettlementAuditResponse,
  TaxLedgerCreate,
  TaxLedgerResponse,
  TaxLedgerUpdate,
  TaxPreviewRequest,
  TaxPreviewResponse,
  TdsCalcBody,
  TdsCalcResponse,
  TdsDeductionsListResponse,
  TdsReturnExportResponse,
  TdsReturnResponse,
  TdsSectionBody,
  TdsSectionResponse,
  TdsSectionsListResponse,
  TdsSettingsBody,
  TdsSettingsResponse,
  TrialBalanceResponse,
  VendorBillDetailResponse,
  VendorBillSummary,
  VoucherClassBody,
  VoucherClassResponse,
  VoucherCreate,
  VoucherEntryAssistRequest,
  VoucherEntryAssistResponse,
  VoucherHistoryResponse,
  VoucherLineCreate,
  VoucherNarrationSuggestion,
  VoucherPostPreflightResponse,
  VoucherPrintResponse,
  VoucherReportMonthlyResponse,
  VoucherReportSummaryResponse,
  VoucherReportTopPreparersResponse,
  VoucherResponse,
  VoucherTaxLineResponse,
  VoucherUpdate,
  VoucherVerificationResponse,
} from "@/api/models";

export const financeApi = {
  /** Phase 17 — voucher activity series (requires FINANCE_AI_READONLY_ENABLED + tenant flag). */
  async getFinanceAiReadonlyInsights(monthsBack?: number): Promise<Record<string, unknown>> {
    const q = monthsBack != null ? `?months_back=${monthsBack}` : "";
    return request<Record<string, unknown>>(`/api/v1/finance/ai/readonly-insights${q}`);
  },
  // Finance + Accounting parity baseline
  async listAccountGroups(): Promise<AccountGroupResponse[]> {
    return request<AccountGroupResponse[]>("/api/v1/finance/account-groups");
  },
  async listAccountGroupsHierarchy(): Promise<AccountGroupHierarchyNode[]> {
    return request<AccountGroupHierarchyNode[]>("/api/v1/finance/account-groups/hierarchy");
  },
  async seedAccountGroups(): Promise<AccountGroupResponse[]> {
    return request<AccountGroupResponse[]>("/api/v1/finance/account-groups/seed", { method: "POST" });
  },
  async createAccountGroup(data: AccountGroupCreate): Promise<AccountGroupResponse> {
    return request<AccountGroupResponse>("/api/v1/finance/account-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateAccountGroup(id: number, data: AccountGroupCreate): Promise<AccountGroupResponse> {
    return request<AccountGroupResponse>(`/api/v1/finance/account-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteAccountGroup(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/account-groups/${id}`, { method: "DELETE" });
  },
  async listChartOfAccounts(params?: { active_only?: boolean }): Promise<ChartOfAccountResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    // Dropdown helper: the API default (100) silently drops accounts on larger charts.
    q.set("limit", "1000");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ChartOfAccountResponse[]>(`/api/v1/finance/chart-of-accounts${suffix}`);
  },
  async listChartOfAccountsWithTotal(params?: {
    active_only?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<ChartOfAccountResponse>> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<ChartOfAccountResponse>(`/api/v1/finance/chart-of-accounts${suffix}`);
  },
  async getChartOfAccount(id: number): Promise<ChartOfAccountResponse> {
    return request<ChartOfAccountResponse>(`/api/v1/finance/chart-of-accounts/${id}`);
  },
  async createChartOfAccount(data: ChartOfAccountCreate): Promise<ChartOfAccountResponse> {
    return request<ChartOfAccountResponse>("/api/v1/finance/chart-of-accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateChartOfAccount(id: number, data: ChartOfAccountCreate): Promise<ChartOfAccountResponse> {
    return request<ChartOfAccountResponse>(`/api/v1/finance/chart-of-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteChartOfAccount(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/chart-of-accounts/${id}`, { method: "DELETE" });
  },
  async getCoaConfig(): Promise<CoAConfigResponse> {
    return request<CoAConfigResponse>("/api/v1/finance/coa-config");
  },
  async putCoaConfig(data: CoAConfigUpdate): Promise<CoAConfigResponse> {
    return request<CoAConfigResponse>("/api/v1/finance/coa-config", { method: "PUT", body: JSON.stringify(data) });
  },
  async getAccountGroupReportingImpact(groupId: number): Promise<ReportingImpactResponse> {
    return request<ReportingImpactResponse>(`/api/v1/finance/account-groups/${groupId}/reporting-impact`);
  },
  async coaExport(): Promise<string> {
    return requestText("/api/v1/finance/coa/export");
  },
  async coaImport(file: File, conflict: "skip" | "update" | "abort" = "skip"): Promise<CoAImportResult> {
    const form = new FormData();
    form.append("file", file);
    const path = `/api/v1/finance/coa/import?conflict=${encodeURIComponent(conflict)}`;
    return request<CoAImportResult>(path, { method: "POST", body: form });
  },
  async listVouchers(params?: { status_filter?: string; from_date?: string; to_date?: string }): Promise<VoucherResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VoucherResponse[]>(`/api/v1/finance/vouchers${suffix}`);
  },
  async listVouchersWithTotal(params?: {
    status_filter?: string;
    /** Match any of these statuses (cannot be combined with `status_filter`). */
    status_filters?: readonly string[];
    from_date?: string;
    to_date?: string;
    search?: string;
    voucher_id?: number;
    limit?: number;
    offset?: number;
    sort?: "id" | "date";
  }): Promise<ListWithTotal<VoucherResponse>> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    for (const s of params?.status_filters ?? []) q.append("status_filters", s);
    if (params?.sort) q.set("sort", params.sort);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.voucher_id != null) q.set("voucher_id", String(params.voucher_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<VoucherResponse>(`/api/v1/finance/vouchers${suffix}`);
  },
  async createVoucher(data: VoucherCreate): Promise<VoucherResponse> {
    return request<VoucherResponse>("/api/v1/finance/vouchers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getVoucher(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}`);
  },
  async updateVoucher(id: number, data: VoucherUpdate): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteVoucher(id: number): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>(`/api/v1/finance/vouchers/${id}`, {
      method: "DELETE",
    });
  },
  async updateVoucherStatus(
    id: number,
    status: string,
    opts?: { budget_override?: boolean; budget_override_reason?: string | null; reason?: string | null },
  ): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({
        status,
        ...(opts?.budget_override ? { budget_override: true } : {}),
        ...(opts?.budget_override_reason
          ? { budget_override_reason: opts.budget_override_reason }
          : {}),
        ...(opts?.reason?.trim() ? { reason: opts.reason.trim() } : {}),
      }),
    });
  },
  /** Save = post (flag direct_post_vouchers): runs submit → check → recommend → approve → post in one call. */
  async directPostVoucher(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/direct-post`, { method: "POST" });
  },
  async getVoucherHistory(id: number): Promise<VoucherHistoryResponse> {
    return request<VoucherHistoryResponse>(`/api/v1/finance/vouchers/${id}/history`);
  },
  async voucherPostPreflight(id: number): Promise<VoucherPostPreflightResponse> {
    return request<VoucherPostPreflightResponse>(`/api/v1/finance/vouchers/${id}/post-preflight`, {
      method: "POST",
    });
  },
  async postVoucher(
    id: number,
    opts?: { budget_override?: boolean; budget_override_reason?: string | null },
  ): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/post`, {
      method: "POST",
      body: JSON.stringify({
        budget_override: Boolean(opts?.budget_override),
        ...(opts?.budget_override_reason
          ? { budget_override_reason: opts.budget_override_reason }
          : {}),
      }),
    });
  },
  async reverseVoucher(id: number, body: { reason: string }): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async duplicateVoucherRiskCheck(body: {
    voucher_date: string;
    reference?: string | null;
    voucher_type?: string | null;
    lines: VoucherLineCreate[];
  }): Promise<{
    duplicate_risk_hash: string;
    similar_posted_voucher_ids: number[];
    risk_level: "high" | "none";
  }> {
    return request(`/api/v1/finance/vouchers/duplicate-risk-check`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async cancelVoucherPosting(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/cancel-posting`, { method: "POST" });
  },
  async getVoucherTypesMeta(): Promise<string[]> {
    return request<string[]>("/api/v1/finance/vouchers/meta/types");
  },
  async getVoucherStatusesMeta(): Promise<string[]> {
    return request<string[]>("/api/v1/finance/vouchers/meta/statuses");
  },
  async getVoucherApprovalRulesMeta(): Promise<{
    min_levels: number;
    max_levels: number;
    rules: Array<{ level: number; required_role: string }>;
    notes: string;
  }> {
    return request<{
      min_levels: number;
      max_levels: number;
      rules: Array<{ level: number; required_role: string }>;
      notes: string;
    }>("/api/v1/finance/vouchers/meta/approval-rules");
  },
  async getVoucherAvailableActions(voucherId: number): Promise<{ voucher_id: number; status: string; actions: string[] }> {
    return request<{ voucher_id: number; status: string; actions: string[] }>(`/api/v1/finance/vouchers/${voucherId}/available-actions`);
  },

  async getVoucherAvailableActionsBatch(
    voucherIds: number[],
  ): Promise<{ items: { voucher_id: number; status: string; actions: string[] }[] }> {
    return request<{ items: { voucher_id: number; status: string; actions: string[] }[] }>(
      `/api/v1/finance/vouchers/available-actions-batch`,
      { method: "POST", body: JSON.stringify({ voucher_ids: voucherIds }) },
    );
  },
  async getDayBook(params?: {
    from_date?: string;
    to_date?: string;
    voucher_type?: string;
    account_id?: number;
    group_id?: number;
    party_name?: string;
  }): Promise<DayBookResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.account_id) q.set("account_id", String(params.account_id));
    if (params?.group_id) q.set("group_id", String(params.group_id));
    if (params?.party_name) q.set("party_name", params.party_name);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DayBookResponse>(`/api/v1/finance/reports/day-book${suffix}`);
  },
  async getTrialBalance(params?: { as_of_date?: string; account_id?: number; group_id?: number; basis?: ReportBasis }): Promise<TrialBalanceResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.account_id) q.set("account_id", String(params.account_id));
    if (params?.group_id) q.set("group_id", String(params.group_id));
    if (params?.basis) q.set("basis", params.basis);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<TrialBalanceResponse>(`/api/v1/finance/reports/trial-balance${suffix}`);
  },
  async getFinancialStatements(params?: { as_of_date?: string; group_id?: number; basis?: ReportBasis }): Promise<FinancialStatementsResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.group_id) q.set("group_id", String(params.group_id));
    if (params?.basis) q.set("basis", params.basis);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FinancialStatementsResponse>(`/api/v1/finance/reports/financial-statements${suffix}`);
  },
  async getExceptionSummary(): Promise<ExceptionSummaryResponse> {
    return request<ExceptionSummaryResponse>("/api/v1/finance/exceptions/summary");
  },
  async getExceptionGrnNotBilled(params?: { limit?: number; offset?: number }): Promise<ExceptionList<ExceptionGrnRow>> {
    const q = new URLSearchParams({ limit: String(params?.limit ?? 100), offset: String(params?.offset ?? 0) });
    return request<ExceptionList<ExceptionGrnRow>>(`/api/v1/finance/exceptions/grn-not-billed?${q.toString()}`);
  },
  async getExceptionChallanNotInvoiced(params?: { limit?: number; offset?: number }): Promise<ExceptionList<ExceptionChallanRow>> {
    const q = new URLSearchParams({ limit: String(params?.limit ?? 100), offset: String(params?.offset ?? 0) });
    return request<ExceptionList<ExceptionChallanRow>>(`/api/v1/finance/exceptions/challan-not-invoiced?${q.toString()}`);
  },
  async getExceptionNegativeCashBank(): Promise<ExceptionList<ExceptionNegativeLedgerRow>> {
    return request<ExceptionList<ExceptionNegativeLedgerRow>>("/api/v1/finance/exceptions/negative-cash-bank");
  },
  async getExceptionNegativeStock(): Promise<ExceptionList<ExceptionNegativeStockRow>> {
    return request<ExceptionList<ExceptionNegativeStockRow>>("/api/v1/finance/exceptions/negative-stock");
  },
  async getExceptionOverdueBills(): Promise<ExceptionList<ExceptionOverdueBillRow>> {
    return request<ExceptionList<ExceptionOverdueBillRow>>("/api/v1/finance/exceptions/overdue-bills");
  },
  async getCashFlowStatement(params?: { from_date?: string; to_date?: string }): Promise<CashFlowStatementResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CashFlowStatementResponse>(`/api/v1/finance/reports/cash-flow-statement${suffix}`);
  },
  async getMisHealth(): Promise<MisHealthResponse> {
    return request<MisHealthResponse>("/api/v1/finance/reports/mis-health");
  },
  async getFundFlowReport(params?: { from_date?: string; to_date?: string }): Promise<FundFlowResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FundFlowResponse>(`/api/v1/finance/reports/fund-flow${suffix}`);
  },
  async getMisRatioAnalysis(params?: { as_of_date?: string }): Promise<MisRatioAnalysisResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MisRatioAnalysisResponse>(`/api/v1/finance/reports/ratio-analysis${suffix}`);
  },
  async getMisRatioTrend(params: { ratio_name: string; months?: number }): Promise<MisRatioTrendResponse> {
    const q = new URLSearchParams();
    q.set("ratio_name", params.ratio_name);
    if (params.months != null) q.set("months", String(params.months));
    return request<MisRatioTrendResponse>(`/api/v1/finance/reports/ratio-analysis/trend?${q.toString()}`);
  },
  async getComparativeBalanceSheet(params: { year1: number; year2: number }): Promise<ComparativeStatementResponse> {
    const q = new URLSearchParams();
    q.set("year1", String(params.year1));
    q.set("year2", String(params.year2));
    return request<ComparativeStatementResponse>(
      `/api/v1/finance/reports/comparative-balance-sheet?${q.toString()}`,
    );
  },
  async getComparativePl(params: { year1: number; year2: number }): Promise<ComparativeStatementResponse> {
    const q = new URLSearchParams();
    q.set("year1", String(params.year1));
    q.set("year2", String(params.year2));
    return request<ComparativeStatementResponse>(`/api/v1/finance/reports/comparative-pl?${q.toString()}`);
  },
  async getCashScenarioAnalysis(): Promise<CashScenarioAnalysisResponse> {
    return request<CashScenarioAnalysisResponse>("/api/v1/finance/cash-flow/scenario-analysis");
  },
  async postCashSensitivity(body: { variable?: string; change_percent: number }): Promise<CashSensitivityResponse> {
    return request<CashSensitivityResponse>("/api/v1/finance/cash-flow/sensitivity", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getCashBreakEven(): Promise<CashBreakEvenResponse> {
    return request<CashBreakEvenResponse>("/api/v1/finance/cash-flow/break-even");
  },
  async getCashRunway(): Promise<CashRunwayResponse> {
    return request<CashRunwayResponse>("/api/v1/finance/cash-flow/runway");
  },
  async getLedgerActivity(params: { account_id: number; from_date?: string; to_date?: string }): Promise<LedgerActivityResponse> {
    const q = new URLSearchParams();
    q.set("account_id", String(params.account_id));
    if (params.from_date) q.set("from_date", params.from_date);
    if (params.to_date) q.set("to_date", params.to_date);
    return request<LedgerActivityResponse>(`/api/v1/finance/reports/ledger-activity?${q.toString()}`);
  },
  async getVoucherReportSummary(params?: {
    from_date?: string;
    to_date?: string;
    voucher_type?: string;
    status_filter?: string;
  }): Promise<VoucherReportSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VoucherReportSummaryResponse>(`/api/v1/finance/voucher-reports/summary${suffix}`);
  },
  async getVoucherReportMonthly(
    months_back = 12,
    params?: { from_date?: string; to_date?: string; voucher_type?: string; status_filter?: string },
  ): Promise<VoucherReportMonthlyResponse> {
    const q = new URLSearchParams();
    q.set("months_back", String(months_back));
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    return request<VoucherReportMonthlyResponse>(`/api/v1/finance/voucher-reports/monthly?${q.toString()}`);
  },
  async getVoucherReportTopPreparers(
    limit = 10,
    params?: { from_date?: string; to_date?: string; voucher_type?: string; status_filter?: string },
  ): Promise<VoucherReportTopPreparersResponse> {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    return request<VoucherReportTopPreparersResponse>(`/api/v1/finance/voucher-reports/top-preparers?${q.toString()}`);
  },
  async listCashForecastScenarios(): Promise<CashForecastScenarioResponse[]> {
    return request<CashForecastScenarioResponse[]>("/api/v1/finance/cash-forecast/scenarios");
  },
  async createCashForecastScenario(data: CashForecastScenarioCreate): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>("/api/v1/finance/cash-forecast/scenarios", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCashForecastScenario(id: number, data: CashForecastScenarioUpdate): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>(`/api/v1/finance/cash-forecast/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteCashForecastScenario(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/cash-forecast/scenarios/${id}`, { method: "DELETE" });
  },
  async generateCashForecastScenario(id: number): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>(`/api/v1/finance/cash-forecast/scenarios/${id}/generate`, {
      method: "POST",
    });
  },
  async getCashForecastSummary(): Promise<CashForecastSummaryResponse> {
    return request<CashForecastSummaryResponse>("/api/v1/finance/cash-forecast/summary");
  },
  async createVendorBillDraftFromGrn(grnId: number): Promise<{ id: number; bill_code: string; status: string }> {
    return request(`/api/v1/finance/vendor-bills/from-grn/${grnId}`, { method: "POST" });
  },
  async listVendorBills(params?: { limit?: number; offset?: number }): Promise<VendorBillSummary[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VendorBillSummary[]>(`/api/v1/finance/vendor-bills${suffix}`);
  },
  async getVendorBill(billId: number): Promise<VendorBillDetailResponse> {
    return request<VendorBillDetailResponse>(`/api/v1/finance/vendor-bills/${billId}`);
  },
  async patchVendorBill(
    billId: number,
    data: { vendor_invoice_ref?: string | null; status?: string | null; notes?: string | null },
  ): Promise<{ id: number; bill_code: string; status: string; vendor_invoice_ref: string | null }> {
    return request(`/api/v1/finance/vendor-bills/${billId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async postVendorBill(billId: number): Promise<{ id: number; bill_code: string; status: string; voucher_id: number | null }> {
    return request(`/api/v1/finance/vendor-bills/${billId}/post`, { method: "POST" });
  },
  async getBusinessOverview(): Promise<BusinessOverviewResponse> {
    return request<BusinessOverviewResponse>("/api/v1/finance/business-overview");
  },
  async getBusinessOverviewHealthScore(): Promise<BusinessHealthScoreResponse> {
    return request<BusinessHealthScoreResponse>("/api/v1/finance/business-overview/health-score");
  },
  async getBusinessOverviewDeterministicSummary(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/finance/business-overview/deterministic-summary");
  },
  async getBusinessOverviewAiNarrative(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/finance/business-overview/ai-narrative");
  },
  async listFxReceipts(params?: { status_filter?: string }): Promise<FxReceiptResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FxReceiptResponse[]>(`/api/v1/finance/fx-receipts${suffix}`);
  },
  async createFxReceipt(data: FxReceiptCreate): Promise<FxReceiptResponse> {
    return request<FxReceiptResponse>("/api/v1/finance/fx-receipts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settleFxReceipt(id: number, settle_amount: string): Promise<FxReceiptResponse> {
    return request<FxReceiptResponse>(`/api/v1/finance/fx-receipts/${id}/settle`, {
      method: "POST",
      body: JSON.stringify({ settle_amount }),
    });
  },
  async getFxUnsettledSummary(): Promise<FxUnsettledSummaryResponse> {
    return request<FxUnsettledSummaryResponse>("/api/v1/finance/fx-receipts/unsettled-summary");
  },
  async getStyleProfitability(styleId: number): Promise<ProfitabilityResponse> {
    return request<ProfitabilityResponse>(`/api/v1/finance/profitability/style/${styleId}`);
  },
  async getLcProfitability(orderId: number): Promise<ProfitabilityResponse> {
    return request<ProfitabilityResponse>(`/api/v1/finance/profitability/lc/${orderId}`);
  },
  async getCostingVariance(orderId: number): Promise<ProfitabilityResponse> {
    return request<ProfitabilityResponse>(`/api/v1/finance/profitability/variance/${orderId}`);
  },
  async getMultiCurrencyRevaluationSummary(params?: { base_currency?: string }): Promise<MultiCurrencyRevaluationResponse> {
    const q = new URLSearchParams();
    if (params?.base_currency) q.set("base_currency", params.base_currency);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MultiCurrencyRevaluationResponse>(`/api/v1/finance/multi-currency/revaluation-summary${suffix}`);
  },
  async listOutstandingBills(params?: { bill_type?: "PAYABLE" | "RECEIVABLE"; status_filter?: string }): Promise<OutstandingBillResponse[]> {
    const q = new URLSearchParams();
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OutstandingBillResponse[]>(`/api/v1/finance/bills${suffix}`);
  },
  async createOutstandingBill(data: OutstandingBillCreate): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>("/api/v1/finance/bills", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settleOutstandingBill(id: number, settle_amount: string): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/bills/${id}/settle`, {
      method: "POST",
      body: JSON.stringify({ settle_amount }),
    });
  },
  async allocateOutstandingBill(id: number, voucher_id: number, amount: string): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/bills/${id}/allocate`, {
      method: "POST",
      body: JSON.stringify({ voucher_id, amount }),
    });
  },
  async autoCreateBillFromVoucher(
    voucherId: number,
    data: { party_name: string; bill_type?: "PAYABLE" | "RECEIVABLE"; due_in_days?: number; currency?: string; notes?: string }
  ): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/bills/auto-create-from-voucher/${voucherId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getBillsAging(params?: { bill_type?: "PAYABLE" | "RECEIVABLE"; as_of_date?: string; party_name?: string }): Promise<BillsAgingResponse> {
    const q = new URLSearchParams();
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.party_name) q.set("party_name", params.party_name);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BillsAgingResponse>(`/api/v1/finance/bills/aging${suffix}`);
  },

  // --- Party ledger (bill-wise AR/AP) ---
  async listPartyLedgers(params?: {
    party_type?: string;
    search?: string;
    is_active?: boolean;
    balance_type?: string;
    overdue_only?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<PartyLedgerListResponse> {
    const q = new URLSearchParams();
    if (params?.party_type) q.set("party_type", params.party_type);
    if (params?.search) q.set("search", params.search);
    if (params?.is_active === false) q.set("is_active", "false");
    if (params?.balance_type) q.set("balance_type", params.balance_type);
    if (params?.overdue_only) q.set("overdue_only", "true");
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q}` : "";
    return request<PartyLedgerListResponse>(`/api/v1/finance/party-ledgers${suffix}`);
  },

  // --- Sprint 3: GST / tax ledgers ---
  async listTaxLedgers(params?: { active_only?: boolean }): Promise<TaxLedgerResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q}` : "";
    return request<TaxLedgerResponse[]>(`/api/v1/finance/tax-ledgers${suffix}`);
  },
  async getTaxLedger(id: number): Promise<TaxLedgerResponse> {
    return request<TaxLedgerResponse>(`/api/v1/finance/tax-ledgers/${id}`);
  },
  async createTaxLedger(data: TaxLedgerCreate): Promise<TaxLedgerResponse> {
    return request<TaxLedgerResponse>("/api/v1/finance/tax-ledgers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateTaxLedger(id: number, data: TaxLedgerUpdate): Promise<TaxLedgerResponse> {
    return request<TaxLedgerResponse>(`/api/v1/finance/tax-ledgers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deactivateTaxLedger(id: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/finance/tax-ledgers/${id}`, { method: "DELETE" });
  },
  async previewTax(data: TaxPreviewRequest): Promise<TaxPreviewResponse> {
    return request<TaxPreviewResponse>("/api/v1/finance/tax/preview", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async calculateVoucherTax(
    voucherId: number,
    data?: {
      apply?: boolean;
      place_of_supply_state?: string;
      direction?: "OUTWARD" | "INWARD";
      taxable_lines?: { taxable_amount: string | number; gst_rate: string | number; hsn_code?: string }[];
    },
  ): Promise<TaxPreviewResponse> {
    return request<TaxPreviewResponse>(`/api/v1/finance/vouchers/${voucherId}/calculate-tax`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  },
  async getVoucherTaxLines(voucherId: number): Promise<VoucherTaxLineResponse[]> {
    return request(`/api/v1/finance/vouchers/${voucherId}/tax-lines`);
  },
  async getGstSettings(): Promise<GstSettings> {
    return request<GstSettings>("/api/v1/finance/gst/settings");
  },
  async updateGstSettings(data: GstSettings): Promise<GstSettings> {
    return request<GstSettings>("/api/v1/finance/gst/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async getGstr1(params: { from_date: string; to_date: string }): Promise<GstReturnPayload> {
    return request(`/api/v1/finance/gst/gstr1?from_date=${params.from_date}&to_date=${params.to_date}`);
  },
  async getGstr2(params: { from_date: string; to_date: string }): Promise<GstReturnPayload> {
    return request(`/api/v1/finance/gst/gstr2?from_date=${params.from_date}&to_date=${params.to_date}`);
  },
  async getGstr3b(params: { from_date: string; to_date: string }): Promise<GstReturnPayload> {
    return request(`/api/v1/finance/gst/gstr3b?from_date=${params.from_date}&to_date=${params.to_date}`);
  },
  async getGstItcSummary(params: { from_date: string; to_date: string }): Promise<GstReturnPayload> {
    return request(`/api/v1/finance/gst/itc-summary?from_date=${params.from_date}&to_date=${params.to_date}`);
  },
  async exportGstr1(params: {
    from_date: string;
    to_date: string;
    format?: "json" | "excel";
  }): Promise<Record<string, unknown>> {
    const format = params.format || "json";
    return request(
      `/api/v1/finance/gst/export-gstr1?from_date=${params.from_date}&to_date=${params.to_date}&format=${format}`,
      { method: "POST" },
    );
  },

  // --- Sprint 5: TDS ---
  async listTdsSections(): Promise<TdsSectionsListResponse> {
    return request<TdsSectionsListResponse>("/api/v1/finance/tds/sections");
  },
  async createTdsSection(data: TdsSectionBody): Promise<TdsSectionResponse> {
    return request<TdsSectionResponse>("/api/v1/finance/tds/sections", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateTdsSection(id: number, data: TdsSectionBody): Promise<TdsSectionResponse> {
    return request<TdsSectionResponse>(`/api/v1/finance/tds/sections/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async getTdsSettings(): Promise<TdsSettingsResponse> {
    return request<TdsSettingsResponse>("/api/v1/finance/tds/settings");
  },
  async updateTdsSettings(data: TdsSettingsBody): Promise<TdsSettingsResponse> {
    return request<TdsSettingsResponse>("/api/v1/finance/tds/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async assignPartyLedgerTdsSection(
    partyLedgerId: number,
    tdsSectionId: number | null,
  ): Promise<{ id: number; tds_section_id: number | null }> {
    return request(`/api/v1/finance/party-ledgers/${partyLedgerId}/tds-section`, {
      method: "PUT",
      body: JSON.stringify({ tds_section_id: tdsSectionId }),
    });
  },
  async calculateTds(data: TdsCalcBody): Promise<TdsCalcResponse> {
    return request<TdsCalcResponse>("/api/v1/finance/tds/calculate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listTdsDeductions(params?: {
    party_ledger_id?: number;
    status?: string;
  }): Promise<TdsDeductionsListResponse> {
    const q = new URLSearchParams();
    if (params?.party_ledger_id != null) q.set("party_ledger_id", String(params.party_ledger_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q}` : "";
    return request<TdsDeductionsListResponse>(`/api/v1/finance/tds/deductions${suffix}`);
  },
  async getTdsReturn(params: {
    year: number;
    quarter: number;
    form?: "26Q" | "24Q";
  }): Promise<TdsReturnResponse> {
    const q = new URLSearchParams({
      year: String(params.year),
      quarter: String(params.quarter),
      form: params.form || "26Q",
    });
    return request<TdsReturnResponse>(`/api/v1/finance/tds/returns?${q}`);
  },
  async exportTdsReturn(params: {
    year: number;
    quarter: number;
    form?: "26Q" | "24Q";
  }): Promise<TdsReturnExportResponse> {
    const q = new URLSearchParams({
      year: String(params.year),
      quarter: String(params.quarter),
      form: params.form || "26Q",
    });
    return request<TdsReturnExportResponse>(`/api/v1/finance/tds/returns/export?${q}`, { method: "POST" });
  },

  // --- Sprint 4: advanced vouchers ---
  async listAdvancedVoucherTypes(): Promise<AdvancedVoucherTypesResponse> {
    return request<AdvancedVoucherTypesResponse>("/api/v1/finance/voucher-types/advanced");
  },
  async patchAdvancedVoucherType(
    id: number,
    data: Partial<{
      is_active: boolean;
      is_credit_note: boolean;
      is_debit_note: boolean;
      is_memorandum: boolean;
      is_optional: boolean;
      is_post_dated: boolean;
      is_stock_transfer: boolean;
      voucher_class_id: number | null;
    }>,
  ): Promise<AdvancedVoucherTypeRow> {
    return request<AdvancedVoucherTypeRow>(`/api/v1/finance/voucher-types/advanced/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listVoucherClasses(params?: { voucher_type?: string }): Promise<{ rows: VoucherClassResponse[] }> {
    const q = new URLSearchParams();
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    const suffix = q.toString() ? `?${q}` : "";
    return request(`/api/v1/finance/voucher-classes${suffix}`);
  },
  async getVoucherClass(id: number): Promise<VoucherClassResponse> {
    return request<VoucherClassResponse>(`/api/v1/finance/voucher-classes/${id}`);
  },
  async createVoucherClass(data: VoucherClassBody): Promise<VoucherClassResponse> {
    return request<VoucherClassResponse>("/api/v1/finance/voucher-classes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateVoucherClass(id: number, data: VoucherClassBody): Promise<VoucherClassResponse> {
    return request<VoucherClassResponse>(`/api/v1/finance/voucher-classes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteVoucherClass(id: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/finance/voucher-classes/${id}`, { method: "DELETE" });
  },
  async listRecurringVouchers(): Promise<{ rows: RecurringVoucherResponse[] }> {
    return request("/api/v1/finance/recurring-vouchers");
  },
  async createRecurringVoucher(data: RecurringVoucherBody): Promise<RecurringVoucherResponse> {
    return request<RecurringVoucherResponse>("/api/v1/finance/recurring-vouchers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateRecurringVoucher(id: number, data: RecurringVoucherBody): Promise<RecurringVoucherResponse> {
    return request<RecurringVoucherResponse>(`/api/v1/finance/recurring-vouchers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteRecurringVoucher(id: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/finance/recurring-vouchers/${id}`, { method: "DELETE" });
  },
  async generateRecurringVoucher(id: number): Promise<{
    voucher_id: number;
    voucher_number: string;
    template: RecurringVoucherResponse;
  }> {
    return request(`/api/v1/finance/recurring-vouchers/${id}/generate`, { method: "POST" });
  },
  async getRecurringVoucherHistory(id: number): Promise<{ rows: RecurringVoucherHistoryRow[] }> {
    return request(`/api/v1/finance/recurring-vouchers/${id}/history`);
  },
  async createCreditNote(data: CreditDebitNoteBody): Promise<CreditDebitNoteResult> {
    return request<CreditDebitNoteResult>("/api/v1/finance/credit-notes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async createDebitNote(data: CreditDebitNoteBody): Promise<CreditDebitNoteResult> {
    return request<CreditDebitNoteResult>("/api/v1/finance/debit-notes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async createFinanceStockTransferVoucher(data: FinanceStockTransferVoucherBody): Promise<Record<string, unknown>> {
    return request("/api/v1/finance/stock-transfer-vouchers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listPostDatedRegister(): Promise<{ rows: PostDatedRegisterRow[] }> {
    return request("/api/v1/finance/registers/post-dated");
  },
  async activateDuePostDated(): Promise<{ activated_ids: number[]; count: number }> {
    return request("/api/v1/finance/registers/post-dated/activate-due", { method: "POST" });
  },
  async listMemorandumRegister(): Promise<{ rows: MemorandumRegisterRow[] }> {
    return request("/api/v1/finance/registers/memorandum");
  },
  async convertMemorandumVoucher(voucherId: number): Promise<Record<string, unknown>> {
    return request(`/api/v1/finance/vouchers/${voucherId}/convert-memorandum`, { method: "POST" });
  },

  async getPartyLedger(id: number): Promise<PartyLedgerResponse> {
    return request<PartyLedgerResponse>(`/api/v1/finance/party-ledgers/${id}`);
  },
  async getPartyLedgerByParty(
    partyType: "CUSTOMER" | "VENDOR",
    partyId: number,
  ): Promise<PartyLedgerResponse | null> {
    return request<PartyLedgerResponse | null>(
      `/api/v1/finance/party-ledgers/by-party/${partyType}/${partyId}`,
    );
  },
  async createPartyLedger(data: PartyLedgerCreate): Promise<PartyLedgerResponse> {
    return request<PartyLedgerResponse>(`/api/v1/finance/party-ledgers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updatePartyLedger(
    id: number,
    data: Partial<{
      credit_limit: string | number | null;
      credit_days: number | null;
      interest_rate_monthly: string | number | null;
      is_active: boolean;
      bill_wise_tracking: boolean;
    }>,
  ): Promise<PartyLedgerResponse> {
    return request<PartyLedgerResponse>(`/api/v1/finance/party-ledgers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deletePartyLedger(id: number): Promise<{ id: number; soft_deleted?: boolean; deleted?: boolean }> {
    return request(`/api/v1/finance/party-ledgers/${id}`, { method: "DELETE" });
  },
  async listPartyLedgerBills(
    ledgerId: number,
    params?: { status?: string; from_date?: string; to_date?: string; bill_type?: string; page?: number },
  ): Promise<{ items: PartyLedgerBillResponse[]; page: number; page_size: number }> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.page) q.set("page", String(params.page));
    const suffix = q.toString() ? `?${q}` : "";
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/bills${suffix}`);
  },
  async listPartyLedgerPendingBills(ledgerId: number): Promise<PartyLedgerBillResponse[]> {
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/bills/pending`);
  },
  async getPartyLedgerBill(ledgerId: number, billId: number): Promise<PartyLedgerBillResponse> {
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/bills/${billId}`);
  },
  async allocatePartyLedgerBill(
    ledgerId: number,
    billId: number,
    data: { voucher_id: number; allocated_amount: string | number; notes?: string; allocated_date?: string },
  ): Promise<PartyLedgerAllocationResponse> {
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/bills/${billId}/allocate`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getPartyLedgerStatement(
    ledgerId: number,
    params?: { from_date?: string; to_date?: string },
  ): Promise<PartyLedgerStatementResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q}` : "";
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/statement${suffix}`);
  },
  async getPartyLedgerAging(params?: {
    party_type?: string;
    as_of_date?: string;
    party_ledger_id?: number;
  }): Promise<PartyLedgerAgingResponse> {
    const q = new URLSearchParams();
    if (params?.party_type) q.set("party_type", params.party_type);
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.party_ledger_id) q.set("party_ledger_id", String(params.party_ledger_id));
    const suffix = q.toString() ? `?${q}` : "";
    return request(`/api/v1/finance/party-ledgers/aging-report${suffix}`);
  },
  async listPartyLedgerAllocations(ledgerId: number): Promise<PartyLedgerAllocationResponse[]> {
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/allocations`);
  },
  async autoAllocatePartyLedger(data: {
    party_ledger_id: number;
    voucher_id: number;
    method?: "FIFO" | "LIFO" | "MANUAL";
    bill_ids?: number[];
  }): Promise<PartyLedgerAllocationResponse[]> {
    return request(`/api/v1/finance/party-ledgers/auto-allocate`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async markPartyLedgerOverdue(as_of_date?: string): Promise<Record<string, unknown>> {
    return request(`/api/v1/finance/party-ledgers/mark-overdue`, {
      method: "POST",
      body: JSON.stringify({ as_of_date: as_of_date ?? null }),
    });
  },
  async calculatePartyLedgerInterest(
    ledgerId: number,
    as_of_date?: string,
  ): Promise<{ bills_calculated: number; total_interest_accrued: string; bills: unknown[] }> {
    return request(`/api/v1/finance/party-ledgers/${ledgerId}/calculate-interest`, {
      method: "POST",
      body: JSON.stringify({ as_of_date: as_of_date ?? null }),
    });
  },

  async listCostCenters(params?: { active_only?: boolean }): Promise<CostCenterResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostCenterResponse[]>(`/api/v1/finance/cost-centers${suffix}`);
  },
  async listCostCentersWithTotal(params?: {
    active_only?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<CostCenterResponse>> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<CostCenterResponse>(`/api/v1/finance/cost-centers${suffix}`);
  },
  async getCostCenter(id: number): Promise<CostCenterResponse> {
    return request<CostCenterResponse>(`/api/v1/finance/cost-centers/${id}`);
  },
  async createCostCenter(data: CostCenterCreate): Promise<CostCenterResponse> {
    return request<CostCenterResponse>("/api/v1/finance/cost-centers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCostCenter(id: number, data: CostCenterCreate): Promise<CostCenterResponse> {
    return request<CostCenterResponse>(`/api/v1/finance/cost-centers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async getCostCenterDashboard(): Promise<CostCenterDashboardRow[]> {
    return request<CostCenterDashboardRow[]>("/api/v1/finance/cost-centers/dashboard");
  },
  async listBudgets(params?: { fiscal_year?: string }): Promise<BudgetResponse[]> {
    const q = new URLSearchParams();
    if (params?.fiscal_year) q.set("fiscal_year", params.fiscal_year);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BudgetResponse[]>(`/api/v1/finance/budgets${suffix}`);
  },
  async createBudget(data: BudgetCreate): Promise<BudgetResponse> {
    return request<BudgetResponse>("/api/v1/finance/budgets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateBudget(budgetId: number, data: BudgetCreate): Promise<BudgetResponse> {
    return request<BudgetResponse>(`/api/v1/finance/budgets/${budgetId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteBudget(budgetId: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/budgets/${budgetId}`, { method: "DELETE" });
  },
  async getBudgetVsActual(budgetId: number): Promise<BudgetVsActualResponse> {
    return request<BudgetVsActualResponse>(`/api/v1/finance/budgets/${budgetId}/vs-actual`);
  },
  async getVoucherPrint(voucherId: number): Promise<VoucherPrintResponse> {
    return request<VoucherPrintResponse>(`/api/v1/finance/vouchers/${voucherId}/print`);
  },
  async verifyVoucher(verificationId: string): Promise<VoucherVerificationResponse> {
    return request<VoucherVerificationResponse>(`/api/v1/finance/vouchers/verify/${encodeURIComponent(verificationId)}`);
  },
  async listAccountingPeriods(): Promise<AccountingPeriodResponse[]> {
    return request<AccountingPeriodResponse[]>("/api/v1/finance/accounting-periods");
  },
  async createAccountingPeriod(data: AccountingPeriodCreate): Promise<AccountingPeriodResponse> {
    return request<AccountingPeriodResponse>("/api/v1/finance/accounting-periods", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async closeAccountingPeriod(id: number): Promise<AccountingPeriodResponse> {
    return request<AccountingPeriodResponse>(`/api/v1/finance/accounting-periods/${id}/close`, { method: "POST" });
  },
  async reopenAccountingPeriod(id: number): Promise<AccountingPeriodResponse> {
    return request<AccountingPeriodResponse>(`/api/v1/finance/accounting-periods/${id}/reopen`, { method: "POST" });
  },
  async deleteAccountingPeriod(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/accounting-periods/${id}`, { method: "DELETE" });
  },
  async checkAccountingPeriodLock(voucher_date: string): Promise<{ locked: boolean; reason?: string; period_id?: number; period_name?: string }> {
    const q = new URLSearchParams();
    q.set("voucher_date", voucher_date);
    return request<{ locked: boolean; reason?: string; period_id?: number; period_name?: string }>(`/api/v1/finance/accounting-periods/check-lock?${q.toString()}`);
  },
  async voucherEntryAssist(body: VoucherEntryAssistRequest): Promise<VoucherEntryAssistResponse> {
    return request<VoucherEntryAssistResponse>("/api/v1/finance/voucher-entry-assist", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async suggestVoucherNarration(body: VoucherEntryAssistRequest): Promise<VoucherNarrationSuggestion> {
    return request<VoucherNarrationSuggestion>("/api/v1/finance/voucher-entry-assist/narration", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listBankAccounts(params?: { active_only?: boolean }): Promise<BankAccountResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BankAccountResponse[]>(`/api/v1/finance/banking/accounts${suffix}`);
  },
  async createBankAccount(data: BankAccountCreate): Promise<BankAccountResponse> {
    return request<BankAccountResponse>("/api/v1/finance/banking/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateBankAccount(id: number, data: BankAccountCreate): Promise<BankAccountResponse> {
    return request<BankAccountResponse>(`/api/v1/finance/banking/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listBankReconciliations(params?: { bank_account_id?: number }): Promise<BankReconciliationResponse[]> {
    const q = new URLSearchParams();
    if (params?.bank_account_id != null) q.set("bank_account_id", String(params.bank_account_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BankReconciliationResponse[]>(`/api/v1/finance/banking/reconciliation${suffix}`);
  },
  async createBankReconciliation(data: BankReconciliationCreate): Promise<BankReconciliationResponse> {
    return request<BankReconciliationResponse>("/api/v1/finance/banking/reconciliation", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async resolveBankReconciliation(id: number): Promise<BankReconciliationResponse> {
    return request<BankReconciliationResponse>(`/api/v1/finance/banking/reconciliation/${id}/resolve`, { method: "POST" });
  },
  async listBankStatementLines(reconId: number): Promise<BankStatementLineResponse[]> {
    return request<BankStatementLineResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines`);
  },
  async getBankReconciliationSummary(reconId: number): Promise<BankReconciliationSummaryResponse> {
    return request<BankReconciliationSummaryResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/summary`);
  },
  async finalizeBankReconciliation(reconId: number, reason?: string): Promise<BankReconciliationResponse> {
    return request<BankReconciliationResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  async listBankStatementMatchLogs(reconId: number): Promise<BankStatementMatchLogResponse[]> {
    return request<BankStatementMatchLogResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/match-logs`);
  },
  async exportBankStatementMatchLogsCsv(reconId: number): Promise<string> {
    return requestText(`/api/v1/finance/banking/reconciliation/${reconId}/match-logs/export-csv`);
  },
  async importBankStatementLines(reconId: number, lines: BankStatementLineCreate[]): Promise<BankStatementLineResponse[]> {
    return request<BankStatementLineResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    });
  },
  async importBankStatementLinesCsv(reconId: number, csv_text: string): Promise<BankStatementLineResponse[]> {
    return request<BankStatementLineResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines/import-csv`, {
      method: "POST",
      body: JSON.stringify({ csv_text }),
    });
  },
  async manualMatchBankStatementLine(
    reconId: number,
    lineId: number,
    payment_run_id: number
  ): Promise<BankStatementLineResponse> {
    return request<BankStatementLineResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines/${lineId}/match`, {
      method: "POST",
      body: JSON.stringify({ payment_run_id }),
    });
  },
  async manualUnmatchBankStatementLine(reconId: number, lineId: number): Promise<BankStatementLineResponse> {
    return request<BankStatementLineResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines/${lineId}/unmatch`, {
      method: "POST",
    });
  },
  async autoMatchBankStatementLines(reconId: number, tolerance?: number): Promise<{ matched_count: number; remaining_unmatched: number }> {
    const q = new URLSearchParams();
    if (tolerance != null) q.set("tolerance", String(tolerance));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ matched_count: number; remaining_unmatched: number }>(
      `/api/v1/finance/banking/reconciliation/${reconId}/auto-match${suffix}`,
      { method: "POST" }
    );
  },
  async listPaymentRuns(params?: { status_filter?: string }): Promise<PaymentRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaymentRunResponse[]>(`/api/v1/finance/banking/payment-runs${suffix}`);
  },
  async createPaymentRun(data: PaymentRunCreate): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>("/api/v1/finance/banking/payment-runs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async executePaymentRun(id: number): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>(`/api/v1/finance/banking/payment-runs/${id}/execute`, { method: "POST" });
  },
  async approvePaymentRun(id: number): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>(`/api/v1/finance/banking/payment-runs/${id}/approve`, { method: "POST" });
  },
  async processPaymentRun(id: number): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>(`/api/v1/finance/banking/payment-runs/${id}/process`, { method: "POST" });
  },
  async getPaymentRunAdvice(id: number): Promise<PaymentRunAdviceResponse> {
    return request<PaymentRunAdviceResponse>(`/api/v1/finance/banking/payment-runs/${id}/advice`);
  },
  async listSettlementAudit(params?: {
    from_date?: string;
    to_date?: string;
    status_filter?: string;
    source_currency?: string;
    party_query?: string;
    limit?: number;
    offset?: number;
  }): Promise<SettlementAuditResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.source_currency) q.set("source_currency", params.source_currency);
    if (params?.party_query) q.set("party_query", params.party_query);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<SettlementAuditResponse>(`/api/v1/finance/banking/settlement-audit${suffix}`);
  },
  async exportSettlementAuditCsv(params?: {
    from_date?: string;
    to_date?: string;
    status_filter?: string;
    source_currency?: string;
    party_query?: string;
  }): Promise<string> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.source_currency) q.set("source_currency", params.source_currency);
    if (params?.party_query) q.set("party_query", params.party_query);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestText(`/api/v1/finance/banking/settlement-audit/export.csv${suffix}`);
  },
  async listSettlementAuditPresets(): Promise<SettlementAuditPresetResponse[]> {
    return request<SettlementAuditPresetResponse[]>("/api/v1/finance/banking/settlement-audit-presets");
  },
  async saveSettlementAuditPreset(
    body: SettlementAuditPresetCreate,
  ): Promise<SettlementAuditPresetResponse> {
    return request<SettlementAuditPresetResponse>("/api/v1/finance/banking/settlement-audit-presets", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteSettlementAuditPreset(id: number): Promise<void> {
    return request<void>(`/api/v1/finance/banking/settlement-audit-presets/${id}`, {
      method: "DELETE",
    });
  },
  async getPurchaseApOverview(): Promise<PurchaseApOverviewResponse> {
    return request<PurchaseApOverviewResponse>("/api/v1/finance/purchase-workflow/ap-overview");
  },
  async createPayableFromPurchaseOrder(
    poId: number,
    data?: { due_in_days?: number; currency?: string; notes?: string }
  ): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/purchase-workflow/create-payable-from-po/${poId}`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  async createPayableFromGoodsReceiving(
    grnId: number,
    data?: { due_in_days?: number; currency?: string; notes?: string }
  ): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/purchase-workflow/create-payable-from-grn/${grnId}`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },

  // Commercial
  async listBillReferences(params?: { bill_type?: string; status_filter?: string; account_id?: number; search?: string }): Promise<BillReferenceRow[]> {
    const q = new URLSearchParams();
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.account_id) q.set("account_id", String(params.account_id));
    if (params?.search) q.set("search", params.search);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BillReferenceRow[]>(`/api/v1/finance/bill-references${suffix}`);
  },
  async createBillReference(body: BillReferenceCreate): Promise<BillReferenceRow> {
    return request<BillReferenceRow>("/api/v1/finance/bill-references", { method: "POST", body: JSON.stringify(body) });
  },
  async getBillReferenceDetail(id: number): Promise<BillReferenceDetail> {
    return request<BillReferenceDetail>(`/api/v1/finance/bill-references/${id}`);
  },
  async allocateBillWise(body: BillAllocationCreate): Promise<{ ok: boolean; allocation_id: number; message: string }> {
    return request<{ ok: boolean; allocation_id: number; message: string }>("/api/v1/finance/bill-references/allocate", { method: "POST", body: JSON.stringify(body) });
  },
  async autoCreateBillRefs(voucherId: number): Promise<{ ok: boolean; bills_created: number; bill_numbers: string[] }> {
    return request<{ ok: boolean; bills_created: number; bill_numbers: string[] }>(`/api/v1/finance/bill-references/auto-create/${voucherId}`, { method: "POST" });
  },
  async billWiseOutstandingReport(): Promise<BillWiseOutstandingReport> {
    return request<BillWiseOutstandingReport>("/api/v1/finance/bill-references/report/outstanding");
  },
  async billWiseAgingReport(billType?: string): Promise<BillWiseAgingReport> {
    const q = billType ? `?bill_type=${encodeURIComponent(billType)}` : "";
    return request<BillWiseAgingReport>(`/api/v1/finance/bill-references/report/aging${q}`);
  },
  async backfillVoucherSignatures(): Promise<{ signed_count: number; message: string }> {
    return request<{ signed_count: number; message: string }>("/api/v1/finance/vouchers/backfill-signatures", { method: "POST" });
  },

  // ── AI document extraction (no file persistence) ──
  async getFinanceExposureMasterLc(masterContractId: number): Promise<FinanceMasterLcExposureResponse> {
    return request(`/api/v1/finance/exposure/master-lc/${masterContractId}`);
  },
  async getFinanceMaturityLadder(masterContractId?: number): Promise<FinanceMaturityTrancheRow[]> {
    const q = masterContractId != null ? `?master_contract_id=${masterContractId}` : "";
    return request(`/api/v1/finance/maturity-ladder${q}`);
  },
};
