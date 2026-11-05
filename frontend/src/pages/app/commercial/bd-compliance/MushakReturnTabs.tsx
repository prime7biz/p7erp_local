/**
 * Mushak 6.10 (invoices above BDT 2 lakh) and Mushak 9.1 (draft monthly return summary).
 * Figures come from the 6.1 / 6.2 registers; check with a VAT consultant before filing.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Mushak610, type Mushak91Summary } from "@/api/client";
import { downloadXlsx } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";
import { btnSecondary, errMsg, inputClass, labelClass, num } from "./shared";

function useMonth() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [y, m] = period.split("-").map(Number);
  return { period, setPeriod, year: y ?? now.getFullYear(), month: m ?? now.getMonth() + 1 };
}

function MonthPicker({ period, setPeriod, onRefresh }: { period: string; setPeriod: (v: string) => void; onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label>
        <span className={labelClass}>Month</span>
        <input type="month" className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)} />
      </label>
      <button type="button" className={btnSecondary} onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
}

export function Mushak610Tab() {
  const { period, setPeriod, year, month } = useMonth();
  const [data, setData] = useState<Mushak610 | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.getMushak610(year, month));
    } catch (e) {
      logApiError("Mushak610Tab.load", e);
      toast.error(errMsg(e, "Could not load Mushak 6.10"));
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportExcel() {
    if (!data) return;
    await downloadXlsx(
      ["Type", "Date", "Invoice / bill no.", "Party", "Party BIN", "Value (BDT)", "VAT", "Total"],
      [
        ...data.purchases.map((r) => ["Purchase", r.date, r.supplier_invoice_no || r.bill_code, r.supplier_name, r.supplier_bin, Number(r.taxable_value), Number(r.vat_amount), Number(r.total)]),
        ...data.sales.map((r) => ["Sale", r.date, r.invoice_code, r.buyer_name, r.buyer_bin, Number(r.taxable_value), Number(r.vat_amount), Number(r.total)]),
      ] as (string | number | null)[][],
      `mushak-6-10-${period}`,
    );
  }

  const table = (title: string, rows: Mushak610["purchases"], party: "supplier" | "buyer") => (
    <div className="rounded-xl border border-border bg-surface-raised">
      <h3 className="border-b border-border px-3 py-2 text-sm font-semibold text-text-primary">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-text-muted">None above BDT 2,00,000 this month.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-text-muted">
            <tr>
              <th className="px-3 py-1.5">Date</th>
              <th className="px-3 py-1.5">No.</th>
              <th className="px-3 py-1.5">{party === "supplier" ? "Supplier" : "Buyer"}</th>
              <th className="px-3 py-1.5">BIN</th>
              <th className="px-3 py-1.5 text-right">Value</th>
              <th className="px-3 py-1.5 text-right">VAT</th>
              <th className="px-3 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1.5">{r.date ?? "—"}</td>
                <td className="px-3 py-1.5">{party === "supplier" ? r.supplier_invoice_no || r.bill_code : r.invoice_code}</td>
                <td className="px-3 py-1.5">{party === "supplier" ? r.supplier_name : r.buyer_name}</td>
                <td className="px-3 py-1.5">{(party === "supplier" ? r.supplier_bin : r.buyer_bin) ?? "—"}</td>
                <td className="px-3 py-1.5 text-right">{num(r.taxable_value as string)}</td>
                <td className="px-3 py-1.5 text-right">{num(r.vat_amount as string)}</td>
                <td className="px-3 py-1.5 text-right font-medium">{num(r.total as string)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <MonthPicker period={period} setPeriod={setPeriod} onRefresh={() => void load()} />
        <button type="button" className={btnSecondary} disabled={!data} onClick={() => void exportExcel().catch((e) => toast.error(errMsg(e, "Export failed")))}>
          Export Excel
        </button>
      </div>
      {data?.note ? <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-text-secondary">{data.note}</p> : null}
      {data ? (
        <>
          {table("Purchases", data.purchases, "supplier")}
          {table("Sales", data.sales, "buyer")}
        </>
      ) : null}
    </div>
  );
}

export function Mushak91Tab() {
  const { period, setPeriod, year, month } = useMonth();
  const [data, setData] = useState<Mushak91Summary | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.getMushak91(year, month));
    } catch (e) {
      logApiError("Mushak91Tab.load", e);
      toast.error(errMsg(e, "Could not load Mushak 9.1 summary"));
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <MonthPicker period={period} setPeriod={setPeriod} onRefresh={() => void load()} />
      {data?.note ? <p className="rounded-lg bg-surface-raised px-3 py-2 text-xs text-text-secondary">{data.note}</p> : null}
      {data ? (
        <div className="max-w-3xl rounded-xl border border-border bg-surface-raised p-4">
          <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <div className="font-semibold text-text-primary">{data.title}</div>
              <div className="text-text-secondary">
                {data.seller_name} · BIN {data.seller_bin ?? <span className="text-status-danger-foreground">not set (Settings → Configuration)</span>}
              </div>
            </div>
            <div className="text-right text-xs text-text-muted">
              Period {data.period} · due by the {data.due_by}
              <div>
                {data.counts.sales_invoices} sales invoice(s) · {data.counts.purchase_bills} purchase bill(s)
              </div>
            </div>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-text-muted">
              <tr>
                <th className="py-1.5 pr-3">Section</th>
                <th className="py-1.5 pr-3">Line</th>
                <th className="py-1.5 pr-3 text-right">Value (BDT)</th>
                <th className="py-1.5 text-right">VAT (BDT)</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((ln) => (
                <tr key={ln.label} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-text-secondary">{ln.section}</td>
                  <td className="py-1.5 pr-3">{ln.label}</td>
                  <td className="py-1.5 pr-3 text-right">{ln.value ? num(ln.value) : ""}</td>
                  <td className="py-1.5 text-right font-medium">{num(ln.vat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-surface-subtle px-3 py-2 text-sm">
              Net VAT payable: <b>{num(data.net_vat_payable)}</b>
            </div>
            <div className="rounded-lg bg-surface-subtle px-3 py-2 text-sm">
              Credit to carry forward: <b>{num(data.carry_forward_credit)}</b>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
