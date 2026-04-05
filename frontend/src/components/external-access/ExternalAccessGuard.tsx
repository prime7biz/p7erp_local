import { Navigate, useLocation } from "react-router-dom";
import type { ExternalPrincipalType } from "@/types/externalAccess";
import { getExtPrincipalType, getExtToken } from "@/api/externalClient";

export function ExternalAccessGuard({
  portal,
  children,
}: {
  portal: ExternalPrincipalType;
  children: React.ReactNode;
}) {
  const loc = useLocation();
  const token = getExtToken();
  const type = getExtPrincipalType();
  if (!token || type !== portal) {
    return <Navigate to={`/portal/${portal}/login`} replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}
