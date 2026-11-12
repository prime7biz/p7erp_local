import type { Hub, HubAccessCheck, HubFeatureFlags, HubTab } from "./types";

/**
 * Tab filter used by the hub page, the sidebar, the command palette and Help.
 * - `requiresFeatureFlag`: strict, the flag must be exactly `true`.
 * - `hideWhenFeatureFlagFalse`: default-on flag, hidden only when exactly `false`.
 * - `permissionKey`: navigation only (the route and API guards stay authoritative).
 */
export function isHubTabVisible(tab: HubTab, featureFlags: HubFeatureFlags, canAccess?: HubAccessCheck): boolean {
  if (tab.standalone) return false;
  if (tab.requiresFeatureFlag && featureFlags?.[tab.requiresFeatureFlag] !== true) return false;
  if (tab.hideWhenFeatureFlagFalse && featureFlags?.[tab.hideWhenFeatureFlagFalse] === false) return false;
  if (tab.permissionKey && canAccess && !canAccess(tab.permissionKey)) return false;
  return true;
}

/** The tab's label for these flags (`labelWhenFlagOn` wins only while its flag is exactly `true`). */
export function hubTabLabel(tab: HubTab, featureFlags: HubFeatureFlags): string {
  return tab.labelWhenFlagOn && featureFlags?.[tab.labelWhenFlagOn.flag] === true ? tab.labelWhenFlagOn.label : tab.label;
}

export function visibleHubTabs(hub: Hub, featureFlags: HubFeatureFlags, canAccess?: HubAccessCheck): HubTab[] {
  return hub.tabs.filter((t) => isHubTabVisible(t, featureFlags, canAccess));
}

/** The hub is allowed for this user and has something to show (or opted in with `showWhenEmpty`). */
export function isHubVisible(hub: Hub, featureFlags: HubFeatureFlags, canAccess?: HubAccessCheck): boolean {
  if (hub.permissionKey && canAccess && !canAccess(hub.permissionKey)) return false;
  return hub.showWhenEmpty === true || visibleHubTabs(hub, featureFlags, canAccess).length > 0;
}

/** The open tab: the requested one if visible, otherwise the first visible tab (never a hidden one). */
export function pickActiveHubTab(
  hub: Hub,
  requestedTabId: string | null,
  featureFlags: HubFeatureFlags,
  canAccess?: HubAccessCheck,
): HubTab | undefined {
  const tabs = visibleHubTabs(hub, featureFlags, canAccess);
  return tabs.find((t) => t.id === requestedTabId) ?? tabs[0];
}
