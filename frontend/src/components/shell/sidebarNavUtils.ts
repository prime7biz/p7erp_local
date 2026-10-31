import type { TenantType } from "@/api/client";
import type { TenantTypeFilter } from "@/app/sidebarConfig";

/** Section is visible for this tenant type (both sees everything). */
export function isVisible(tenantType: TenantType, filter?: TenantTypeFilter[]): boolean {
  if (!filter || filter.length === 0) return true;
  if (tenantType === "both") return true;
  return filter.includes(tenantType);
}

export function getNameInitial(name?: string | null) {
  if (!name) return "U";
  return name.trim().charAt(0).toUpperCase();
}

/** Map sidebar section titles to optional RBAC permission keys. */
export function sectionPermissionKey(section: string): string | null {
  if (section === "Merchandising") return "merch.access";
  if (section === "Export & Import") return "merch.access";
  if (section === "Inventory") return "inventory.access";
  if (section === "Manufacturing") return "production.access";
  if (section === "AI Tools") return "ai.access";
  if (section === "HR") return "hr.access";
  if (section === "Finance") return "finance.access";
  if (section === "Reports") return "reports.access";
  if (section === "Settings") return "settings.access";
  return null;
}
