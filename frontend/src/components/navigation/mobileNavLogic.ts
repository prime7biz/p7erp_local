import {
  MOBILE_MAX_MODULE_TABS,
  MOBILE_TAB_CANDIDATES,
  mobileHomeTab,
  mobileMoreTab,
  type BottomNavItem,
  type MenuSection,
} from "@/app/sidebarConfig";

/**
 * Sections for the phone / tablet More menu with `mobile_ui_v2` on.
 * Pass the sections already filtered by `filterVisibleMenuSections` (tenant type, feature flags, RBAC);
 * this only drops sections marked `hideInMobileMenu`, it never adds access.
 */
export function mobileMenuSections(visibleSections: MenuSection[]): MenuSection[] {
  return visibleSections.filter((s) => !s.hideInMobileMenu);
}

/**
 * Bottom tabs with `mobile_ui_v2` on: Home, the first three candidates whose section the user can see
 * (Sales, Stock, Finance, Production, HR in that order), then More.
 */
export function pickMobileTabs(visibleSectionNames: ReadonlySet<string>): BottomNavItem[] {
  const modules = MOBILE_TAB_CANDIDATES.filter((tab) => tab.section && visibleSectionNames.has(tab.section)).slice(
    0,
    MOBILE_MAX_MODULE_TABS,
  );
  return [mobileHomeTab, ...modules, mobileMoreTab];
}
