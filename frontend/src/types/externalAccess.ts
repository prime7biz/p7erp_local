/** Types for external stakeholder portals (customer / financier). */

export type ExternalPrincipalType = "customer" | "financier";

export interface ExternalTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  tenant_id: number;
  principal_type: ExternalPrincipalType;
}

export interface ExternalMeResponse {
  principal_id: number;
  tenant_id: number;
  tenant_name: string;
  company_code: string | null;
  tenant_address?: string | null;
  tenant_phone?: string | null;
  email: string;
  full_name: string;
  principal_type: ExternalPrincipalType;
  role_codes: string[];
  feature_flags?: Record<string, boolean | string | number | null> | null;
  must_reset_password: boolean;
  /** Highest scope row on ExternalFinancierAccess (financier only). */
  financier_access_scope?: string | null;
}

export interface ExternalAccessOverview {
  customer_portal_enabled: boolean;
  financier_portal_enabled: boolean;
  customer_notes_enabled: boolean;
  financier_financial_summary_enabled: boolean;
  financier_projection_enabled: boolean;
  external_portal_document_downloads_enabled: boolean;
  customer_principal_count: number;
  financier_principal_count: number;
  pending_invitation_count: number;
}

export interface ExternalPrincipalAdminRow {
  id: number;
  email: string;
  full_name: string;
  principal_type: ExternalPrincipalType;
  is_active: boolean;
  locked_at: string | null;
  last_login_at: string | null;
  accepted_at: string | null;
  role_codes: string[];
  customer_ids: number[] | null;
  access_scope: string | null;
  financier_party_id: number | null;
}

export interface ExternalInviteResponse {
  invitation_id: number;
  expires_at: string;
  invite_token?: string | null;
  invite_email_sent?: boolean;
  message?: string;
}

export interface ExternalPrincipalListResponse {
  items: ExternalPrincipalAdminRow[];
  total: number;
}

export interface ExternalFeatureFlagsPatch {
  customer_portal_enabled?: boolean | null;
  financier_portal_enabled?: boolean | null;
  customer_notes_enabled?: boolean | null;
  financier_financial_summary_enabled?: boolean | null;
  financier_projection_enabled?: boolean | null;
  external_portal_document_downloads_enabled?: boolean | null;
}

export interface ExternalAuditRow {
  id: number;
  action: string;
  resource_type: string;
  resource_id: number | null;
  external_principal_id: number | null;
  internal_user_id: number | null;
  created_at: string;
  details_json?: Record<string, unknown> | null;
}

export interface ExternalAuditListResponse {
  items: ExternalAuditRow[];
  total: number;
}
