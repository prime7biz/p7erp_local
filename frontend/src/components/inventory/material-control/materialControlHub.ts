/**
 * Material Control hub (tenant flag `material_control_hub_v1`, default OFF).
 * Overview + flag-gated plan/ops tabs for phases 2B–7.
 */
import { Boxes } from "lucide-react";
import type { Hub } from "@/components/app/hubs/types";

export const MATERIAL_CONTROL_HUB_FLAG = "material_control_hub_v1";

type FeatureFlags = Record<string, boolean | string | number | null> | null | undefined;

/** True only for an explicit `true` (default OFF). */
export function isMaterialControlHubEnabled(featureFlags: FeatureFlags): boolean {
  return featureFlags?.[MATERIAL_CONTROL_HUB_FLAG] === true;
}

const pages = {
  actions: () =>
    import("@/pages/app/inventory/material-control/ActionQueuePage").then((m) => ({
      default: m.ActionQueuePage,
    })),
  styleSheet: () =>
    import("@/pages/app/inventory/material-control/StyleControlSheetPage").then((m) => ({
      default: m.StyleControlSheetPage,
    })),
  byOrder: () =>
    import("@/pages/app/inventory/material-control/ByOrderPage").then((m) => ({
      default: m.ByOrderPage,
    })),
  genealogy: () =>
    import("@/pages/app/inventory/material-control/GenealogyPage").then((m) => ({
      default: m.GenealogyPage,
    })),
  watchlist: () =>
    import("@/pages/app/inventory/material-control/LeakWatchlistPage").then((m) => ({
      default: m.LeakWatchlistPage,
    })),
  allocate: () =>
    import("@/pages/app/inventory/material-control/AllocatePage").then((m) => ({
      default: m.AllocatePage,
    })),
  leftover: () =>
    import("@/pages/app/inventory/material-control/LeftoverReturnPage").then((m) => ({
      default: m.LeftoverReturnPage,
    })),
  bondClaimRtv: () =>
    import("@/pages/app/inventory/material-control/BondClaimRtvPage").then((m) => ({
      default: m.BondClaimRtvPage,
    })),
  scorecard: () =>
    import("@/pages/app/inventory/material-control/SupplierScorecardPage").then((m) => ({
      default: m.SupplierScorecardPage,
    })),
  rolls: () =>
    import("@/pages/app/inventory/material-control/RollsPage").then((m) => ({
      default: m.RollsPage,
    })),
  landedCost: () =>
    import("@/pages/app/inventory/material-control/LandedCostPage").then((m) => ({
      default: m.LandedCostPage,
    })),
  threeWay: () =>
    import("@/pages/app/inventory/material-control/ThreeWayMatchPage").then((m) => ({
      default: m.ThreeWayMatchPage,
    })),
};

export const MATERIAL_CONTROL_HUB: Hub = {
  id: "material-control",
  path: "inventory/material-control",
  label: "Material Control",
  description: "Style-first view of buy, receive, issue, and lot genealogy",
  icon: Boxes,
  permissionKey: "inventory.access",
  showWhenEmpty: true,
  tabs: [
    {
      id: "actions",
      label: "Today's actions",
      legacyPath: "inventory/material-control/actions",
      load: pages.actions,
    },
    {
      id: "styles",
      label: "Style control sheet",
      legacyPath: "inventory/material-control/styles",
      load: pages.styleSheet,
    },
    {
      id: "orders",
      label: "By order",
      legacyPath: "inventory/material-control/orders",
      load: pages.byOrder,
    },
    {
      id: "genealogy",
      label: "Genealogy",
      legacyPath: "inventory/material-control/genealogy",
      load: pages.genealogy,
    },
    {
      id: "scorecard",
      label: "Supplier scorecard",
      legacyPath: "inventory/material-control/scorecard",
      load: pages.scorecard,
    },
    {
      id: "three-way",
      label: "3-way match",
      legacyPath: "inventory/material-control/three-way",
      load: pages.threeWay,
    },
    {
      id: "allocate",
      label: "Allocate",
      legacyPath: "inventory/material-control/allocate",
      load: pages.allocate,
      requiresFeatureFlag: "material_alloc_ud_v1",
    },
    {
      id: "leftover",
      label: "Leftover return",
      legacyPath: "inventory/material-control/leftover",
      load: pages.leftover,
      requiresFeatureFlag: "material_conversion_v1",
    },
    {
      id: "ops",
      label: "Bond / claim / RTV",
      legacyPath: "inventory/material-control/ops",
      load: pages.bondClaimRtv,
      // Bond/claim need material_physical_v1 (+ inbound_job_work_v1 in the page); RTV needs material_returns_v1.
      requiresAnyFeatureFlag: ["material_physical_v1", "material_returns_v1"],
    },
    {
      id: "watchlist",
      label: "Cost-saving watchlist",
      legacyPath: "inventory/material-control/watchlist",
      load: pages.watchlist,
      requiresFeatureFlag: "material_budget_plan_v1",
    },
    {
      id: "rolls",
      label: "Rolls & shade",
      legacyPath: "inventory/material-control/rolls",
      load: pages.rolls,
      requiresFeatureFlag: "material_budget_plan_v1",
    },
    {
      id: "landed",
      label: "Landed cost",
      legacyPath: "inventory/material-control/landed",
      load: pages.landedCost,
      requiresFeatureFlag: "material_landed_cost_v1",
    },
  ],
};
