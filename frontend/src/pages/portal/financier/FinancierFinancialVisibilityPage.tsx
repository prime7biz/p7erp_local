import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type Row = {
  btb_lc_id: number;
  btb_lc_reference: string;
  btb_lc_status: string;
  bank_charges_status: string;
  ait_status: string;
  export_document_count: number;
  export_docs_submitted: boolean;
  invoice_claim_status: string;
  expected_collection_date: string | null;
  repayment_reserve_draft: boolean;
  saving_reserve_status: string;
  accounting_lc_status: string | null;
};

export function FinancierFinancialVisibilityPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.financialVisibility();
        setItems((d.items as Row[]) ?? []);
        setNote(typeof d.note === "string" ? d.note : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Financial visibility</h1>
        <p className="mt-1 text-xs text-text-muted">
          BTB LC accounting signals, export documents, FX receipt heuristics, and repayment draft flags. AIT / saving reserve are
          placeholders until tenant COA mapping exists.
        </p>
      </div>
      {note ? <p className="rounded-lg border border-border bg-surface-subtle p-3 text-sm text-text-muted">{note}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((r) => (
          <div key={r.btb_lc_id} className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <h2 className="font-semibold text-text-primary">{r.btb_lc_reference}</h2>
            <p className="text-xs text-text-muted">LC status: {r.btb_lc_status}</p>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Bank charges / LC accounting</dt>
                <dd className="text-right font-medium">{r.bank_charges_status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">AIT</dt>
                <dd className="text-right">{r.ait_status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Export documents</dt>
                <dd className="text-right">
                  {r.export_document_count} uploaded {r.export_docs_submitted ? "(yes)" : "(none)"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Invoice / FX claim (heuristic)</dt>
                <dd className="text-right">{r.invoice_claim_status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Expected collection</dt>
                <dd className="text-right">{r.expected_collection_date ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Repayment reserve (draft voucher)</dt>
                <dd className="text-right">{r.repayment_reserve_draft ? "yes" : "no"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-text-muted">Saving reserve</dt>
                <dd className="text-right">{r.saving_reserve_status}</dd>
              </div>
              {r.accounting_lc_status ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">BtbLcAccounting status</dt>
                  <dd className="text-right">{r.accounting_lc_status}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
