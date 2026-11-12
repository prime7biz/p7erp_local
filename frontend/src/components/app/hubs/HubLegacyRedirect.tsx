import { Navigate, useLocation } from "react-router-dom";
import { findHubLegacyTarget } from "./hubNavigation";
import type { Hub } from "./types";

/**
 * Old standalone page (bookmark, tutorial, approval inbox) → its tab on the new hub.
 * Keeps every query parameter and the #hash; only `tab` is set.
 * An old path no hub knows goes to `fallback`.
 */
export function HubLegacyRedirect({ hubs, from, fallback }: { hubs: readonly Hub[]; from: string; fallback: string }) {
  const location = useLocation();
  const target = findHubLegacyTarget(hubs, from);
  if (!target) return <Navigate to={fallback} replace />;
  const params = new URLSearchParams(location.search);
  params.set("tab", target.tab.id);
  return (
    <Navigate
      replace
      to={{ pathname: `/app/${target.hub.path}`, search: `?${params.toString()}`, hash: location.hash }}
    />
  );
}
