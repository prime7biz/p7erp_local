import { useLayoutEffect } from "react";
import type { ExternalPrincipalType } from "@/types/externalAccess";
import { getExtPrincipalType, getExtToken } from "@/api/externalClient";
import { redirectToUnifiedLogin } from "@/utils/portalAuthRedirect";

export function ExternalAccessGuard({
  portal,
  children,
}: {
  portal: ExternalPrincipalType;
  children: React.ReactNode;
}) {
  const token = getExtToken();
  const type = getExtPrincipalType();
  const ok = Boolean(token && type === portal);

  useLayoutEffect(() => {
    if (!ok) {
      redirectToUnifiedLogin(portal);
    }
  }, [ok, portal]);

  if (!ok) {
    return (
      <p className="p-4 text-center text-sm text-text-muted" role="status">
        Redirecting to sign in…
      </p>
    );
  }
  return <>{children}</>;
}
