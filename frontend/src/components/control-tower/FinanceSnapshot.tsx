import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type FinanceMasterLcExposureResponse, type FinanceMaturityTrancheRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function FinanceSnapshot({ masterContractId }: { masterContractId: number | null }) {
  const [exposure, setExposure] = useState<FinanceMasterLcExposureResponse | null>(null);
  const [ladder, setLadder] = useState<FinanceMaturityTrancheRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (masterContractId == null) {
      setExposure(null);
      setLadder([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [ex, ld] = await Promise.all([
          api.getFinanceExposureMasterLc(masterContractId),
          api.getFinanceMaturityLadder(masterContractId),
        ]);
        if (!cancelled) {
          setExposure(ex);
          setLadder(ld);
        }
      } catch (e) {
        logApiError(e, "FinanceSnapshot.load");
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load finance snapshot");
          setExposure(null);
          setLadder([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [masterContractId]);

  if (masterContractId == null) {
    return (
      <p className="text-xs text-text-muted">
        Select a master LC above (from orders in range) to see funded vs non-funded exposure and maturity tranches.
      </p>
    );
  }

  if (loading) return <p className="text-xs text-text-muted">Loading finance snapshot…</p>;
  if (error) return <div className="text-xs text-status-danger-foreground">{error}</div>;

  return (
    <div className="space-y-3 text-xs">
      {exposure ? (
        <div className="rounded border border-border-subtle bg-surface-subtle p-3 space-y-1">
          <div className="font-medium text-text-primary">{exposure.reference}</div>
          <div className="text-text-secondary">Total BTB: {exposure.total_btb_amount}</div>
          <div className="text-text-secondary">
            Funded portion <span className="text-[10px] text-text-muted">(facility-linked)</span>:{" "}
            {exposure.funded_portion}
          </div>
          <div className="text-text-secondary">
            Non-funded portion: {exposure.non_funded_portion}
          </div>
          <div className="text-text-secondary">BTB count: {exposure.btb_count}</div>
        </div>
      ) : null}
      <div>
        <div className="mb-1 font-medium text-text-secondary">Maturity ladder</div>
        {ladder.length === 0 ? (
          <p className="text-text-muted">No tranches.</p>
        ) : (
          <ul className="max-h-40 overflow-y-auto space-y-1">
            {ladder.slice(0, 20).map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2 border-b border-border-subtle/50 py-1">
                <span className="text-text-primary">{t.btb_reference ?? `BTB #${t.btb_lc_id}`}</span>
                <span className="text-text-secondary">
                  {t.maturity_date ?? "—"} · {t.amount ?? "—"} {t.currency ?? ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-3">
        <Link to="/app/commercial/btb-lcs" className="text-status-info hover:underline">
          BTB LCs
        </Link>
        <Link to="/app/finance/facilities" className="text-status-info hover:underline">
          Facilities
        </Link>
      </div>
    </div>
  );
}
