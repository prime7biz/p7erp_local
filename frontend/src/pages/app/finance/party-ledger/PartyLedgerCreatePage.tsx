import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type PartyLedgerCreate } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";
import { getCustomersCached, getVendorsCached } from "@/lib/masterData";

type PartyOption = { id: number; label: string };

export function PartyLedgerCreatePage() {
  const navigate = useNavigate();
  const [partyType, setPartyType] = useState<"CUSTOMER" | "VENDOR">("CUSTOMER");
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [partyId, setPartyId] = useState<number | "">("");
  const [creditLimit, setCreditLimit] = useState("");
  const [creditDays, setCreditDays] = useState("30");
  const [interestRate, setInterestRate] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingType, setOpeningType] = useState<"DR" | "CR">("DR");
  const [openingDate, setOpeningDate] = useState(todayLocalISO());
  const [billWise, setBillWise] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadParties() {
      try {
        if (partyType === "CUSTOMER") {
          const rows = await getCustomersCached();
          if (cancelled) return;
          setParties(rows.map((c) => ({ id: c.id, label: `${c.customer_code} — ${c.name}` })));
        } else {
          const rows = await getVendorsCached();
          if (cancelled) return;
          setParties(rows.map((v) => ({ id: v.id, label: `${v.vendor_code} — ${v.name}` })));
        }
        setPartyId("");
      } catch (e) {
        logApiError("PartyLedgerCreatePage.loadParties", e);
        if (!cancelled) setError((e as Error).message);
      }
    }
    void loadParties();
    return () => {
      cancelled = true;
    };
  }, [partyType]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!partyId) {
      setError("Select a party");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body: PartyLedgerCreate = {
        party_type: partyType,
        customer_id: partyType === "CUSTOMER" ? Number(partyId) : null,
        vendor_id: partyType === "VENDOR" ? Number(partyId) : null,
        credit_limit: creditLimit ? creditLimit : null,
        credit_days: Number(creditDays) || 30,
        interest_rate_monthly: interestRate ? interestRate : null,
        opening_balance: openingBalance || "0",
        opening_balance_type: openingType,
        opening_balance_date: openingDate,
        bill_wise_tracking: billWise,
      };
      const created = await api.createPartyLedger(body);
      navigate(`/app/finance/party-ledgers/${created.id}`);
    } catch (err) {
      logApiError("PartyLedgerCreatePage.submit", err);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Create Party Ledger"
        description="Link a customer or vendor to a bill-wise AR/AP ledger"
        actions={
          <Link to="/app/finance/party-ledgers" className="text-sm text-blue-600 hover:underline">
            Back to list
          </Link>
        }
      />
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-800">Party type</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={partyType === "CUSTOMER"}
                onChange={() => setPartyType("CUSTOMER")}
              />
              Customer
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={partyType === "VENDOR"} onChange={() => setPartyType("VENDOR")} />
              Vendor
            </label>
          </div>
        </fieldset>

        <label className="block text-sm">
          Party
          <select
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            value={partyId}
            onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : "")}
            required
          >
            <option value="">Select…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Credit limit
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block text-sm">
            Credit days
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={creditDays}
              onChange={(e) => setCreditDays(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="block text-sm">
            Interest rate (monthly %)
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="block text-sm">
            Opening balance date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Opening balance
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <fieldset className="text-sm">
            <legend className="mb-1">Opening type</legend>
            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2">
                <input type="radio" checked={openingType === "DR"} onChange={() => setOpeningType("DR")} />
                DR
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={openingType === "CR"} onChange={() => setOpeningType("CR")} />
                CR
              </label>
            </div>
          </fieldset>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={billWise} onChange={(e) => setBillWise(e.target.checked)} />
          Enable bill-wise tracking
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create"}
        </button>
      </form>
    </div>
  );
}
