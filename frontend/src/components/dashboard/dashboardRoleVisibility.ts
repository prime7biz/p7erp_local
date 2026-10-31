import type { LucideIcon } from "lucide-react";

/** Role buckets for home dashboard layout (same idea as Control Tower). */
export type DashboardRoleBucket = "elevated" | "merchandiser" | "finance" | "planning" | "other";

/** Ops blocks shown under KPIs in dashboard v3 (order matters). */
export type DashboardOpsBlock = "merch" | "promise" | "control_tower";

export type DashboardDatePreset = "this_week" | "this_month" | "last_90_days";

export type DashboardQuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which role buckets may see this action. Missing = everyone. */
  roles?: DashboardRoleBucket[];
};

export function getDashboardRoleBucket(roleName?: string | null): DashboardRoleBucket {
  const r = (roleName || "").toLowerCase().trim();
  if (["admin", "owner", "manager"].includes(r)) return "elevated";
  if (r.includes("merch")) return "merchandiser";
  if (r.includes("finance") || r === "accountant") return "finance";
  if (["planner", "supervisor", "operator"].includes(r) || r.includes("planner")) return "planning";
  return "other";
}

export type DashboardVisibility = {
  bucket: DashboardRoleBucket;
  /** Merch TNA / alerts / commercial pending strip */
  showMerchHealth: boolean;
  /** ATP/CTP promise risk panel */
  showPromiseRisks: boolean;
  /** Link card to Operations Control Tower */
  showControlTowerLink: boolean;
  /** Global customer map (hidden for finance) */
  showCustomerMap: boolean;
  /** Employee donut (when HR has people) */
  showEmployeeSummary: boolean;
  /** Quoted / revenue trend charts */
  showRevenueTrend: boolean;
  /** Order status pipeline donut */
  showOrderPipeline: boolean;
  /** Role-ordered ops section keys for v3 */
  opsOrder: DashboardOpsBlock[];
};

export function getDashboardVisibility(roleName?: string | null): DashboardVisibility {
  const bucket = getDashboardRoleBucket(roleName);
  const elevated = bucket === "elevated";
  const merch = bucket === "merchandiser";
  const finance = bucket === "finance";
  const planning = bucket === "planning";
  const other = bucket === "other";

  let opsOrder: DashboardOpsBlock[] = ["merch", "promise", "control_tower"];
  if (finance) {
    opsOrder = ["control_tower"];
  } else if (planning) {
    opsOrder = ["promise", "control_tower", "merch"];
  } else if (merch) {
    opsOrder = ["merch", "promise", "control_tower"];
  }

  return {
    bucket,
    showMerchHealth: elevated || merch || planning || other,
    showPromiseRisks: elevated || merch || planning || other,
    showControlTowerLink: elevated || merch || planning || finance,
    showCustomerMap: !finance,
    showEmployeeSummary: elevated || finance || other,
    showRevenueTrend: elevated || finance || other,
    showOrderPipeline: true,
    opsOrder,
  };
}

/** Filter quick actions by the current user's role bucket. */
export function filterQuickActionsByRole(
  actions: DashboardQuickAction[],
  roleName?: string | null,
): DashboardQuickAction[] {
  const bucket = getDashboardRoleBucket(roleName);
  return actions.filter((a) => !a.roles || a.roles.includes(bucket) || bucket === "elevated");
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Resolve a date-range preset to inclusive YYYY-MM-DD bounds (local calendar). */
export function getPresetDateRange(preset: DashboardDatePreset): { from: string; to: string } {
  const now = new Date();
  const to = toLocalIsoDate(now);
  if (preset === "this_week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = start.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - mondayOffset);
    return { from: toLocalIsoDate(start), to };
  }
  if (preset === "this_month") {
    return { from: toLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - 90);
  return { from: toLocalIsoDate(start), to };
}
