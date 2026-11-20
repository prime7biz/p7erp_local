import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type PaymentRunAdviceResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { ScrollTableCard, SummaryStrip } from "@/components/finance/kit";

export function PaymentAdvicePage() {
  const [search] = useSearchParams();
  const [runId, setRunId] = useState(search.get("run_id") ?? "");
  const [data, setData] = useState<PaymentRunAdviceResponse | null>(null);
  const [error, setError] = useState("");

  async function load(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      const id = Number(runId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Enter valid run ID");
      setData(await api.getPaymentRunAdvice(id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader title="Payment Advice" description="Print-style payment batch advice with bank and voucher reference." />

      <form onSubmit={load} className={listPageFilterBarClass}>
        <input
          className={`${listPageToolbarInputClass} sm:max-w-xs`}
          placeholder="Payment run ID"
          aria-label="Payment run ID"
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
        />
        <button type="submit" className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90">
          Load Advice
        </button>
        {data ? (
          <button type="button" className={listPageToolbarButtonClass} onClick={() => window.print()}>
            Print
          </button>
        ) : null}
      </form>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      {data ? (
        <>
          <SummaryStrip
            items={[
              { key: "run", label: "Run", value: data.header.run_code },
              { key: "date", label: "Date", value: data.header.run_date },
              { key: "bank", label: "Bank", value: data.header.bank_name ?? "-" },
              { key: "voucher", label: "Voucher", value: data.header.executed_voucher_id ? `#${data.header.executed_voucher_id}` : "-" },
            ]}
          />
          <ScrollTableCard
            maxHeight="main"
            footer={`Total: ${data.totals.total_amount.toLocaleString()} (${data.totals.item_count} items)`}
          >
            <table className={`${listTableBaseClass} min-w-[32rem]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass}>Party</th>
                  <th className={listTableThClass}>Reference</th>
                  <th className={listTableThRightClass}>Amount</th>
                  <th className={listTableThClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td className={listPageEmptyClass} colSpan={4}>
                      No items in this payment run.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr key={item.item_id} className={listTableTrClass}>
                      <td className={listTableTdPrimaryClass}>{item.party_name}</td>
                      <td className={listTableTdClass}>{item.reference ?? "-"}</td>
                      <td className={`${listTableTdClass} text-right`}>{item.amount.toLocaleString()}</td>
                      <td className={listTableTdClass}>{item.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollTableCard>
        </>
      ) : null}
    </div>
  );
}