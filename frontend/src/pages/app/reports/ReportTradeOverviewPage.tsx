import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ShipmentRow, type TradeCaseRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportTradeOverviewPage() {
  const [cases, setCases] = useState<TradeCaseRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cRows, sRows] = await Promise.all([
        api.listTradeCases({ limit: 500 }),
        api.listShipments({ limit: 500 }),
      ]);
      setCases(Array.isArray(cRows) ? cRows : []);
      setShipments(Array.isArray(sRows) ? sRows : []);
    } catch (e) {
      logApiError(e, "ReportTradeOverviewPage.load");
      setError(e instanceof Error ? e.message : "Failed to load");
      setCases([]);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byStage = useMemo(() => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const c of cases) {
      const key = (c.current_stage || "—").toUpperCase();
      const cur = m.get(key) ?? { count: 0, amount: 0 };
      cur.count += 1;
      if (c.amount != null) cur.amount += Number(c.amount);
      m.set(key, cur);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cases]);

  const byShipmentStatus = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of shipments) {
      const key = (s.status || "—").toUpperCase();
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [shipments]);

  if (loading) return <div className="p-6 text-sm text-text-muted">Loading trade overview…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Trade overview</h1>
          <p className="text-sm text-text-secondary">Cases by stage and shipments by status (from current lists).</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="mb-3 text-sm font-medium">Trade cases by stage</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3 text-right">Count</th>
                <th className="py-2 pr-3 text-right">Sum amount</th>
              </tr>
            </thead>
            <tbody>
              {byStage.map(([stage, v]) => (
                <tr key={stage} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3">{stage}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{v.count}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{v.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {byStage.length === 0 ? <p className="py-3 text-sm text-text-secondary">No trade cases.</p> : null}
        <p className="mt-2 text-xs text-text-secondary">
          <Link className="text-brand-primary underline" to="/app/trade/cases">
            Open trade cases list
          </Link>
        </p>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="mb-3 text-sm font-medium">Shipments by status</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {byShipmentStatus.map(([st, n]) => (
                <tr key={st} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3">{st}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {byShipmentStatus.length === 0 ? <p className="py-3 text-sm text-text-secondary">No shipments.</p> : null}
        <p className="mt-2 text-xs text-text-secondary">
          <Link className="text-brand-primary underline" to="/app/reports/shipments">
            Shipment tracking report
          </Link>
        </p>
      </section>
    </div>
  );
}
