import { Navigate, useLocation } from "react-router-dom";
import { findHrLegacyTarget } from "./hrHubs";

/**
 * Old standalone HR page (bookmark, tutorial, approval inbox) → its tab on the new hub.
 * Keeps every query parameter and the #hash; only `tab` is set.
 */
export function HrLegacyRedirect({ from }: { from: string }) {
  const location = useLocation();
  const target = findHrLegacyTarget(from);
  if (!target) return <Navigate to="/app/hr" replace />;
  const params = new URLSearchParams(location.search);
  params.set("tab", target.tab.id);
  return (
    <Navigate
      replace
      to={{ pathname: `/app/${target.hub.path}`, search: `?${params.toString()}`, hash: location.hash }}
    />
  );
}
