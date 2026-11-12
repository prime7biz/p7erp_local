import { useCallback, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { ModuleHubPage } from "@/components/app/hubs/ModuleHubPage";
import { hubHref } from "@/components/app/hubs/hubNavigation";
import { isHubVisible } from "@/components/app/hubs/hubVisibility";
import type { Hub } from "@/components/app/hubs/types";
import { isMenuPermissionAllowed } from "@/components/shell/sidebarNavUtils";
import { useAuth } from "@/context/AuthContext";
import { FINANCE_HUBS, getFinanceHub, isFinanceHubsV2Enabled, type FinanceHubId } from "./financeHubs";

const hubs: readonly Hub[] = FINANCE_HUBS;

const quickActionClass =
  "inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle";

/**
 * Finance Home when the Control Tower tab is not available: a simple grid of cards that open
 * the other hubs the user may see (and a shortcut to Business Overview).
 */
function FinanceHomeLanding({
  featureFlags,
  canAccess,
}: {
  featureFlags: Record<string, boolean | string | number | null> | null | undefined;
  canAccess: (key: string) => boolean;
}) {
  const cards = hubs.filter((h) => h.id !== "home" && isHubVisible(h, featureFlags, canAccess));
  const facilities = hubs.find((h) => h.id === "facilities");
  const showOverview = facilities ? isHubVisible(facilities, featureFlags, canAccess) : false;
  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((hub) => {
          const Icon = hub.icon;
          return (
            <li key={hub.id}>
              <Link
                to={hubHref(hub)}
                className="flex h-full items-start gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm hover:border-border-strong"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">{hub.label}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{hub.description}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {showOverview && facilities ? (
        <p className="text-sm text-text-secondary">
          Shortcut:{" "}
          <Link to={hubHref(facilities, "business-overview")} className="font-medium text-brand-primary hover:underline">
            Business Overview
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/**
 * One Finance hub. With `finance_hubs_v2` OFF the hub routes do not exist for users: they go to
 * the classic Finance pages exactly as before.
 */
export function FinanceHubPage({ hubId }: { hubId: FinanceHubId }) {
  const { me, hasPermission } = useAuth();
  const featureFlags = me?.feature_flags;
  const canAccess = useCallback(
    (key: string) => isMenuPermissionAllowed(key, featureFlags, hasPermission),
    [featureFlags, hasPermission],
  );
  const hub = getFinanceHub(hubId);

  if (!isFinanceHubsV2Enabled(featureFlags)) return <Navigate to="/app/accounts" replace />;

  /** Quick actions: Voucher Print on the Vouchers tab, create links respecting their flags. */
  const headerActions = (activeTabId: string | undefined): ReactNode => {
    if (hub.id !== "vouchers-payables") return null;
    return (
      <>
        {activeTabId === "vouchers" ? (
          <Link to="/app/accounts/vouchers/print" className={quickActionClass}>
            Print vouchers
          </Link>
        ) : null}
        {featureFlags?.credit_debit_note_enabled === true ? (
          <>
            <Link to="/app/finance/credit-notes/new" className={quickActionClass}>
              New credit note
            </Link>
            <Link to="/app/finance/debit-notes/new" className={quickActionClass}>
              New debit note
            </Link>
          </>
        ) : null}
        {featureFlags?.stock_transfer_voucher_enabled === true ? (
          <Link to="/app/finance/stock-transfer-vouchers/new" className={quickActionClass}>
            New stock transfer
          </Link>
        ) : null}
      </>
    );
  };

  return (
    <ModuleHubPage
      hub={hub}
      featureFlags={featureFlags}
      canAccess={canAccess}
      headerActions={headerActions}
      renderEmpty={
        hub.id === "home" ? () => <FinanceHomeLanding featureFlags={featureFlags} canAccess={canAccess} /> : undefined
      }
    />
  );
}
