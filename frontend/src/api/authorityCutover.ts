/**
 * Phase 7 authority cutover (user_authority_classes_v1).
 * Merged into `api` in `api/client.ts`.
 */
import { request } from "@/api/core";

export type AuthorityCutoverProposal = {
  id?: number;
  user_id: number;
  username?: string | null;
  original_role_id?: number;
  original_role_name?: string | null;
  original_authority_class?: string | null;
  original_is_tenant_super_admin?: boolean;
  original_module_grants?: string[];
  proposed_authority_class?: string | null;
  proposed_is_tenant_super_admin?: boolean;
  proposed_module_grants?: string[];
  status: string;
  reason?: string | null;
  applied_at?: string | null;
  restored_at?: string | null;
};

export type AuthorityCutoverDryRunResult = {
  tenant_id: number;
  earliest_admin_user_id: number | null;
  unresolved_count: number;
  blocked: boolean;
  proposals: AuthorityCutoverProposal[];
};

export type AuthorityCutoverApplyResult = {
  tenant_id: number;
  applied: number;
  skipped: number;
};

export type AuthorityCutoverRestoreResult = {
  tenant_id: number;
  restored: number;
};

export const authorityCutoverApi = {
  async authorityCutoverDryRun(): Promise<AuthorityCutoverDryRunResult> {
    return request<AuthorityCutoverDryRunResult>("/api/v1/settings/authority-cutover/dry-run", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async authorityCutoverApply(body?: {
    confirm_user_ids?: number[] | null;
  }): Promise<AuthorityCutoverApplyResult> {
    return request<AuthorityCutoverApplyResult>("/api/v1/settings/authority-cutover/apply", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async authorityCutoverRestore(): Promise<AuthorityCutoverRestoreResult> {
    return request<AuthorityCutoverRestoreResult>("/api/v1/settings/authority-cutover/restore", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
