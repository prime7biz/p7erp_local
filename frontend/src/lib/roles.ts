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

/** Client-side HR Excel export follows the server export rule (`_require_manager_or_admin` in hr/router.py). */
export function canExportHrData(roleName: string | null | undefined): boolean {
  const role = (roleName || "").trim().toLowerCase();
  return ["admin", "owner", "manager", "super_admin", "superadmin"].includes(role);
}
