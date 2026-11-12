/**
 * Generic "hub" engine: one sidebar link per hub, each hub shows several existing pages as
 * URL tabs (`?tab=`). Finance is the first user (`components/finance/hubs/financeHubs.ts`).
 * HR keeps its own older engine (`components/hr/kit/`) and does not use these types.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type HubFeatureFlags = Record<string, boolean | string | number | null> | null | undefined;
export type HubPageModule = Promise<{ default: ComponentType }>;

/** Returns true when the user may see a navigation entry that needs this permission key. */
export type HubAccessCheck = (permissionKey: string) => boolean;

export interface HubTab {
  id: string;
  label: string;
  /** Old standalone route, relative to /app. */
  legacyPath: string;
  load: () => HubPageModule;
  /** Shown only when `feature_flags[key] === true` (strict, for default-OFF flags). */
  requiresFeatureFlag?: string;
  /** Hidden only when `feature_flags[key] === false` (for default-ON flags such as `mis_reports_enabled`). */
  hideWhenFeatureFlagFalse?: string;
  /** Navigation filter only. Route and API guards stay the real control. */
  permissionKey?: string;
  /** A standalone tab is never embedded in the hub (it keeps its own page). */
  standalone?: boolean;
}

export interface Hub {
  id: string;
  /** Route relative to /app. */
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Navigation filter only. */
  permissionKey?: string;
  /** Keep the hub in menus even when no tab is visible (it shows its own fallback content). */
  showWhenEmpty?: boolean;
  tabs: HubTab[];
}
