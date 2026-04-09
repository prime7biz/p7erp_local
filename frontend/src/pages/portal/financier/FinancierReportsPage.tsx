import { useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Button } from "@/components/ui/button";

const REPORTS: {
  key: string;
  title: string;
  description: string;
}[] = [
  {
    key: "lender_pack",
    title: "Lender pack",
    description: "Consolidated export of key credit and movement signals for your files (when enabled).",
  },
  {
    key: "btb_utilization",
    title: "BTB utilization",
    description: "Master contract and BTB utilization snapshot for linked facilities.",
  },
  {
    key: "repayment_schedule",
    title: "Repayment schedule",
    description: "Installment schedule extract for reporting periods.",
  },
  {
    key: "stock_collateral",
    title: "Stock collateral",
    description: "Open PO / receipt positions related to collateral chains.",
  },
];

export function FinancierReportsPage() {
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function generate(key: string) {
    setErr("");
    setBusyKey(key);
    try {
      const data = (await financierPortalApi.report(key)) as {
        status?: string;
        message?: string;
        report_key?: string;
      };
      const line =
        data.status === "not_implemented"
          ? "Coming soon — use portal lists and snapshots for now."
          : data.message || JSON.stringify(data);
      setMsg((m) => ({ ...m, [key]: line }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Reports</h1>
        <p className="mt-1 text-xs text-text-muted">Analyst role and full portal scope may be required for exports.</p>
      </div>
      {err ? <PortalErrorState message={err} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <div key={r.key} className="flex flex-col rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-text-primary">{r.title}</h2>
            <p className="mt-2 flex-1 text-xs text-text-muted">{r.description}</p>
            <div className="mt-4">
              <Button type="button" size="sm" disabled={busyKey === r.key} onClick={() => void generate(r.key)}>
                {busyKey === r.key ? "Generating…" : "Generate"}
              </Button>
            </div>
            {msg[r.key] ? <p className="mt-3 text-xs text-text-muted">{msg[r.key]}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
