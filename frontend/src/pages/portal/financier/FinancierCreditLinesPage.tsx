import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

function fmtNum(n: unknown): string {
  if (typeof n === "number" && Number.isFinite(n)) return n.toLocaleString();
  return n == null ? "—" : String(n);
}

export function FinancierCreditLinesPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setData(await financierPortalApi.creditLines());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;
  const items = (data?.items as Record<string, unknown>[]) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Credit lines</h1>
      {data?.note ? <p className="text-sm text-amber-700">{String(data.note)}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((f) => (
          <div key={String(f.id)} className="rounded-xl border border-border p-4 text-sm">
            <p className="font-medium text-text-primary">{String(f.facility_code)}</p>
            <p className="text-text-muted">
              {String(f.facility_type)} · {String(f.status)}
            </p>
            <p className="mt-2">
              <span className="text-text-muted">Sanctioned:</span> {String(f.currency ?? "")}{" "}
              {fmtNum(f.sanctioned_amount)}
            </p>
            <p>
              <span className="text-text-muted">Utilized:</span> {String(f.currency ?? "")} {fmtNum(f.utilized_amount)}
            </p>
            <p className="font-medium text-text-primary">
              <span className="text-text-muted font-normal">Available:</span> {String(f.currency ?? "")}{" "}
              {fmtNum(f.available_amount)}
            </p>
            <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-text-muted">
              <p>
                <span className="font-medium text-text-primary">BTB LC:</span>{" "}
                {f.btb_lc_reference != null ? String(f.btb_lc_reference) : "—"}
                {f.linked_btb_lc_id != null ? ` (#${String(f.linked_btb_lc_id)})` : ""}
              </p>
              <p>
                <span className="font-medium text-text-primary">Master contract:</span>{" "}
                {f.master_contract_reference != null ? String(f.master_contract_reference) : "—"}
                {f.linked_master_contract_id != null ? ` (#${String(f.linked_master_contract_id)})` : ""}
              </p>
              <p>
                <span className="font-medium text-text-primary">Facility expiry:</span>{" "}
                {f.facility_expiry_date != null ? String(f.facility_expiry_date) : "—"}
              </p>
              <p>
                <span className="font-medium text-text-primary">Interest rate:</span>{" "}
                {typeof f.interest_rate === "number" ? `${f.interest_rate}%` : "—"}
              </p>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && !data?.note ? <p className="text-sm text-text-muted">No facilities linked.</p> : null}
    </div>
  );
}
