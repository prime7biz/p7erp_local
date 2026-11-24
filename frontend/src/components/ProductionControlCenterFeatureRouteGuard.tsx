import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Block Production Control Center when tenant `prod_control_center_v1` is not true. */
export function ProductionControlCenterFeatureRouteGuard() {
  const { me } = useAuth();
  const location = useLocation();
  const enabled = me?.feature_flags && me.feature_flags.prod_control_center_v1 === true;
  if (!enabled) {
    return <Navigate to="/app/production" replace state={{ fromControlCenterDenied: location.pathname }} />;
  }
  return <Outlet />;
}
