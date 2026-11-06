/**
 * Sign-in related API calls used by the app shell (AuthContext, login pages).
 * Also merged into `api` in `api/client.ts`, so `api.me()` / `api.login()` still work.
 */
import { request, requestPublic, getTenantId } from "@/api/core";
import type { MeResponse, ResolveTenantResponse, TokenResponse } from "@/api/models";

export const authApi = {
  /** Reference-style: companyCode + username + password. Or tenant_id + email + password. */
  async login(params: {
    company_code?: string;
    tenant_id?: number;
    username?: string;
    email?: string;
    login_as?: string;
    password: string;
  }): Promise<TokenResponse> {
    const { company_code, tenant_id, username, email, login_as, password } = params;
    // Send only non-empty fields so backend accepts company_code + username + password (no 422)
    const body: Record<string, unknown> = { password };
    if (company_code?.trim()) body.company_code = company_code.trim();
    if (tenant_id != null && Number.isFinite(tenant_id)) body.tenant_id = tenant_id;
    if (username?.trim()) body.username = username.trim();
    if (email?.trim()) body.email = email.trim();
    if (login_as?.trim()) body.login_as = login_as.trim().toLowerCase();
    const res = await request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      tenantId: tenant_id ?? undefined,
      /** Avoid sending a previous session's X-Tenant-Id while switching company codes. */
      omitTenantHeader: true,
    });
    return res;
  },
  async resolveTenant(company_code: string): Promise<ResolveTenantResponse> {
    return requestPublic<ResolveTenantResponse>("/api/v1/auth/resolve-tenant", {
      method: "POST",
      body: JSON.stringify({ company_code: company_code.trim() }),
    });
  },
  async acceptStaffInvite(data: {
    token: string;
    password: string;
    first_name?: string | null;
    last_name?: string | null;
  }): Promise<TokenResponse> {
    return requestPublic<TokenResponse>("/api/v1/auth/accept-staff-invite", {
      method: "POST",
      body: JSON.stringify({
        token: data.token.trim(),
        password: data.password,
        first_name: data.first_name?.trim() || undefined,
        last_name: data.last_name?.trim() || undefined,
      }),
    });
  },
  async me(): Promise<MeResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<MeResponse>("/api/v1/auth/me", { tenantId: Number(tid) });
  },
};
