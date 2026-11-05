/**
 * Printable tax invoice (Mushak 6.3) for one commercial invoice.
 * Layout follows the NBR form's fields; figures are prepared from P7 data and must be checked before use.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Mushak63 } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { num } from "./shared";

export function Mushak63PrintPage() {
  const { invoiceId } = useParams();
  const [data, setData] = useState<Mushak63 | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Number(invoiceId);
    if (!Number.isFinite(id) || id <= 0) return;
    api
      .getMushak63(id)
      .then(setData)
      .catch((e) => {
        logApiError("Mushak63PrintPage.load", e);
        setError((e as Error).message);
      });
  }, [invoiceId]);

  if (error) return <div className="p-8 text-sm text-status-danger-foreground">{error}</div>;
  if (!data) return <div className="p-8 text-sm text-text-muted">Loading…</div>;

  const cell = "border border-black px-2 py-1";
  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-[12px] text-black print:p-0">
      <div className="no-print mb-4 flex items-center justify-between print:hidden">
        <Link className="text-sm text-brand-primary hover:underline" to="/app/commercial/bd-compliance">
          Back to Bond &amp; VAT registers
        </Link>
        <button type="button" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground" onClick={() => window.print()}>
          Print
        </button>
      </div>
      <p className="no-print mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 print:hidden">{data.note}</p>

      <div className="text-center">
        <div className="text-[11px]">Government of the People's Republic of Bangladesh · National Board of Revenue</div>
        <div className="text-base font-bold">Tax Invoice</div>
        <div className="text-[11px]">[See clauses (c) and (f) of Sub-Rule (1) of Rule 40] — Mushak-6.3</div>
      </div>

      <div className="mt-3 text-center">
        <div className="font-semibold">{data.seller.name}</div>
        <div>BIN: {data.seller.bin ?? "—"}</div>
        {data.seller.address ? <div>{data.seller.address}</div> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <div>Buyer: <b>{data.buyer.name}</b></div>
          <div>Buyer BIN: {data.buyer.bin ?? "—"}</div>
          <div>Address: {data.buyer.address ?? "—"}</div>
          <div>Supply type: {data.supply_type}</div>
        </div>
        <div className="text-right">
          <div>Invoice no.: <b>{data.invoice_code}</b></div>
          <div>Date of issue: {data.invoice_date ?? "—"}</div>
          <div>Time of issue: {data.issued_at ? new Date(`${data.issued_at}Z`).toLocaleTimeString() : "—"}</div>
          <div>
            Currency: {data.currency ?? "BDT"}
            {data.exchange_rate_to_base ? ` @ ${data.exchange_rate_to_base}` : ""}
          </div>
        </div>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="text-center">
            <th className={cell}>Sl</th>
            <th className={cell}>Description of goods / services</th>
            <th className={cell}>Quantity</th>
            <th className={cell}>Unit price</th>
            <th className={cell}>Total value (BDT)</th>
            <th className={cell}>SD (BDT)</th>
            <th className={cell}>VAT rate</th>
            <th className={cell}>VAT (BDT)</th>
            <th className={cell}>Total incl. taxes (BDT)</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((ln) => (
            <tr key={ln.sl}>
              <td className={`${cell} text-center`}>{ln.sl}</td>
              <td className={cell}>{ln.description}</td>
              <td className={`${cell} text-right`}>{num(ln.quantity, 4)}</td>
              <td className={`${cell} text-right`}>{num(ln.unit_price, 4)}</td>
              <td className={`${cell} text-right`}>{num(ln.value_bdt)}</td>
              <td className={`${cell} text-right`}>{num(ln.sd_amount)}</td>
              <td className={`${cell} text-right`}>{ln.vat_rate_pct}%</td>
              <td className={`${cell} text-right`}>{num(ln.vat_amount)}</td>
              <td className={`${cell} text-right`}>{num(ln.total_bdt)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className={cell} colSpan={4}>
              Total
            </td>
            <td className={`${cell} text-right`}>{num(data.totals.value_bdt)}</td>
            <td className={`${cell} text-right`}>{num(data.totals.sd)}</td>
            <td className={cell} />
            <td className={`${cell} text-right`}>{num(data.totals.vat)}</td>
            <td className={`${cell} text-right`}>{num(data.totals.total_bdt)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>Name of authorized person: ______________________</div>
        <div className="text-right">Signature: ______________________</div>
      </div>
    </div>
  );
}
