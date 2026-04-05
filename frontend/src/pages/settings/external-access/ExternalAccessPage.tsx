import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { ExternalAccessOverview, ExternalFeatureFlagsPatch } from "@/types/externalAccess";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { Button } from "@/components/ui/button";
import { listPageErrorClass } from "@/components/app/listPageLayout";

export function ExternalAccessPage() {
  const [o, setO] = useState<ExternalAccessOverview | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const x = await api.getExternalAccessOverview();
      setO(x);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(key: keyof ExternalFeatureFlagsPatch) {
    if (!o) return;
    setBusy(true);
    try {
      const cur = o[key] as boolean;
      const patch = { [key]: !cur };
      const next = await api.patchExternalAccessFeatureFlags(patch);
      setO(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AppPageHeader
        title="External access"
        description="Customer and financier portals — enable per tenant, then invite users from the sub-pages."
      />
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      {o ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <p className="font-medium text-text-primary">Customer portal</p>
            <p className="text-sm text-text-muted mt-1">Principals: {o.customer_principal_count}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void toggle("customer_portal_enabled")}>
                {o.customer_portal_enabled ? "Disable" : "Enable"} portal
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void toggle("customer_notes_enabled")}>
                Notes: {o.customer_notes_enabled ? "on" : "off"}
              </Button>
            </div>
            <Link className="mt-3 inline-block text-sm text-brand-primary" to="/app/settings/external-access/customers">
              Manage customer access →
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <p className="font-medium text-text-primary">Financier portal</p>
            <p className="text-sm text-text-muted mt-1">Principals: {o.financier_principal_count}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void toggle("financier_portal_enabled")}>
                {o.financier_portal_enabled ? "Disable" : "Enable"} portal
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void toggle("financier_financial_summary_enabled")}
              >
                Financial summary: {o.financier_financial_summary_enabled ? "on" : "off"}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void toggle("financier_projection_enabled")}>
                Projections: {o.financier_projection_enabled ? "on" : "off"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void toggle("external_portal_document_downloads_enabled")}
              >
                Doc downloads: {o.external_portal_document_downloads_enabled ? "on" : "off"}
              </Button>
            </div>
            <Link className="mt-3 inline-block text-sm text-brand-primary" to="/app/settings/external-access/financiers">
              Manage financier access →
            </Link>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-4 md:col-span-2">
            <p className="text-sm text-text-muted">
              Pending invitations: {o.pending_invitation_count}.{" "}
              <Link className="text-brand-primary" to="/app/settings/external-access/audit">
                View external audit log →
              </Link>
            </p>
          </div>
        </div>
      ) : (
        !err && <p className="text-sm text-text-muted">Loading…</p>
      )}
    </div>
  );
}
