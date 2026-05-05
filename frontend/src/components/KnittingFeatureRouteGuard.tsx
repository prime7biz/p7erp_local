import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Block Knitting hub when tenant `knitting_enabled` is not true (Settings → Configuration). */
export function KnittingFeatureRouteGuard() {
  const { me } = useAuth();
  const location = useLocation();
  const enabled = me?.feature_flags && me.feature_flags.knitting_enabled === true;
  if (!enabled) {
    return <Navigate to="/app/production" replace state={{ fromKnittingDenied: location.pathname }} />;
  }
  return <Outlet />;
}
