/**
 * Platform: settings, dashboard, tenants, notifications, files, billing, search and other shared calls API calls.
 *
 * Merged into `api` in `api/client.ts`, so existing `api.someMethod()` calls keep working.
 * Types live in `api/models.ts` (re-exported by `api/client.ts`).
 */
import { getTenantId, request, requestBlob, requestPlatformAdmin, requestPublic } from "@/api/core";
import { type ExternalAccessOverview, type ExternalAuditListResponse, type ExternalFeatureFlagsPatch, type ExternalInviteResponse, type ExternalPrincipalAdminRow, type ExternalPrincipalListResponse } from "@/types/externalAccess";
import type {
  AiDashboardBriefResponse,
  AiProfitabilityResponse,
  AuditLogResponse,
  BackupHistoryRow,
  BackupStatusResponse,
  CustomerMapPoint,
  CustomerPerformanceRow,
  DashboardAttentionSummary,
  DashboardEmployeeSummary,
  DashboardInsight,
  DashboardKpi,
  DashboardPayrollRow,
  DashboardPendingPriceVerificationsResponse,
  DashboardProductionPoint,
  DashboardRecentOrder,
  DashboardRevenueTrend,
  DashboardTask,
  DataMigrationImportResponse,
  DataMigrationTemplatesResponse,
  GlobalSearchResponse,
  LemonSqueezyCheckoutResponse,
  MySignature,
  NotificationList,
  OnboardingChecklist,
  OrderStatusSummary,
  PermissionsRegistryResponse,
  PlatformAdminTenantBulkCreateBody,
  PlatformAdminTenantBulkCreateResponse,
  PlatformAdminTokenResponse,
  PlatformSupportTicketDetail,
  PlatformSupportTicketItem,
  ReportGrnRow,
  ReportPurchaseOrderRow,
  ReportSalesOrderRow,
  RoleResponse,
  SavedView,
  SavedViewConfig,
  SettingsAuditLogListResponse,
  SettingsChequeTemplatesListResponse,
  SettingsConfigResponse,
  SettingsConfigUpdate,
  SettingsPricingResponse,
  SettingsRoleCreate,
  SettingsRoleResponse,
  SettingsRoleUpdate,
  SettingsUserCreate,
  SettingsUserUpdate,
  StaffInviteCreateResponse,
  StaffInviteRowResponse,
  TenantInventoryPatch,
  TenantOverviewReport,
  TenantResponse,
  TenantType,
  UserWithRoleResponse,
} from "@/api/models";

