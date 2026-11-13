import { Navigate, useLocation } from "react-router-dom";

/**
 * Short link `/app/control-tower?...` (used in Manufacturing Intelligence alerts, e.g. `?tab=predictions&finding=12`)
 * → the real Control Tower page. Keeps every query parameter and the #hash.
 */
export function ControlTowerShortLinkRedirect() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: "/app/operations/control-tower", search: location.search, hash: location.hash }} />;
}
