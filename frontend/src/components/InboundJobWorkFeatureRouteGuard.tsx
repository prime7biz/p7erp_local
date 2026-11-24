import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Block Inbound Job Work when tenant `inbound_job_work_v1` is not true. */
export function InboundJobWorkFeatureRouteGuard() {
  const { me } = useAuth();
  const location = useLocation();
  const enabled = me?.feature_flags && me.feature_flags.inbound_job_work_v1 === true;
  if (!enabled) {
    return <Navigate to="/app/production" replace state={{ fromJobWorkDenied: location.pathname }} />;
  }
  return <Outlet />;
}