export const platformApi = {
  async register(data: {
    tenant_id: number;
    email: string;
    username?: string | null;
    password: string;
    first_name?: string;
    last_name?: string;
    /** When server sets BOOTSTRAP_REGISTRATION_KEY, first user must supply this (Finding #4). */
    bootstrap_key?: string;
    accepted_legal_terms?: boolean;
    legal_acceptance_version?: string;
  }): Promise<unknown> {
    return request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) });
  },
  async forgotPassword(data: { email: string; company_code: string }): Promise<{ message: string }> {
    return requestPublic<{ message: string }>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim(),
        company_code: data.company_code.trim() || undefined,
      }),
    });
  },
  async resetPassword(data: { token: string; new_password: string }): Promise<{ message: string }> {
    return requestPublic<{ message: string }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: data.token.trim(), new_password: data.new_password }),
    });
  },
  async platformAdminLogin(data: { username: string; password: string }): Promise<PlatformAdminTokenResponse> {
    return requestPlatformAdmin<PlatformAdminTokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: data.username.trim(),
        password: data.password,
      }),
    });
  },
  async platformAdminBulkCreateTenants(
    adminToken: string,
    body: PlatformAdminTenantBulkCreateBody,
  ): Promise<PlatformAdminTenantBulkCreateResponse> {
    return requestPlatformAdmin<PlatformAdminTenantBulkCreateResponse>("/tenants/bulk", {
      method: "POST",
      adminToken,
      body: JSON.stringify(body),
    });
  },
  async createTenant(data: {
    name: string;
    tenant_type: TenantType;
    phone?: string | null;
    address?: string | null;
  }): Promise<TenantResponse> {
    return request<TenantResponse>("/api/v1/tenants", { method: "POST", body: JSON.stringify(data) });
  },
  async getTenantMe(): Promise<TenantResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<TenantResponse>("/api/v1/tenants/me", { tenantId: Number(tid) });
  },
  async patchTenantInventory(data: TenantInventoryPatch): Promise<TenantResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<TenantResponse>("/api/v1/tenants/me/inventory", {
      method: "PATCH",
      body: JSON.stringify(data),
      tenantId: Number(tid),
    });
  },
  async listUsers(): Promise<UserWithRoleResponse[]> {
    return request<UserWithRoleResponse[]>("/api/v1/users");
  },
  async settingsListUsers(): Promise<UserWithRoleResponse[]> {
    return request<UserWithRoleResponse[]>("/api/v1/settings/users");
  },
  async settingsCreateUser(data: SettingsUserCreate): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>("/api/v1/settings/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settingsUpdateUser(userId: number, data: SettingsUserUpdate): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>(`/api/v1/settings/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async settingsActivateUser(userId: number): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>(`/api/v1/settings/users/${userId}/activate`, {
      method: "POST",
    });
  },
  async settingsDeactivateUser(userId: number): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>(`/api/v1/settings/users/${userId}/deactivate`, {
      method: "POST",
    });
  },
  async settingsDeleteUser(userId: number): Promise<void> {
    return request<void>(`/api/v1/settings/users/${userId}`, {
      method: "DELETE",
    });
  },
  async settingsInviteStaff(data: {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    role_id: number;
  }): Promise<StaffInviteCreateResponse> {
    return request<StaffInviteCreateResponse>("/api/v1/settings/users/invite", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim(),
        first_name: data.first_name?.trim() || undefined,
        last_name: data.last_name?.trim() || undefined,
        role_id: data.role_id,
      }),
    });
  },
  async settingsListStaffInvitations(): Promise<StaffInviteRowResponse[]> {
    return request<StaffInviteRowResponse[]>("/api/v1/settings/users/invitations");
  },
  async settingsCancelStaffInvitation(invitationId: number): Promise<void> {
    return request<void>(`/api/v1/settings/users/invitations/${invitationId}`, { method: "DELETE" });
  },
  async settingsGetPermissionsRegistry(): Promise<PermissionsRegistryResponse> {
    return request<PermissionsRegistryResponse>("/api/v1/settings/permissions-registry");
  },
  async listRoles(): Promise<RoleResponse[]> {
    return request<RoleResponse[]>("/api/v1/roles");
  },
  async settingsListRoles(): Promise<SettingsRoleResponse[]> {
    return request<SettingsRoleResponse[]>("/api/v1/settings/roles");
  },
  async settingsCreateRole(data: SettingsRoleCreate): Promise<SettingsRoleResponse> {
    return request<SettingsRoleResponse>("/api/v1/settings/roles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settingsUpdateRole(roleId: number, data: SettingsRoleUpdate): Promise<SettingsRoleResponse> {
    return request<SettingsRoleResponse>(`/api/v1/settings/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async settingsDeleteRole(roleId: number): Promise<void> {
    return request<void>(`/api/v1/settings/roles/${roleId}`, {
      method: "DELETE",
    });
  },
  async settingsListAuditLogs(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    resource?: string;
    user_id?: number;
    search?: string;
    created_from?: string;
    created_to?: string;
  }): Promise<SettingsAuditLogListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.action) q.set("action", params.action);
    if (params?.resource) q.set("resource", params.resource);
    if (params?.user_id != null) q.set("user_id", String(params.user_id));
    if (params?.search) q.set("search", params.search);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<SettingsAuditLogListResponse>(`/api/v1/settings/audit${suffix}`);
  },
  async listAuditLogs(params?: { limit?: number; offset?: number }): Promise<AuditLogResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AuditLogResponse[]>(`/api/v1/audit${suffix}`);
  },
  // Settings module
  async getSettingsConfig(): Promise<SettingsConfigResponse> {
    return request<SettingsConfigResponse>("/api/v1/settings/config");
  },
  async createLemonSqueezyCheckout(body: { variant_id: string; email?: string | null }): Promise<LemonSqueezyCheckoutResponse> {
    return request<LemonSqueezyCheckoutResponse>("/api/v1/billing/lemonsqueezy/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateSettingsConfig(data: SettingsConfigUpdate): Promise<SettingsConfigResponse> {
    return request<SettingsConfigResponse>("/api/v1/settings/config", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async resetPhase1Demo(): Promise<{
    ok: boolean;
    status?: string;
    order_code?: string;
    narrative?: string;
    credentials?: Record<string, string>;
    summary?: Record<string, unknown>;
    counts?: Record<string, number>;
  }> {
    return request("/api/v1/settings/demo/reset", { method: "POST", body: JSON.stringify({}) });
  },
  async getSettingsPricing(): Promise<SettingsPricingResponse> {
    return request<SettingsPricingResponse>("/api/v1/settings/pricing");
  },
  async getSettingsChequeTemplates(): Promise<SettingsChequeTemplatesListResponse> {
    return request<SettingsChequeTemplatesListResponse>("/api/v1/settings/cheque-templates");
  },
  async getBackupStatus(): Promise<BackupStatusResponse> {
    return request<BackupStatusResponse>("/api/v1/settings/backup/status");
  },
  async triggerBackup(): Promise<BackupStatusResponse> {
    return request<BackupStatusResponse>("/api/v1/settings/backup/trigger", {
      method: "POST",
    });
  },
  async listBackupHistory(params?: { limit?: number }): Promise<BackupHistoryRow[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BackupHistoryRow[]>(`/api/v1/settings/backup/history${suffix}`);
  },
  async triggerBackupRestore(backupLogId: number): Promise<BackupStatusResponse> {
    return request<BackupStatusResponse>(`/api/v1/settings/backup/restore/${backupLogId}`, {
      method: "POST",
    });
  },
  async listDataMigrationTemplates(): Promise<DataMigrationTemplatesResponse> {
    return request<DataMigrationTemplatesResponse>("/api/v1/data-migration/templates");
  },
  async importDataMigrationCsv(params: {
    entity_type: string;
    dry_run: boolean;
    file: File;
  }): Promise<DataMigrationImportResponse> {
    const form = new FormData();
    form.append("entity_type", params.entity_type);
    form.append("dry_run", params.dry_run ? "true" : "false");
    form.append("file", params.file);
    return request<DataMigrationImportResponse>("/api/v1/data-migration/import", {
      method: "POST",
      body: form,
    });
  },
  async getExternalAccessOverview(): Promise<ExternalAccessOverview> {
    return request<ExternalAccessOverview>("/api/v1/settings/external-access/overview");
  },
  async patchExternalAccessFeatureFlags(body: ExternalFeatureFlagsPatch): Promise<ExternalAccessOverview> {
    return request<ExternalAccessOverview>("/api/v1/settings/external-access/feature-flags", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listExternalCustomerPrincipals(params?: { limit?: number; offset?: number }): Promise<ExternalPrincipalListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const s = q.toString() ? `?${q.toString()}` : "";
    return request<ExternalPrincipalListResponse>(`/api/v1/settings/external-access/customers${s}`);
  },
  async listExternalFinancierPrincipals(params?: { limit?: number; offset?: number }): Promise<ExternalPrincipalListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const s = q.toString() ? `?${q.toString()}` : "";
    return request<ExternalPrincipalListResponse>(`/api/v1/settings/external-access/financiers${s}`);
  },
  async inviteExternalCustomer(body: {
    email: string;
    full_name: string;
    role_codes: string[];
    customer_ids: number[];
  }): Promise<ExternalInviteResponse> {
    return request<ExternalInviteResponse>("/api/v1/settings/external-access/customers/invite", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inviteExternalFinancier(body: {
    email: string;
    full_name: string;
    role_codes: string[];
    access_scope?: string;
    financier_party_id?: number | null;
  }): Promise<ExternalInviteResponse> {
    return request<ExternalInviteResponse>("/api/v1/settings/external-access/financiers/invite", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async patchExternalFinancierPrincipal(
    principalId: number,
    body: {
      access_scope?: string | null;
      financier_party_id?: number | null;
    },
  ): Promise<ExternalPrincipalAdminRow> {
    return request<ExternalPrincipalAdminRow>(`/api/v1/settings/external-access/financiers/${principalId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listExternalSupplierPrincipals(): Promise<ExternalPrincipalListResponse> {
    return request<ExternalPrincipalListResponse>("/api/v1/settings/external-access/suppliers?limit=200");
  },
  async inviteExternalSupplier(body: { email: string; full_name: string; vendor_ids: number[] }): Promise<ExternalInviteResponse> {
    return request<ExternalInviteResponse>("/api/v1/settings/external-access/suppliers/invite", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async patchExternalSupplierPrincipal(principalId: number, body: { vendor_ids: number[] }): Promise<ExternalPrincipalAdminRow> {
    return request<ExternalPrincipalAdminRow>(`/api/v1/settings/external-access/suppliers/${principalId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listExternalAccessAudit(params?: { limit?: number; offset?: number }): Promise<ExternalAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const s = q.toString() ? `?${q.toString()}` : "";
    return request<ExternalAuditListResponse>(`/api/v1/settings/external-access/audit${s}`);
  },
  async deactivateExternalPrincipal(principalId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/v1/settings/external-access/principals/${principalId}/deactivate`, {
      method: "POST",
    });
  },
  async reactivateExternalPrincipal(principalId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/v1/settings/external-access/principals/${principalId}/reactivate`, {
      method: "POST",
    });
  },
  async listPlatformSupportTickets(params?: {
    page?: number;
    page_size?: number;
    status?: string;
  }): Promise<{ items: PlatformSupportTicketItem[]; total: number; page: number; page_size: number }> {
    const q = new URLSearchParams();
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/support/tickets${suffix}`);
  },
  async getPlatformSupportTicket(id: number): Promise<PlatformSupportTicketDetail> {
    return request(`/api/v1/support/tickets/${id}`);
  },
  async createPlatformSupportTicket(data: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
  }): Promise<{ id: number }> {
    return request("/api/v1/support/tickets", { method: "POST", body: JSON.stringify(data) });
  },
  async replyPlatformSupportTicket(id: number, content: string): Promise<{ id: number }> {
    return request(`/api/v1/support/tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  /** Dashboard-shaped owner cost alerts (wraps the same variance scan). */
  async getDashboardPendingPriceVerifications(params?: {
    limit?: number;
  }): Promise<DashboardPendingPriceVerificationsResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DashboardPendingPriceVerificationsResponse>(
      `/api/v1/dashboard/pending-price-verifications${suffix}`,
    );
  },
  async getOnboardingChecklist(): Promise<OnboardingChecklist> {
    return request<OnboardingChecklist>("/api/v1/onboarding/checklist");
  },
  async listNotifications(params?: { limit?: number; unread_only?: boolean }): Promise<NotificationList> {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.unread_only) q.set("unread_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<NotificationList>(`/api/v1/notifications${suffix}`);
  },
  async markNotificationRead(id: number): Promise<void> {
    return request<void>(`/api/v1/notifications/${id}/read`, { method: "POST" });
  },
  async markAllNotificationsRead(): Promise<void> {
    return request<void>("/api/v1/notifications/read-all", { method: "POST" });
  },
  async globalSearch(q: string, limit = 5): Promise<GlobalSearchResponse> {
    return request<GlobalSearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  },
  async listSavedViews(tableKey: string): Promise<SavedView[]> {
    return request<SavedView[]>(`/api/v1/saved-views?table_key=${encodeURIComponent(tableKey)}`);
  },
  async createSavedView(body: {
    table_key: string;
    name: string;
    config: SavedViewConfig;
    is_shared?: boolean;
  }): Promise<SavedView> {
    return request<SavedView>("/api/v1/saved-views", { method: "POST", body: JSON.stringify(body) });
  },
  async updateSavedView(
    id: number,
    body: { name?: string; config?: SavedViewConfig; is_shared?: boolean },
  ): Promise<SavedView> {
    return request<SavedView>(`/api/v1/saved-views/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async deleteSavedView(id: number): Promise<void> {
    return request<void>(`/api/v1/saved-views/${id}`, { method: "DELETE" });
  },
  async getDashboardKpis(): Promise<DashboardKpi[]> {
    return request<DashboardKpi[]>("/api/v1/dashboard/kpi");
  },
  async getDashboardOrderStatus(): Promise<OrderStatusSummary[]> {
    return request<OrderStatusSummary[]>("/api/v1/dashboard/order-status-breakdown");
  },
  async getDashboardCustomerMap(): Promise<CustomerMapPoint[]> {
    return request<CustomerMapPoint[]>("/api/v1/dashboard/customer-map");
  },
  async getDashboardInsights(options?: { refresh?: boolean }): Promise<DashboardInsight[]> {
    const qs = options?.refresh ? "?refresh=true" : "";
    return request<DashboardInsight[]>(`/api/v1/dashboard/ai-insights${qs}`);
  },
  async getDashboardAiBrief(): Promise<AiDashboardBriefResponse> {
    return request<AiDashboardBriefResponse>("/api/v1/dashboard/ai-brief");
  },
  async getDashboardAiProfitability(): Promise<AiProfitabilityResponse> {
    return request<AiProfitabilityResponse>("/api/v1/dashboard/ai-profitability");
  },
  async getDashboardAttentionSummary(): Promise<DashboardAttentionSummary> {
    return request<DashboardAttentionSummary>("/api/v1/dashboard/attention-summary");
  },
  async getDashboardProductionTrends(params?: {
    from_date?: string;
    to_date?: string;
  }): Promise<DashboardProductionPoint[]> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DashboardProductionPoint[]>(`/api/v1/dashboard/production-trends${suffix}`);
  },
  async getDashboardRecentOrders(): Promise<DashboardRecentOrder[]> {
    return request<DashboardRecentOrder[]>("/api/v1/dashboard/recent-orders");
  },
  async getDashboardTasks(): Promise<DashboardTask[]> {
    return request<DashboardTask[]>("/api/v1/dashboard/tasks");
  },
  async getDashboardEmployeeSummary(): Promise<DashboardEmployeeSummary> {
    return request<DashboardEmployeeSummary>("/api/v1/dashboard/employee-summary");
  },
  async getDashboardPayrollSummary(): Promise<DashboardPayrollRow[]> {
    return request<DashboardPayrollRow[]>("/api/v1/dashboard/payroll-summary");
  },
  async getDashboardRevenueTrend(params?: {
    from_date?: string;
    to_date?: string;
  }): Promise<DashboardRevenueTrend> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DashboardRevenueTrend>(`/api/v1/dashboard/revenue-trend${suffix}`);
  },
  /** Phase 18 — read-only executive brief (requires EXECUTIVE_AI_DASHBOARD_ENABLED + tenant flag). */
  async getExecutiveAiBrief(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/dashboard/ai/executive-brief");
  },
  async getTenantOverview(): Promise<TenantOverviewReport> {
    return request<TenantOverviewReport>("/api/v1/reports/tenant-overview");
  },
  async getCustomerPerformance(): Promise<CustomerPerformanceRow[]> {
    return request<CustomerPerformanceRow[]>("/api/v1/reports/customer-performance");
  },
  async getReportPurchaseOrders(params?: { status?: string; limit?: number; offset?: number }): Promise<ReportPurchaseOrderRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReportPurchaseOrderRow[]>(`/api/v1/reports/purchase-orders${suffix}`);
  },
  async getReportGrn(params?: { status?: string; limit?: number; offset?: number }): Promise<ReportGrnRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReportGrnRow[]>(`/api/v1/reports/grn${suffix}`);
  },
  async getReportSalesOrders(params?: { status?: string; limit?: number; offset?: number }): Promise<ReportSalesOrderRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReportSalesOrderRow[]>(`/api/v1/reports/sales-orders${suffix}`);
  },
  async getMySignature(): Promise<MySignature> {
    return request<MySignature>("/api/v1/me/signature");
  },
  async updateMySignature(body: { designation: string | null }): Promise<MySignature> {
    return request<MySignature>("/api/v1/me/signature", { method: "PUT", body: JSON.stringify(body) });
  },
  async uploadMySignatureImage(file: File): Promise<MySignature> {
    const form = new FormData();
    form.append("file", file);
    return request<MySignature>("/api/v1/me/signature/image", { method: "POST", body: form });
  },
  async deleteMySignatureImage(): Promise<MySignature> {
    return request<MySignature>("/api/v1/me/signature/image", { method: "DELETE" });
  },
  /** GET a tenant file by API path (e.g. /api/v1/files/customer_logos/xxx.png) with JWT + X-Tenant-Id. */
  async fetchSecureFileBlob(apiPath: string): Promise<Blob> {
    const p = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    return requestBlob(p, { method: "GET" });
  },
};
