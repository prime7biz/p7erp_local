import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type BankAccountResponse,
  type ChartOfAccountResponse,
  type CommercialInvoicePaymentSummary,
  type CommercialInvoiceRow,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { LinkedRecordsSection } from "@/components/app/LinkedRecordsSection";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { PartyLedgerSummaryCard } from "@/pages/app/finance/party-ledger/PartyLedgerSummaryCard";
import { todayLocalISO } from "@/lib/dates";

function money(n: number | null | undefined, currency?: string | null) {
  const v = Number(n ?? 0);
  const formatted = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

function todayIso() {
  return todayLocalISO();
}

function newKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}`;
}

export function CommercialInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const [invoice, setInvoice] = useState<CommercialInvoiceRow | null>(null);
  const [summary, setSummary] = useState<CommercialInvoicePaymentSummary | null>(null);
  const [banks, setBanks] = useState<BankAccountResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [bankAccountId, setBankAccountId] = useState<number | "">("");
  const [receivableLedgerId, setReceivableLedgerId] = useState<number | "">("");
  const [exchangeRate, setExchangeRate] = useState("1");

  const load = useCallback(async () => {
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return;
    setError(null);
    try {
      const inv = await api.getCommercialInvoice(invoiceId);
      setInvoice(inv);
      if ((inv.status || "").toUpperCase() === "ISSUED") {
        const [pay, bankList, coa] = await Promise.all([
          api.getCommercialInvoicePaymentSummary(invoiceId),
          api.listBankAccounts({ active_only: true }),
          api.listChartOfAccounts({ active_only: true }),
        ]);
        setSummary(pay);
        setBanks(bankList);
        setAccounts(coa);
        setAmount(String(pay.outstanding_for_new ?? 0));
        const withGl = bankList.find((b) => b.gl_account_id != null);
        if (withGl?.gl_account_id) setBankAccountId(withGl.id);
        const ar = coa.find((a) => /receivable/i.test(a.name || ""));
        if (ar) setReceivableLedgerId(ar.id);
      } else {
        setSummary(null);
      }
    } catch (err) {
      logApiError("CommercialInvoiceDetailPage.load", err);
      setError(err instanceof Error ? err.message : "Failed to load invoice");
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleIssue = async () => {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.issueCommercialInvoice(invoice.id);
      setInvoice(updated);
      setSuccess(
        updated.ar_voucher_id
          ? `Issued. Draft AR voucher #${updated.ar_voucher_id} created for finance to post.`
          : "Issued.",
      );
      await load();
    } catch (err) {
      logApiError("CommercialInvoiceDetailPage.issue", err);
      setError(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!invoice) return;
    if (!window.confirm("Cancel this issued commercial invoice?")) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.cancelCommercialInvoice(invoice.id);
      setInvoice(updated);
      setSuccess("Invoice cancelled.");
      await load();
    } catch (err) {
      logApiError("CommercialInvoiceDetailPage.cancel", err);
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice) return;
    const bank = banks.find((b) => b.id === bankAccountId);
    if (!bank?.gl_account_id || !receivableLedgerId) {
      setError("Select bank (with GL) and receivable ledger.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.createCommercialInvoiceReceipt(invoice.id, {
        amount: Number(amount),
        receipt_date: receiptDate,
        bank_ledger_id: bank.gl_account_id,
        receivable_ledger_id: Number(receivableLedgerId),
        currency: invoice.currency || "USD",
        exchange_rate_to_base: Number(exchangeRate) || 1,
        idempotency_key: newKey(`ci-${invoice.id}`),
      });
      setSuccess(
        result.was_created
          ? `Draft receipt ${result.voucher_number || result.voucher_id} created.`
          : "Existing receipt reused.",
      );
      await load();
    } catch (err) {
      logApiError("CommercialInvoiceDetailPage.receipt", err);
      setError(err instanceof Error ? err.message : "Receipt failed");
    } finally {
      setBusy(false);
    }
  };

  if (!invoice && !error) {
    return <div className="p-4 text-sm text-text-muted">Loading invoice…</div>;
  }
  if (!invoice) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-status-danger-foreground">{error}</p>
        <Link to="/app/commercial/invoices" className="text-sm text-accent-secondary hover:underline">
          Back to invoices
        </Link>
      </div>
    );
  }

  const isDraft = (invoice.status || "").toUpperCase() === "DRAFT";
  const isIssued = (invoice.status || "").toUpperCase() === "ISSUED";

  const priceSourceBadge = (source: string) => {
    const s = (source || "").toUpperCase();
    if (s.includes("SNAPSHOT")) return "bg-status-success-subtle text-status-success-foreground";
    if (s.includes("PI")) return "bg-accent-secondary/15 text-accent-secondary";
    if (s.includes("QUOTATION")) return "bg-status-warning-subtle text-status-warning-foreground";
    if (s === "MISSING") return "bg-status-danger-subtle text-status-danger-foreground";
    return "bg-surface-subtle text-text-secondary";
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-text-muted">
            <Link to="/app/commercial/invoices" className="hover:underline">
              Commercial Invoices
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{invoice.invoice_code}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Status <span className="font-medium text-text-secondary">{invoice.status}</span>
            {" · "}
            {invoice.customer_name || `Customer #${invoice.customer_id}`}
            {invoice.primary_order_code ? ` · Order ${invoice.primary_order_code}` : null}
            {invoice.challan_code ? ` · Challan ${invoice.challan_code}` : null}
          </p>
          <div className="mt-2">
            <WorkflowSummaryStrip
              items={[
                { label: "Status", value: invoice.status },
                ...(invoice.customer_id
                  ? [
                      {
                        label: "Customer",
                        value: invoice.customer_name || `#${invoice.customer_id}`,
                        to: `/app/customers/${invoice.customer_id}`,
                      },
                    ]
                  : []),
                ...(invoice.primary_order_id
                  ? [
                      {
                        label: "Order",
                        value: invoice.primary_order_code || `#${invoice.primary_order_id}`,
                        to: `/app/orders/${invoice.primary_order_id}`,
                      },
                    ]
                  : []),
                ...(invoice.source_delivery_challan_id
                  ? [
                      {
                        label: "Challan",
                        value: invoice.challan_code || `#${invoice.source_delivery_challan_id}`,
                        to: `/app/inventory/delivery-challans/${invoice.source_delivery_challan_id}`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.source_delivery_challan_id ? (
            <Link
              to={`/app/inventory/delivery-challans/${invoice.source_delivery_challan_id}`}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              View challan
            </Link>
          ) : null}
          {invoice.ar_voucher_id ? (
            <Link
              to={`/app/accounts/vouchers/${invoice.ar_voucher_id}`}
              className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              AR voucher
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Print
          </button>
          {isDraft ? (
            <button
              type="button"
              disabled={busy || invoice.price_review_required}
              onClick={() => void handleIssue()}
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Issuing…" : "Issue invoice"}
            </button>
          ) : null}
          {isIssued ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCancel()}
              className="rounded-lg border border-status-danger/40 px-3 py-2 text-sm font-semibold text-status-danger-foreground hover:bg-status-danger-subtle disabled:opacity-50"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </header>

      <LinkedRecordsSection
        title="Linked records"
        columns={[
          {
            title: "Orders",
            rows: invoice.primary_order_id
              ? [
                  {
                    id: invoice.primary_order_id,
                    label: invoice.primary_order_code || `Order #${invoice.primary_order_id}`,
                    to: `/app/orders/${invoice.primary_order_id}`,
                  },
                ]
              : [],
          },
          {
            title: "Delivery challans",
            rows: invoice.source_delivery_challan_id
              ? [
                  {
                    id: invoice.source_delivery_challan_id,
                    label: invoice.challan_code || `Challan #${invoice.source_delivery_challan_id}`,
                    to: `/app/inventory/delivery-challans/${invoice.source_delivery_challan_id}`,
                  },
                ]
              : [],
          },
          {
            title: "Finance",
            rows: invoice.ar_voucher_id
              ? [
                  {
                    id: invoice.ar_voucher_id,
                    label: `AR voucher #${invoice.ar_voucher_id}`,
                    to: `/app/accounts/vouchers/${invoice.ar_voucher_id}`,
                  },
                ]
              : [],
          },
        ]}
      />

      <div className="max-w-sm">
        <PartyLedgerSummaryCard
          partyType="CUSTOMER"
          partyId={invoice.customer_id}
          title="Customer party ledger"
        />
      </div>

      {invoice.price_review_required ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
          Price review required — some lines have no auditable selling price. ISSUE is blocked until prices are
          fixed (snapshot / PI / confirmed quotation).
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
          {success}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Total</p>
          <p className="text-sm font-semibold">{money(invoice.total_amount, invoice.currency)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Base total</p>
          <p className="text-sm font-semibold">{money(invoice.base_total_amount)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">Invoice date</p>
          <p className="text-sm font-semibold">{invoice.invoice_date ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2">
          <p className="text-[10px] text-text-muted">FX rate</p>
          <p className="text-sm font-semibold">{invoice.exchange_rate_to_base ?? 1}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Unit price</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Price source</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines || []).map((ln) => (
              <tr key={ln.id} className="border-b border-border-subtle/60">
                <td className="px-3 py-2">{ln.description || "—"}</td>
                <td className="px-3 py-2">{ln.order_code || `#${ln.order_id}`}</td>
                <td className="px-3 py-2">{ln.quantity}</td>
                <td className="px-3 py-2">{money(ln.unit_price, ln.currency)}</td>
                <td className="px-3 py-2">{money(ln.line_amount, ln.currency)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${priceSourceBadge(ln.price_source)}`}>
                    {ln.price_source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isIssued && summary ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">Payments</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
              <p className="text-[10px] text-text-muted">Outstanding</p>
              <p className="text-sm font-semibold">{money(summary.outstanding_for_new, summary.currency)}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
              <p className="text-[10px] text-text-muted">Posted paid</p>
              <p className="text-sm font-semibold">{money(summary.paid_posted, summary.currency)}</p>
            </div>
          </div>
          {(summary.allocations || []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="px-2 py-1">Allocation</th>
                    <th className="px-2 py-1">Voucher</th>
                    <th className="px-2 py-1">Amount</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.allocations.map((a) => (
                    <tr key={a.id} className="border-b border-border-subtle/60">
                      <td className="px-2 py-1">#{a.id}</td>
                      <td className="px-2 py-1">
                        <Link to={`/app/accounts/vouchers/${a.voucher_id}`} className="text-accent-secondary hover:underline">
                          {a.voucher_number || a.voucher_id}
                        </Link>
                      </td>
                      <td className="px-2 py-1">{money(a.allocated_amount, a.currency)}</td>
                      <td className="px-2 py-1">{a.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {(summary.outstanding_for_new ?? 0) > 0 ? (
            <form onSubmit={handleReceipt} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Amount</span>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Receipt date</span>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Bank account</span>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select…</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id} disabled={!b.gl_account_id}>
                      {b.account_name} ({b.bank_name})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Receivable ledger</span>
                <select
                  value={receivableLedgerId}
                  onChange={(e) => setReceivableLedgerId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_number} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Exchange rate to base</span>
                <input
                  type="number"
                  step="0.000001"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm"
                  required
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Recording…" : "Record Payment"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
