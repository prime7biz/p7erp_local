import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

export function FinancierProcurementTrackerPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setData(await financierPortalApi.procurementTracker());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;
  const items = (data?.items as Record<string, unknown>[]) ?? [];
  const apiNote = typeof data?.note === "string" && data.note.trim() ? data.note.trim() : "";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Procurement tracker</h1>
      <p className="text-xs text-text-muted">Purchase orders on BTB LCs linked to your facilities.</p>
      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-muted/40 px-3 py-3 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">No purchase orders in your BTB scope</p>
          {apiNote ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">{apiNote}</p> : null}
          <p className="mt-1 text-xs text-text-muted">
            This list only shows POs whose BTB LC is linked to a facility (or utilization) tied to your financier
            access. If you just seeded data, run{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-[11px]">
              docker compose exec backend python scripts/seed_financier_full_demo.py --company-code LAKH806201
            </code>{" "}
            and log in as{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-[11px]">financier.portal.demo@p7erp.local</code>{" "}
            (Financier role). Other financier logins need{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 text-[11px]">financier_party_id</code> set on their
            external access row in Settings.
          </p>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border text-xs text-text-muted">
            <tr>
              <th className="px-2 py-2 text-left">PO</th>
              <th className="px-2 py-2 text-left">Supplier</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left">GRNs</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={String(r.purchase_order_id)} className="border-b border-border">
                <td className="px-2 py-1">{String(r.po_code)}</td>
                <td className="px-2 py-1">{String(r.supplier_name)}</td>
                <td className="px-2 py-1">{String(r.status)}</td>
                <td className="px-2 py-1">
                  {String(r.grn_posted_count)}/{String(r.grn_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
