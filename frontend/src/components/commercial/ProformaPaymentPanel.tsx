import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type BankAccountResponse,
  type ChartOfAccountResponse,
  type ProformaPaymentSummary,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";

function money(n: number | null | undefined, currency?: string | null) {
  const v = Number(n ?? 0);
  const formatted = v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

function todayIso() {
  return todayLocalISO();
}

function newIdempotencyKey(piId: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pi-${piId}-${crypto.randomUUID()}`;
  }
  return `pi-${piId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type Props = {
  piId: number;
  defaultCurrency?: string | null;
  direction?: string | null;
};

export function ProformaPaymentPanel({ piId, defaultCurrency, direction }: Props) {
  const [summary, setSummary] = useState<ProformaPaymentSummary | null>(null);
  const [banks, setBanks] = useState<BankAccountResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [bankAccountId, setBankAccountId] = useState<number | "">("");
  const [receivableLedgerId, setReceivableLedgerId] = useState<number | "">("");
  const [currency, setCurrency] = useState(defaultCurrency || "USD");
  const [exchangeRate, setExchangeRate] = useState("1");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pay, bankList, coa] = await Promise.all([
        api.getProformaPaymentSummary(piId),
        api.listBankAccounts({ active_only: true }),
        api.listChartOfAccounts({ active_only: true }),
      ]);
      setSummary(pay);
      setBanks(bankList);
      setAccounts(coa);
      setCurrency(pay.currency || defaultCurrency || "USD");
      setAmount(String(pay.outstanding_for_new ?? 0));
      const withGl = bankList.find((b) => b.gl_account_id != null);
      if (withGl?.gl_account_id) setBankAccountId(withGl.id);
      const ar = coa.find(
        (a) =>
          /receivable/i.test(a.name || "") ||
          /receivable/i.test(a.reporting_code || "") ||
          /AR/i.test(a.account_number || ""),
      );
      if (ar) setReceivableLedgerId(ar.id);
    } catch (err) {
      logApiError("ProformaPaymentPanel.load", err);
      setError("Failed to load payment summary");
    } finally {
      setLoading(false);
    }
  }, [piId, defaultCurrency]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isExport = (direction || "EXPORT").toUpperCase() === "EXPORT";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!isExport) {
      setError("Only EXPORT proforma invoices can record receipt vouchers.");
      return;
    }
    const bank = banks.find((b) => b.id === bankAccountId);
    if (!bank?.gl_account_id) {
      setError("Select a bank account that is linked to a GL ledger.");
      return;
    }
    if (!receivableLedgerId) {
      setError("Select a receivable ledger account.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    const rate = Number(exchangeRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setError("Exchange rate must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.createProformaReceipt(piId, {
        amount: amt,
        receipt_date: receiptDate || todayIso(),
        bank_ledger_id: bank.gl_account_id,
        receivable_ledger_id: Number(receivableLedgerId),
        currency,
        exchange_rate_to_base: rate,
        idempotency_key: newIdempotencyKey(piId),
      });
      setSuccess(
        result.was_created
          ? `Draft receipt ${result.voucher_number || result.voucher_id} created. Remaining ${money(result.remaining_balance, currency)}.`
          : `Existing receipt reused (idempotent). Remaining ${money(result.remaining_balance, currency)}.`,
      );
      await refresh();
    } catch (err) {
      logApiError("ProformaPaymentPanel.createReceipt", err);
      const detail =
        err instanceof Error && err.message
          ? err.message
          : "Failed to record payment";
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-text-muted">
        Loading payment summary…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">Payments</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Record partial or full receipts against this export proforma. Vouchers are created as drafts for
            finance to post.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          Refresh
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
            <p className="text-[10px] text-text-muted">PI total</p>
            <p className="text-sm font-semibold text-text-primary">{money(summary.pi_amount, summary.currency)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
            <p className="text-[10px] text-text-muted">Allocated (incl. drafts)</p>
            <p className="text-sm font-semibold text-text-primary">{money(summary.paid_active, summary.currency)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
            <p className="text-[10px] text-text-muted">Posted paid</p>
            <p className="text-sm font-semibold text-text-primary">{money(summary.paid_posted, summary.currency)}</p>
          </div>
          <div className="rounded-lg border border-brand-primary/20 bg-brand-subtle px-3 py-2">
            <p className="text-[10px] text-brand-primary/80">Outstanding</p>
            <p className="text-sm font-semibold text-brand-primary">
              {money(summary.outstanding_for_new, summary.currency)}
            </p>
          </div>
        </div>
      )}

      {!isExport && (
        <p className="text-xs text-status-warning-foreground bg-status-warning-subtle border border-status-warning/20 rounded-lg px-3 py-2">
          IMPORT proformas use a payment voucher flow — receipt recording is disabled here.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
          {success}
        </div>
      )}

      {isExport && (summary?.outstanding_for_new ?? 0) > 0 && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border-subtle pt-4">
          <label className="text-xs text-text-secondary space-y-1">
            <span>Amount</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary"
              required
            />
          </label>
          <label className="text-xs text-text-secondary space-y-1">
            <span>Receipt date</span>
            <input
              type="date"
              value={receiptDate}
              onChange={(e) => setReceiptDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary"
              required
            />
          </label>
          <label className="text-xs text-text-secondary space-y-1">
            <span>Bank account</span>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary"
              required
            >
              <option value="">Select bank…</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id} disabled={!b.gl_account_id}>
                  {b.account_name} ({b.bank_name}){!b.gl_account_id ? " — no GL" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary space-y-1">
            <span>Receivable ledger</span>
            <select
              value={receivableLedgerId}
              onChange={(e) => setReceivableLedgerId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary"
              required
            >
              <option value="">Select AR account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number || a.id} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary space-y-1">
            <span>Currency</span>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary"
              maxLength={10}
            />
          </label>
          <label className="text-xs text-text-secondary space-y-1">
            <span>Exchange rate to base</span>
            <input
              type="number"
              step="0.000001"
              min="0.000001"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary"
              required
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {submitting ? "Recording…" : "Record Payment"}
            </button>
          </div>
        </form>
      )}

      {summary && summary.allocations.length > 0 && (
        <div className="border-t border-border-subtle pt-3">
          <h3 className="text-xs font-semibold text-text-muted mb-2">Receipt history</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted border-b border-border-subtle">
                  <th className="py-1.5 pr-3 font-medium">Voucher</th>
                  <th className="py-1.5 pr-3 font-medium">Amount</th>
                  <th className="py-1.5 pr-3 font-medium">Base</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {summary.allocations.map((row) => (
                  <tr key={row.id} className="border-b border-border-subtle/60 text-text-secondary">
                    <td className="py-1.5 pr-3">
                      <Link
                        to={`/app/accounts/vouchers/${row.voucher_id}`}
                        className="text-accent-secondary hover:underline"
                      >
                        {row.voucher_number || `#${row.voucher_id}`}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{money(row.allocated_amount, row.currency)}</td>
                    <td className="py-1.5 pr-3">{money(row.allocated_base_amount)}</td>
                    <td className="py-1.5 pr-3">
                      {row.status}
                      {row.voucher_status ? ` / ${row.voucher_status}` : ""}
                    </td>
                    <td className="py-1.5">{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
