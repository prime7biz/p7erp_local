/** Pure helpers for the "Statement class" (account groups) and "Stock nature" (stock groups) set-up. */

/** "SUNDRY_DEBTORS" -> "Sundry Debtors", "BANK_OD" -> "Bank OD". */
export function classLabel(value: string | null | undefined): string {
  if (!value) return "Unclassified";
  return value
    .split("_")
    .map((w) => (w === "OD" || w === "COGS" ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

export interface GroupLike {
  id: number;
  parent_group_id?: number | null;
  statement_class?: string | null;
}

export interface EffectiveClass {
  /** The class that applies to the group (own value, else the nearest parent's), or null = Unclassified. */
  effective: string | null;
  /** The group the class comes from (the group itself, or an ancestor); null when Unclassified. */
  sourceId: number | null;
  inherited: boolean;
}

/** Same rule as the backend: an explicit class applies to all descendants unless one overrides it. Cycle-safe. */
export function effectiveStatementClass(groups: readonly GroupLike[], groupId: number): EffectiveClass {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const seen = new Set<number>();
  let current = byId.get(groupId);
  while (current && !seen.has(current.id)) {
    if (current.statement_class) {
      return { effective: current.statement_class, sourceId: current.id, inherited: current.id !== groupId };
    }
    seen.add(current.id);
    current = current.parent_group_id != null ? byId.get(current.parent_group_id) : undefined;
  }
  return { effective: null, sourceId: null, inherited: false };
}

/** Roles that may change a classification (same list as the backend gate). The server stays the authority. */
const MANAGER_ROLES = new Set(["admin", "manager", "super_admin", "superadmin", "owner"]);

export function canEditClassification(roleName: string | null | undefined): boolean {
  return MANAGER_ROLES.has((roleName ?? "").trim().toLowerCase());
}
