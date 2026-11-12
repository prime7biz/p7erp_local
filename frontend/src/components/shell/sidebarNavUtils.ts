import type { MeResponse, TenantType } from "@/api/client";
import { isNavItemVisibleForTenant, type MenuSection, type TenantTypeFilter } from "@/app/sidebarConfig";
import { getRbacMode } from "@/components/auth/rbacMode";
import { isFinanceHubsV2Enabled } from "@/components/finance/hubs/financeHubs";
import { buildFinanceHubSection } from "@/components/finance/hubs/financeNavigation";

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

export type MenuVisibilityContext = {
  tenantType: TenantType;
  enabledOptionalProductionUnits: string[];
  featureFlags?: MeResponse["feature_flags"];
  hasPermission: (key: string) => boolean;
};

/**
 * True when a permission key may be shown in the menu. Keys are only checked while
 * `rbac_enforcement` is "enforce", the same rule the desktop sidebar has always used.
 */
export function isMenuPermissionAllowed(
  permissionKey: string | null | undefined,
  featureFlags: MeResponse["feature_flags"] | undefined,
  hasPermission: (key: string) => boolean,
): boolean {
  if (!permissionKey) return true;
  if (getRbacMode(featureFlags) !== "enforce") return true;
  return hasPermission(permissionKey);
}

/**
 * Sections and items the user may see. Shared by the desktop sidebar and the mobile
 * "More" drawer so both menus always list the same pages.
 */
export function filterVisibleMenuSections(sections: MenuSection[], ctx: MenuVisibilityContext): MenuSection[] {
  const { tenantType, enabledOptionalProductionUnits, featureFlags, hasPermission } = ctx;
  // finance_hubs_v2 ON: the Finance section is replaced by the hub links, each filtered by its own
  // permission (finance.access or facility.access), so the section-level check is skipped for it.
  const financeHubsOn = isFinanceHubsV2Enabled(featureFlags);
  const canAccess = (key: string) => isMenuPermissionAllowed(key, featureFlags, hasPermission);
  const base = financeHubsOn
    ? sections.flatMap((s) => {
        if (s.section !== "Finance") return [s];
        const hubSection = buildFinanceHubSection(s, featureFlags, canAccess);
        return hubSection ? [hubSection] : [];
      })
    : sections;
  return base
    .filter((s) => isVisible(tenantType, s.visibleFor))
    .filter(
      (s) =>
        (financeHubsOn && s.section === "Finance") ||
        isMenuPermissionAllowed(sectionPermissionKey(s.section), featureFlags, hasPermission),
    )
    .map((s) => {
      if (s.subsections && s.subsections.length > 0) {
        const subsections = s.subsections
          .map((sub) => ({
            ...sub,
            items: sub.items.filter((i) =>
              isNavItemVisibleForTenant(i, tenantType, enabledOptionalProductionUnits, featureFlags),
            ),
          }))
          .filter((sub) => sub.items.length > 0);
        return { ...s, items: [], subsections };
      }
      return {
        ...s,
        items: s.items.filter((i) =>
          isNavItemVisibleForTenant(i, tenantType, enabledOptionalProductionUnits, featureFlags),
        ),
        subsections: undefined,
      };
    })
    .filter((s) => {
      if (s.directLink) return true;
      if (s.subsections && s.subsections.length > 0) return s.subsections.some((sub) => sub.items.length > 0);
      return s.items.length > 0;
    });
}
