import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { logApiError } from "@/utils/logApiError";

type Row = {
  id: number;
  reference: string;
  composite_score?: number;
  otd_avg_score?: number | null;
  maturity_safety_score?: number | null;
  cashability_score?: number | null;
  open_orders?: number;
};

export function FinancierContractsListPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await financierPortalApi.contractsList();
      setItems((r.items as Row[]) ?? []);
      setNote(typeof r.note === "string" ? r.note : null);
    } catch (e) {
      logApiError("financier contracts list", e);
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) return <PortalErrorState message={err} onRetry={() => void load()} />;
  if (loading) return <p className="text-sm text-text-muted">Loading contracts…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Master contracts</h1>
        <p className="text-sm text-text-muted">Financed export contracts linked to your facilities / BTB LCs.</p>
        {note ? <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{note}</p> : null}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-subtle text-left text-xs uppercase text-text-muted">
            <tr>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Composite</th>
              <th className="px-3 py-2">OTD</th>
              <th className="px-3 py-2">Maturity</th>
              <th className="px-3 py-2">Cash</th>
              <th className="px-3 py-2">Open orders</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-text-primary">{r.reference}</td>
                <td className="px-3 py-2 tabular-nums">{r.composite_score ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.otd_avg_score ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.maturity_safety_score ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.cashability_score ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.open_orders ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link to={`/portal/financier/contracts/${r.id}`} className="font-medium text-brand-primary hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="p-4 text-sm text-text-muted">No contracts in your linked facility scope.</p> : null}
      </div>
    </div>
  );
}
