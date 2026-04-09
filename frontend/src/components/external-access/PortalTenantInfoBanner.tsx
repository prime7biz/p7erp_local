import type { ExternalMeResponse } from "@/types/externalAccess";

/** Shown on portal dashboards — company identity for the logged-in tenant. */
export function PortalTenantInfoBanner({ me }: { me: ExternalMeResponse }) {
  return (
    <div className="rounded-xl border border-border bg-surface-subtle/70 p-4 text-sm text-text-secondary shadow-sm">
      <p className="font-semibold text-text-primary">{me.tenant_name}</p>
      {me.company_code ? (
        <p className="mt-1">
          Company code: <span className="font-mono text-text-primary">{me.company_code}</span>
        </p>
      ) : null}
      {me.tenant_address ? <p className="mt-1 whitespace-pre-wrap">{me.tenant_address}</p> : null}
      {me.tenant_phone ? <p className="mt-1">Phone: {me.tenant_phone}</p> : null}
    </div>
  );
}
