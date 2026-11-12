import type { ComponentType } from "react";
import { HubLegacyRedirect } from "@/components/app/hubs/HubLegacyRedirect";
import type { Hub } from "@/components/app/hubs/types";
import { useAuth } from "@/context/AuthContext";
import { FINANCE_HUBS, isFinanceHubsV2Enabled } from "./financeHubs";

const hubs: readonly Hub[] = FINANCE_HUBS;

/** Old Finance page → its hub tab (keeps query + #hash). Unknown old paths go to Finance Home. */
export function FinanceLegacyRedirect({ from }: { from: string }) {
  return <HubLegacyRedirect hubs={hubs} from={from} fallback="/app/finance/home" />;
}

/**
 * Router element for an old Finance list page.
 * `finance_hubs_v2` OFF: shows the current page exactly as before. ON: redirects to the hub tab.
 */
export function FinanceLegacyRoute({ from, Page }: { from: string; Page: ComponentType }) {
  const featureFlags = useAuth().me?.feature_flags;
  if (isFinanceHubsV2Enabled(featureFlags)) return <FinanceLegacyRedirect from={from} />;
  return <Page />;
}
