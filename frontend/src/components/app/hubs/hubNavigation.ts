import type { LucideIcon } from "lucide-react";
import { hubTabLabel, pickActiveHubTab, visibleHubTabs } from "./hubVisibility";
import type { Hub, HubAccessCheck, HubFeatureFlags, HubTab } from "./types";

/** The hub URL under the app root, optionally with `?tab=<tab id>`. */
export function hubHref(hub: Hub, tabId?: string): string {
  return tabId ? `/app/${hub.path}?tab=${encodeURIComponent(tabId)}` : `/app/${hub.path}`;
}

/** Old standalone route (relative to /app) → hub and tab. */
export function findHubLegacyTarget(hubs: readonly Hub[], legacyPath: string): { hub: Hub; tab: HubTab } | null {
  for (const hub of hubs) {
    const tab = hub.tabs.find((t) => t.legacyPath === legacyPath && !t.standalone);
    if (tab) return { hub, tab };
  }
  return null;
}

/**
 * Tutorials list the old page routes. On a hub, use the open tab's old route so the header
 * Help button finds the right articles. Other paths pass through unchanged.
 */
export function resolveHubHelpPath(
  hubs: readonly Hub[],
  pathname: string,
  search: string,
  featureFlags?: HubFeatureFlags,
  canAccess?: HubAccessCheck,
): string {
  const clean = pathname.replace(/\/+$/, "");
  const hub = hubs.find((h) => clean === `/app/${h.path}`);
  if (!hub) return pathname;
  const tab = pickActiveHubTab(hub, new URLSearchParams(search).get("tab"), featureFlags, canAccess);
  return tab ? `/app/${tab.legacyPath}` : pathname;
}

export interface HubPaletteRow {
  href: string;
  label: string;
  section: string;
  icon: LucideIcon;
}

/** Command palette / mobile search rows: every visible tab of every allowed hub. */
export function hubTabPaletteRoutes(
  hubs: readonly Hub[],
  sectionPrefix: string,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
): HubPaletteRow[] {
  return hubs
    .filter((hub) => !hub.permissionKey || !canAccess || canAccess(hub.permissionKey))
    .flatMap((hub) =>
      visibleHubTabs(hub, featureFlags, canAccess).map((tab) => ({
        href: hubHref(hub, tab.id),
        label: hubTabLabel(tab, featureFlags),
        section: `${sectionPrefix} · ${hub.label}`,
        icon: hub.icon,
      })),
    );
}
