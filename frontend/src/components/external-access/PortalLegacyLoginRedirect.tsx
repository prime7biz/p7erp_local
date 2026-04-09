import { useLayoutEffect } from "react";
import type { ExternalPrincipalType } from "@/types/externalAccess";
import { redirectToUnifiedLogin } from "@/utils/portalAuthRedirect";

/** Replaces legacy portal login URLs (e.g. /portal/financier/login) with a full-page redirect so port and iframe context stay correct. */
export function PortalLegacyLoginRedirect({ role }: { role: ExternalPrincipalType }) {
  useLayoutEffect(() => {
    redirectToUnifiedLogin(role);
  }, [role]);
  return (
    <p className="p-4 text-center text-sm text-text-muted" role="status">
      Redirecting…
    </p>
  );
}
