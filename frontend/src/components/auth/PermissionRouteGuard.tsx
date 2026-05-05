import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getRbacMode } from "@/components/auth/rbacMode";

interface PermissionRouteGuardProps {
  permissionKey: string;
}

export function PermissionRouteGuard({ permissionKey }: PermissionRouteGuardProps) {
  const { me, hasPermission } = useAuth();
  const location = useLocation();
  const mode = getRbacMode(me?.feature_flags);
  const allowed = hasPermission(permissionKey);

  if (allowed) return <Outlet />;
  if (mode === "shadow") {
    console.warn("rbac_frontend_shadow_denial", {
      permissionKey,
      mode,
      path: location.pathname,
      userId: me?.user_id ?? null,
      roleName: me?.role_name ?? null,
    });
    return <Outlet />;
  }
  if (mode === "off") return <Outlet />;

  return <Navigate to="/app" replace state={{ deniedPermission: permissionKey }} />;
}
