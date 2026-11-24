import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Block Material Control when tenant `material_control_hub_v1` is not true. */
export function MaterialControlFeatureRouteGuard() {
  const { me } = useAuth();
  const location = useLocation();
  const enabled = me?.feature_flags && me.feature_flags.material_control_hub_v1 === true;
  if (!enabled) {
    return <Navigate to="/app/inventory" replace state={{ fromMaterialControlDenied: location.pathname }} />;
  }
  return <Outlet />;
}
