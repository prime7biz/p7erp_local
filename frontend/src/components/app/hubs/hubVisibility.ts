import type { Hub, HubAccessCheck, HubFeatureFlags, HubTab } from "./types";

/** Optional extras for navigation filters (authority class report gates, etc.). */
export type HubVisibilityExtras = {
  /** When false, tabs marked `requiresConfidentialReports` are hidden. Undefined = allow. */
  canViewConfidentialReports?: boolean;
};

/**
 * Tab filter used by the hub page, the sidebar, the command palette and Help.
 * - `requiresFeatureFlag`: strict, the flag must be exactly `true`.
 * - `hideWhenFeatureFlagFalse`: default-on flag, hidden only when exactly `false`.
 * - `permissionKey`: navigation only (the route and API guards stay authoritative).
 * - `requiresConfidentialReports`: hide when `extras.canViewConfidentialReports === false`.
 */
export function isHubTabVisible(
  tab: HubTab,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
  extras?: HubVisibilityExtras,
): boolean {
  if (tab.standalone) return false;
  if (tab.requiresFeatureFlag && featureFlags?.[tab.requiresFeatureFlag] !== true) return false;
  if (tab.hideWhenFeatureFlagFalse && featureFlags?.[tab.hideWhenFeatureFlagFalse] === false) return false;
  if (tab.permissionKey && canAccess && !canAccess(tab.permissionKey)) return false;
  if (tab.requiresConfidentialReports && extras?.canViewConfidentialReports === false) return false;
  return true;
}

/** The tab's label for these flags (`labelWhenFlagOn` wins only while its flag is exactly `true`). */
export function hubTabLabel(tab: HubTab, featureFlags: HubFeatureFlags): string {
  return tab.labelWhenFlagOn && featureFlags?.[tab.labelWhenFlagOn.flag] === true ? tab.labelWhenFlagOn.label : tab.label;
}

export function visibleHubTabs(
  hub: Hub,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
  extras?: HubVisibilityExtras,
): HubTab[] {
  return hub.tabs.filter((t) => isHubTabVisible(t, featureFlags, canAccess, extras));
}

/** The hub is allowed for this user and has something to show (or opted in with `showWhenEmpty`). */
export function isHubVisible(
  hub: Hub,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
  extras?: HubVisibilityExtras,
): boolean {
  if (hub.permissionKey && canAccess && !canAccess(hub.permissionKey)) return false;
  return hub.showWhenEmpty === true || visibleHubTabs(hub, featureFlags, canAccess, extras).length > 0;
}

/** The open tab: the requested one if visible, otherwise the first visible tab (never a hidden one). */
export function pickActiveHubTab(
  hub: Hub,
  requestedTabId: string | null,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
  extras?: HubVisibilityExtras,
): HubTab | undefined {
  const tabs = visibleHubTabs(hub, featureFlags, canAccess, extras);
  return tabs.find((t) => t.id === requestedTabId) ?? tabs[0];
}
