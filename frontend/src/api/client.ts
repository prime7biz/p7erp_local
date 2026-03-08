const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export type TenantType = "manufacturer" | "buying_house" | "both";

export interface MeResponse {
  user_id: number;
  tenant_id: number;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  tenant_name: string;
  tenant_type: TenantType;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  tenant_id?: number; // Set by backend when logging in so we can set X-Tenant-Id
}

export interface TenantResponse {
  id: number;
  name: string;
  domain: string | null;
  tenant_type: TenantType;
  company_code: string | null;
  is_active: boolean;
}

function getToken(): string | null {
  return localStorage.getItem("p7_token");
}

function getTenantId(): string | null {
  return localStorage.getItem("p7_tenant_id");
}

export function setAuth(token: string, tenantId: number): void {
  localStorage.setItem("p7_token", token);
  localStorage.setItem("p7_tenant_id", String(tenantId));
}

export function clearAuth(): void {
  localStorage.removeItem("p7_token");
  localStorage.removeItem("p7_tenant_id");
}

async function request<T>(
  path: string,
  options: RequestInit & { tenantId?: number | null } = {}
): Promise<T> {
  const { tenantId, ...init } = options;
  const tid = tenantId ?? getTenantId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (tid) headers["X-Tenant-Id"] = String(tid);
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: string | { msg?: string }[]; message?: string };
    const d = raw.detail;
    const message = typeof d === "string" ? d : Array.isArray(d) && d[0]?.msg ? d[0].msg : raw.message ?? "Request failed";
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** Reference-style: companyCode + username + password. Or tenant_id + email + password. */
  async login(params: {
    company_code?: string;
    tenant_id?: number;
    username?: string;
    email?: string;
    password: string;
  }): Promise<TokenResponse> {
    const { company_code, tenant_id, username, email, password } = params;
    // Send only non-empty fields so backend accepts company_code + username + password (no 422)
    const body: Record<string, unknown> = { password };
    if (company_code?.trim()) body.company_code = company_code.trim();
    if (tenant_id != null && Number.isFinite(tenant_id)) body.tenant_id = tenant_id;
    if (username?.trim()) body.username = username.trim();
    if (email?.trim()) body.email = email.trim();
    const res = await request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      tenantId: tenant_id ?? undefined,
    });
    return res;
  },
  async me(): Promise<MeResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<MeResponse>("/api/v1/auth/me", { tenantId: Number(tid) });
  },
  async register(data: {
    tenant_id: number;
    email: string;
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }): Promise<unknown> {
    return request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) });
  },
  async createTenant(data: {
    name: string;
    tenant_type: TenantType;
  }): Promise<TenantResponse> {
    return request<TenantResponse>("/api/v1/tenants", { method: "POST", body: JSON.stringify(data) });
  },
  async getTenantMe(): Promise<TenantResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<TenantResponse>("/api/v1/tenants/me", { tenantId: Number(tid) });
  },
  async listUsers(): Promise<UserWithRoleResponse[]> {
    return request<UserWithRoleResponse[]>("/api/v1/users");
  },
  async listRoles(): Promise<RoleResponse[]> {
    return request<RoleResponse[]>("/api/v1/roles");
  },
  async listAuditLogs(params?: { limit?: number; offset?: number }): Promise<AuditLogResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AuditLogResponse[]>(`/api/v1/audit${suffix}`);
  },
  async listCustomers(): Promise<CustomerResponse[]> {
    return request<CustomerResponse[]>("/api/v1/customers");
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
};

export interface UserWithRoleResponse {
  id: number;
  tenant_id: number;
  role_id: number;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  role_name: string;
}

export interface RoleResponse {
  id: number;
  tenant_id: number | null;
  name: string;
  display_name: string;
}

export interface AuditLogResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  action: string;
  resource: string | null;
  details: string | null;
  created_at: string;
}

export interface CustomerResponse {
  id: number;
  tenant_id: number;
  customer_code: string;
  name: string;
  address: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreate {
  name: string;
  address?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface CustomerUpdate {
  name?: string;
  address?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
}
