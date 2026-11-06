import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type ChartOfAccountResponse,
  type PartyLedgerBillResponse,
  type PartyLedgerResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";
import { addMoney } from "@/lib/money";

export function CreditNoteCreatePage() {
  const navigate = useNavigate();
  const [partyLedgers, setPartyLedgers] = useState<PartyLedgerResponse[]>([]);
  const [bills, setBills] = useState<PartyLedgerBillResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    party_ledger_id: "",
    original_bill_id: "",
    amount: "",
    tax_amount: "0",
    tax_account_id: "",
    revenue_or_purchase_account_id: "",
    voucher_date: todayLocalISO(),
    description: "",
  });

  useEffect(() => {
    void Promise.all([
      api.listPartyLedgers({ page_size: 200 }),
      api.listChartOfAccounts({ active_only: true }),
    ])
      .then(([pl, coa]) => {
        setPartyLedgers(pl.items);
        setAccounts(coa);
      })
      .catch((e) => {
        logApiError("CreditNoteCreatePage.init", e);
        setError((e as Error).message);
      });
  }, []);

  useEffect(() => {
    if (!form.party_ledger_id) {
      setBills([]);
      return;
    }
    let cancelled = false;
    void api
      .listPartyLedgerPendingBills(Number(form.party_ledger_id))
      .then((rows) => {
        if (!cancelled) setBills(rows);
      })
      .catch((e) => {
        logApiError("CreditNoteCreatePage.bills", e);
        if (!cancelled) setBills([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.party_ledger_id]);

  const preview = useMemo(() => {
    const amount = Number(form.amount) || 0;
    const tax = Number(form.tax_amount) || 0;
    return { amount, tax, total: addMoney(amount, tax) };
  }, [form.amount, form.tax_amount]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      const res = await api.createCreditNote({
        party_ledger_id: Number(form.party_ledger_id),
        original_bill_id: Number(form.original_bill_id),
        amount: form.amount,
        tax_amount: form.tax_amount || "0",
        tax_account_id: form.tax_account_id ? Number(form.tax_account_id) : null,
        revenue_or_purchase_account_id: Number(form.revenue_or_purchase_account_id),
        voucher_date: form.voucher_date,
        description: form.description || "Credit note",
      });
      navigate(`/app/accounts/vouchers?edit=${res.id}`);
    } catch (err) {
      logApiError("CreditNoteCreatePage.submit", err);
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Create Credit Note"
        description="Issue a credit note against an original party bill."
        actions={
          <Link to="/app/finance/party-ledgers" className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            Party ledgers
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="grid max-w-3xl gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <label className="text-xs text-gray-600 sm:col-span-2">
          Party ledger
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.party_ledger_id}
            onChange={(e) => setForm((p) => ({ ...p, party_ledger_id: e.target.value, original_bill_id: "" }))}
            required
          >
            <option value="">Select party…</option>
            {partyLedgers.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.party_name} ({pl.party_type})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 sm:col-span-2">
          Original bill
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.original_bill_id}
            onChange={(e) => setForm((p) => ({ ...p, original_bill_id: e.target.value }))}
            required
            disabled={!form.party_ledger_id}
          >
            <option value="">Select bill…</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bill_number} — pending {b.pending_amount} ({b.bill_date ?? "no date"})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Voucher date
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.voucher_date}
            onChange={(e) => setForm((p) => ({ ...p, voucher_date: e.target.value }))}
            required
          />
        </label>
        <label className="text-xs text-gray-600">
          Amount
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            required
          />
        </label>
        <label className="text-xs text-gray-600">
          Tax amount
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.tax_amount}
            onChange={(e) => setForm((p) => ({ ...p, tax_amount: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          Tax account
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.tax_account_id}
            onChange={(e) => setForm((p) => ({ ...p, tax_account_id: e.target.value }))}
          >
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 sm:col-span-2">
          Revenue / purchase account
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.revenue_or_purchase_account_id}
            onChange={(e) => setForm((p) => ({ ...p, revenue_or_purchase_account_id: e.target.value }))}
            required
          >
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600 sm:col-span-2">
          Description
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </label>

        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Preview totals</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Amount</span>
              <p className="font-medium tabular-nums">{preview.amount.toFixed(4)}</p>
            </div>
            <div>
              <span className="text-gray-500">Tax</span>
              <p className="font-medium tabular-nums">{preview.tax.toFixed(4)}</p>
            </div>
            <div>
              <span className="text-gray-500">Total</span>
              <p className="font-semibold tabular-nums text-gray-900">{preview.total.toFixed(4)}</p>
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create credit note"}
          </button>
        </div>
      </form>
    </div>
  );
}
