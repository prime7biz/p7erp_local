import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getRbacMode } from "@/components/auth/rbacMode";

interface PermissionRouteGuardProps {
  permissionKey: string;
  /** When set, pass if the user has any of these keys (e.g. My HR: hr.access or ess.access). */
  anyOf?: string[];
}

export function PermissionRouteGuard({ permissionKey, anyOf }: PermissionRouteGuardProps) {
  const { me, hasPermission } = useAuth();
  const location = useLocation();
  const mode = getRbacMode(me?.feature_flags);
  const keys = anyOf?.length ? anyOf : [permissionKey];
  const allowed = keys.some((k) => hasPermission(k));
  // Fixed-class authority: module grants apply even when soft RBAC is off.
  const authorityOn = me?.authority_classes_enabled === true;

  if (allowed) return <Outlet />;
  if (!authorityOn && mode === "shadow") {
    console.warn("rbac_frontend_shadow_denial", {
      permissionKey: keys.join("|"),
      mode,
      path: location.pathname,
      userId: me?.user_id ?? null,
      roleName: me?.role_name ?? null,
    });
    return <Outlet />;
  }
  if (!authorityOn && mode === "off") return <Outlet />;

  return <Navigate to="/app" replace state={{ deniedPermission: keys[0] }} />;
}
