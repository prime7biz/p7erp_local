/**
 * Tally-style exception reports: things that are "stuck" between documents or impossible balances.
 * Each card is one check; the table below lists the records and how to fix them.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  type ExceptionChallanRow,
  type ExceptionCheckKey,
  type ExceptionGrnRow,
  type ExceptionNegativeLedgerRow,
  type ExceptionNegativeStockRow,
  type ExceptionOverdueBillRow,
  type ExceptionSummaryResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { ledgerActivityHref, voucherHref, yearStart } from "@/lib/financeDrilldown";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";

const CHECKS: { key: ExceptionCheckKey; title: string; hint: string }[] = [
  { key: "grn_not_billed", title: "Goods received, not billed", hint: "GRNs received with no vendor bill yet (Tally: Purchase Bills to Come)." },
  { key: "challan_not_invoiced", title: "Delivered, not invoiced", hint: "Posted delivery challans with no commercial invoice (Tally: Sales Bills to Make)." },
  { key: "negative_cash_bank", title: "Negative cash / bank", hint: "Cash or bank ledgers with a credit (negative) balance." },
  { key: "negative_stock", title: "Negative stock", hint: "Items where more went out than came in, per warehouse." },
  { key: "overdue_bills", title: "Overdue bills", hint: "Receivables and payables past their due date." },
];

type Rows =
  | { key: "grn_not_billed"; rows: ExceptionGrnRow[] }
  | { key: "challan_not_invoiced"; rows: ExceptionChallanRow[] }
  | { key: "negative_cash_bank"; rows: ExceptionNegativeLedgerRow[] }
  | { key: "negative_stock"; rows: ExceptionNegativeStockRow[] }
  | { key: "overdue_bills"; rows: ExceptionOverdueBillRow[] };

const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";
const TD = "px-3 py-2";
const LINK = "text-brand-primary hover:underline";

function isCheckKey(v: string | null): v is ExceptionCheckKey {
  return CHECKS.some((c) => c.key === v);
}

export function ExceptionReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("check");
  const active: ExceptionCheckKey = isCheckKey(tabParam) ? tabParam : "grn_not_billed";
  const [summary, setSummary] = useState<ExceptionSummaryResponse | null>(null);
  const [data, setData] = useState<Rows | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);
  const [busyGrnId, setBusyGrnId] = useState<number | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.getExceptionSummary());
    } catch (e) {
      logApiError("ExceptionReportsPage.summary", e);
    }
  }, []);

  const loadRows = useCallback(async (key: ExceptionCheckKey) => {
    setLoading(true);
    setError("");
    try {
      if (key === "grn_not_billed") setData({ key, rows: (await api.getExceptionGrnNotBilled({ limit: 200 })).rows });
      else if (key === "challan_not_invoiced") setData({ key, rows: (await api.getExceptionChallanNotInvoiced({ limit: 200 })).rows });
      else if (key === "negative_cash_bank") setData({ key, rows: (await api.getExceptionNegativeCashBank()).rows });
      else if (key === "negative_stock") setData({ key, rows: (await api.getExceptionNegativeStock()).rows });
      else setData({ key, rows: (await api.getExceptionOverdueBills()).rows });
    } catch (e) {
      logApiError("ExceptionReportsPage.rows", e);
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadRows(active);
  }, [active, loadRows]);

  function selectCheck(key: ExceptionCheckKey) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("check", key);
      return next;
    });
  }

  async function createBillFromGrn(grnId: number) {
    setBusyGrnId(grnId);
    setNotice("");
    setError("");
    try {
      const bill = await api.createVendorBillDraftFromGrn(grnId);
      setNotice(`Vendor bill draft ${bill.bill_code} created. Review and post it under Vendor bills.`);
      await Promise.all([loadRows("grn_not_billed"), loadSummary()]);
    } catch (e) {
      logApiError("ExceptionReportsPage.createBillFromGrn", e);
      setError((e as Error).message);
    } finally {
      setBusyGrnId(null);
    }
  }

  const today = todayLocalISO();
  const activeMeta = CHECKS.find((c) => c.key === active)!;

  function actions(rowKey: string, items: RowActionItem[]) {
    return <RowActionsMenu rowId={rowKey} openId={openActionsId} onOpenChange={setOpenActionsId} items={items} />;
  }

  function renderTable() {
    if (!data || data.key !== active) return null;
    if (data.rows.length === 0) {
      return <p className="px-3 py-6 text-center text-sm text-status-success-foreground">Nothing to fix here.</p>;
    }
    switch (data.key) {
      case "grn_not_billed":
        return (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle"><tr><th className={TH}>GRN</th><th className={TH}>Received</th><th className={TH}>Days waiting</th><th className={TH}>Supplier</th><th className={TH}>PO</th><th className={TH}>Supplier invoice</th><th className={TH} /></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.grn_id} className="border-t border-border">
                  <td className={TD}>{r.grn_code}</td>
                  <td className={TD}>{r.received_date ?? "—"}</td>
                  <td className={TD}>{r.days_waiting ?? "—"}</td>
                  <td className={TD}>{r.vendor_name ?? "—"}</td>
                  <td className={TD}>{r.po_code ?? "—"}</td>
                  <td className={TD}>{r.supplier_invoice_no ?? "—"}</td>
                  <td className={`${TD} text-right`}>
                    {actions(`grn-${r.grn_id}`, [
                      { key: "bill", label: busyGrnId === r.grn_id ? "Creating…" : "Create vendor bill draft", onClick: () => void createBillFromGrn(r.grn_id), disabled: busyGrnId != null },
                      { key: "view", label: "View GRN", href: `/app/inventory/goods-receiving/${r.grn_id}/print` },
                    ])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "challan_not_invoiced":
        return (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle"><tr><th className={TH}>Challan</th><th className={TH}>Customer</th><th className={TH}>Delivered</th><th className={TH}>Days waiting</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.challan_id} className="border-t border-border">
                  <td className={TD}><Link className={LINK} to={`/app/inventory/delivery-challans/${r.challan_id}`}>{r.challan_code}</Link></td>
                  <td className={TD}>{r.customer_name}</td>
                  <td className={TD}>{r.delivery_date ?? "—"}</td>
                  <td className={TD}>{r.days_waiting ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "negative_cash_bank":
        return (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle"><tr><th className={TH}>Ledger</th><th className={TH}>Group</th><th className={`${TH} text-right`}>Balance</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.account_id} className="border-t border-border">
                  <td className={TD}><Link className={LINK} to={ledgerActivityHref(r.account_id, yearStart(today), today)}>{r.account_number} - {r.account_name}</Link></td>
                  <td className={TD}>{r.group_name}</td>
                  <td className={`${TD} text-right font-medium text-status-danger-foreground`}>{r.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "negative_stock":
        return (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle"><tr><th className={TH}>Item</th><th className={TH}>Warehouse</th><th className={`${TH} text-right`}>On hand</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.item_id}-${r.warehouse_id ?? "none"}`} className="border-t border-border">
                  <td className={TD}><Link className={LINK} to="/app/inventory/stock-ledger">{r.item_code} - {r.item_name}</Link></td>
                  <td className={TD}>{r.warehouse_name ?? "No warehouse"}</td>
                  <td className={`${TD} text-right font-medium text-status-danger-foreground`}>{r.on_hand.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "overdue_bills":
        return (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle"><tr><th className={TH}>Bill</th><th className={TH}>Party</th><th className={TH}>Type</th><th className={TH}>Due</th><th className={TH}>Days overdue</th><th className={`${TH} text-right`}>Amount due</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={`${r.source}-${r.id}`} className="border-t border-border">
                  <td className={TD}>
                    {r.source_voucher_id ? <Link className={LINK} to={voucherHref(r.source_voucher_id)}>{r.bill_number}</Link> : <Link className={LINK} to="/app/accounts/outstanding-bills">{r.bill_number}</Link>}
                  </td>
                  <td className={TD}>{r.party_name}</td>
                  <td className={TD}>{r.bill_type}</td>
                  <td className={TD}>{r.due_date ?? "—"}</td>
                  <td className={TD}>{r.days_overdue ?? "—"}</td>
                  <td className={`${TD} text-right`}>{r.amount_due.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
    }
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Exception reports"
        description="Things that are stuck between documents or should never happen. Fix them before month-end."
        actions={
          <button
            type="button"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            onClick={() => {
              void loadSummary();
              void loadRows(active);
            }}
          >
            Refresh
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CHECKS.map((c) => {
          const count = summary?.counts[c.key];
          const selected = c.key === active;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => selectCheck(c.key)}
              className={`rounded-xl border p-4 text-left transition ${selected ? "border-brand-primary bg-brand-primary/5" : "border-border bg-surface-raised hover:bg-surface-subtle"}`}
            >
              <div className="text-xs font-medium text-text-muted">{c.title}</div>
              <div className={`mt-1 text-2xl font-semibold ${count ? "text-status-danger-foreground" : "text-text-primary"}`}>
                {summary == null ? "…" : count == null ? "n/a" : count}
              </div>
            </button>
          );
        })}
      </div>

      {notice ? <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="rounded-xl border border-border bg-surface-raised">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{activeMeta.title}</h2>
          <p className="text-xs text-text-muted">{activeMeta.hint}</p>
        </div>
        <div className="overflow-x-auto">{loading ? <p className="px-3 py-6 text-center text-sm text-text-muted">Loading…</p> : renderTable()}</div>
      </div>
    </div>
  );
}
