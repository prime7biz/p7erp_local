import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** When tenant `feature_flags.trade_enabled` is false, block Trade and Logistics app routes. */
export function TradeFeatureRouteGuard() {
  const { me } = useAuth();
  const location = useLocation();
  if (me?.feature_flags && me.feature_flags.trade_enabled === false) {
    const p = location.pathname;
    if (p.startsWith("/app/trade") || p.startsWith("/app/logistics")) {
      return <Navigate to="/app" replace />;
    }
  }
  return <Outlet />;
}
