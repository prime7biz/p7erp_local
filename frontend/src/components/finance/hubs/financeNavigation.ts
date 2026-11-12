/**
 * Finance hub navigation helpers: sidebar links, Ctrl+K rows and the Help lookup.
 * Kept free of React so the sidebar, palette and mobile menu can share it.
 */
import type { MenuSection, NavItem } from "@/app/sidebarConfig";
import { hubHref, hubTabPaletteRoutes, resolveHubHelpPath } from "@/components/app/hubs/hubNavigation";
import { isHubVisible } from "@/components/app/hubs/hubVisibility";
import type { Hub, HubAccessCheck, HubFeatureFlags } from "@/components/app/hubs/types";
import { FINANCE_HUBS } from "./financeHubs";

const hubs: readonly Hub[] = FINANCE_HUBS;

/** Sidebar links: one per hub the user may see. Route guards stay authoritative. */
export function financeHubNavItems(featureFlags: HubFeatureFlags, canAccess?: HubAccessCheck): NavItem[] {
  return hubs
    .filter((hub) => isHubVisible(hub, featureFlags, canAccess))
    .map((hub) => ({ icon: hub.icon, label: hub.label, href: hubHref(hub) }));
}

/**
 * The Finance sidebar section with `finance_hubs_v2` on: the same section with only the hub links.
 * Returns null when the user may see no hub.
 */
export function buildFinanceHubSection(
  original: MenuSection,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
): MenuSection | null {
  const items = financeHubNavItems(featureFlags, canAccess);
  if (items.length === 0) return null;
  return { ...original, items, subsections: undefined };
}

/** Ctrl+K and mobile search rows: every visible Finance tab. */
export function financeTabPaletteRoutes(featureFlags: HubFeatureFlags, canAccess?: HubAccessCheck) {
  return hubTabPaletteRoutes(hubs, "Finance", featureFlags, canAccess);
}

/** Help on a Finance hub uses the open tab's old route (where the tutorials point). */
export function resolveFinanceHelpPath(
  pathname: string,
  search: string,
  featureFlags?: HubFeatureFlags,
  canAccess?: HubAccessCheck,
): string {
  return resolveHubHelpPath(hubs, pathname, search, featureFlags, canAccess);
}
