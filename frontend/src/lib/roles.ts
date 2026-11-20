/**
 * One place to turn a role name into UI capabilities, so every menu treats roles the same.
 * These only shape navigation; the backend still enforces permissions.
 */
export type RoleBucket = {
  /** admin / owner / manager: sees every create action and setup helpers. */
  isElevated: boolean;
  isFinance: boolean;
  isHr: boolean;
};

export function resolveRole(roleName: string | null | undefined): RoleBucket {
  const role = (roleName || "").trim().toLowerCase();
  return {
    isElevated: role === "admin" || role === "owner" || role === "manager",
    isFinance: role.includes("finance") || role === "accountant",
    isHr: role.includes("hr") || role === "payroll",
  };
}

type HrExportActor = {
  role_name?: string | null;
  authority_classes_enabled?: boolean;
  authority_class?: string | null;
  module_grants?: string[] | null;
  is_tenant_super_admin?: boolean;
  feature_flags?: Record<string, unknown> | null;
};

function hrManagerRole(roleName: string | null | undefined): boolean {
  const role = (roleName || "").trim().toLowerCase();
  return ["admin", "owner", "manager", "super_admin", "superadmin"].includes(role);
}

/**
 * Client-side HR Excel export / manager UI follows the server
 * `is_hr_manager_equivalent` rule (role names, or Class 1 / Super + hr when authority is ON).
 * Pass either a role name string or the `/me` object.
 */
export function canExportHrData(
  roleNameOrMe: string | null | undefined | HrExportActor,
): boolean {
  if (roleNameOrMe && typeof roleNameOrMe === "object") {
    if (hrManagerRole(roleNameOrMe.role_name)) return true;
    const authorityOn =
      roleNameOrMe.authority_classes_enabled === true ||
      roleNameOrMe.feature_flags?.user_authority_classes_v1 === true;
    if (!authorityOn) return false;
    if (roleNameOrMe.is_tenant_super_admin) return true;
    const cls = (roleNameOrMe.authority_class || "").toUpperCase();
    if (cls !== "CLASS_1" && cls !== "SUPER") return false;
    const grants = (roleNameOrMe.module_grants || []).map((m) => m.trim().toLowerCase());
    return grants.includes("hr") || grants.includes("super");
  }
  return hrManagerRole(roleNameOrMe);
}
