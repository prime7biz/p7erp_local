import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type MisHealthResponse,
  type PartyLedgerAllocationResponse,
  type PartyLedgerAgingResponse,
  type PartyLedgerBillResponse,
  type PartyLedgerResponse,
  type PartyLedgerStatementResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { BillAllocationModal } from "./BillAllocationModal";
import { logApiError } from "@/utils/logApiError";

type Tab = "bills" | "statement" | "aging" | "allocations";

export function PartyLedgerDetailPage() {
  const { id } = useParams();
  const ledgerId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "bills";

  const [ledger, setLedger] = useState<PartyLedgerResponse | null>(null);
  const [bills, setBills] = useState<PartyLedgerBillResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [statement, setStatement] = useState<PartyLedgerStatementResponse | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [aging, setAging] = useState<PartyLedgerAgingResponse | null>(null);
  const [allocations, setAllocations] = useState<PartyLedgerAllocationResponse[]>([]);
  const [allocBill, setAllocBill] = useState<PartyLedgerBillResponse | null>(null);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [misHealth, setMisHealth] = useState<MisHealthResponse | null>(null);

  const setTab = (t: Tab) => {
    setSearchParams({ tab: t });
  };

  async function loadLedger() {
    if (!Number.isFinite(ledgerId)) return;
    try {
      setError("");
      setLedger(await api.getPartyLedger(ledgerId));
    } catch (e) {
      logApiError("PartyLedgerDetailPage.loadLedger", e);
      setError((e as Error).message);
    }
  }

  async function loadBills() {
    try {
      const res = await api.listPartyLedgerBills(ledgerId, {
        status: statusFilter || undefined,
      });
      setBills(res.items);
    } catch (e) {
      logApiError("PartyLedgerDetailPage.loadBills", e);
      setError((e as Error).message);
    }
  }

  async function loadStatement() {
    try {
      setStatement(await api.getPartyLedgerStatement(ledgerId, { from_date: fromDate, to_date: toDate }));
    } catch (e) {
      logApiError("PartyLedgerDetailPage.loadStatement", e);
      setError((e as Error).message);
    }
  }

  async function loadAging() {
    try {
      setAging(await api.getPartyLedgerAging({ party_ledger_id: ledgerId }));
    } catch (e) {
      logApiError("PartyLedgerDetailPage.loadAging", e);
      setError((e as Error).message);
    }
  }

  async function loadAllocations() {
    try {
      setAllocations(await api.listPartyLedgerAllocations(ledgerId));
    } catch (e) {
      logApiError("PartyLedgerDetailPage.loadAllocations", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void loadLedger();
  }, [ledgerId]);

  useEffect(() => {
    if (ledger?.party_type !== "CUSTOMER") return;
    void api
      .getMisHealth()
      .then(setMisHealth)
      .catch((e) => logApiError("PartyLedgerDetailPage.misHealth", e));
  }, [ledger?.party_type]);

  useEffect(() => {
    if (tab === "bills") void loadBills();
    if (tab === "statement") void loadStatement();
    if (tab === "aging") void loadAging();
    if (tab === "allocations") void loadAllocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ledgerId, statusFilter, fromDate, toDate]);

  const partyAging = useMemo(
    () => aging?.parties.find((p) => p.party_ledger_id === ledgerId) ?? null,
    [aging, ledgerId],
  );

  if (!Number.isFinite(ledgerId)) {
    return <p className="p-4 text-sm text-red-600">Invalid party ledger id</p>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title={ledger?.party_name ?? "Party Ledger"}
        description={ledger ? `${ledger.party_type} · Ledger #${ledger.id}` : "Loading…"}
        actions={
          <Link to="/app/finance/party-ledgers" className="text-sm text-blue-600 hover:underline">
            Back to list
          </Link>
        }
      />

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {ledger?.party_type === "CUSTOMER" &&
      misHealth?.enabled &&
      misHealth.receivables_turnover?.value != null ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Company receivables turnover (MIS):{" "}
          <span className="font-medium text-gray-800">
            {misHealth.receivables_turnover.value.toFixed(2)}×
          </span>
          {misHealth.receivables_turnover.status ? (
            <span className="ml-1 text-gray-500">({misHealth.receivables_turnover.status})</span>
          ) : null}
          {" · "}
          <Link to="/app/finance/mis/ratios" className="text-blue-600 hover:underline">
            MIS ratios
          </Link>
        </p>
      ) : null}

      {ledger ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">Current balance</p>
            <p
              className={`text-xl font-semibold ${
                ledger.current_balance_type === "DR" ? "text-red-600" : "text-green-700"
              }`}
            >
              {ledger.current_balance} {ledger.current_balance_type}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">Credit limit</p>
            <p className="text-lg font-medium">{ledger.credit_limit ?? "—"}</p>
            <p className="text-xs text-gray-500">Available {ledger.available_credit ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">Overdue</p>
            <p className="text-lg font-medium text-red-600">{ledger.overdue_amount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">Bills</p>
            <p className="text-sm text-gray-700">
              Pending {ledger.bill_summary?.PENDING ?? 0} · Partial {ledger.bill_summary?.PARTIAL ?? 0} · Overdue{" "}
              {ledger.bill_summary?.OVERDUE ?? 0}
            </p>
          </div>
          {ledger.tds_section_id != null ? (
            <div className="rounded-lg border border-gray-200 bg-white p-3 sm:col-span-4">
              <p className="text-xs text-gray-500">TDS section</p>
              <p className="text-sm text-gray-800">
                Section ID {ledger.tds_section_id}{" "}
                <Link to="/app/finance/tds" className="text-blue-600 hover:underline">
                  Manage in TDS Settings
                </Link>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {(["bills", "statement", "aging", "allocations"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              tab === t ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "bills" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIAL">Partial</option>
              <option value="SETTLED">Settled</option>
              <option value="OVERDUE">Overdue</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            {ledger?.party_type === "CUSTOMER" ? (
              <Link
                to="/app/finance/credit-notes/new"
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                New credit note
              </Link>
            ) : null}
            {ledger?.party_type === "VENDOR" ? (
              <Link
                to="/app/finance/debit-notes/new"
                className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                New debit note
              </Link>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Bill #</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Original</th>
                  <th className="px-3 py-2">Pending</th>
                  <th className="px-3 py-2">Settled</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Interest</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium">{b.bill_number}</td>
                    <td className="px-3 py-2">{b.bill_date}</td>
                    <td className="px-3 py-2">{b.bill_type}</td>
                    <td className="px-3 py-2">
                      {b.original_amount} {b.amount_type}
                    </td>
                    <td className="px-3 py-2">{b.pending_amount}</td>
                    <td className="px-3 py-2">{b.settled_amount}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          b.status === "SETTLED"
                            ? "bg-green-100 text-green-800"
                            : b.status === "OVERDUE"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {b.due_date}
                      {b.days_overdue != null ? (
                        <span className="ml-1 text-xs text-gray-500">({b.days_overdue}d)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {Number(b.interest_accrued) > 0 ? b.interest_accrued : "—"}
                    </td>
                    <td className="relative px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => setOpenActionsId(openActionsId === b.id ? null : b.id)}
                      >
                        Actions
                      </button>
                      {openActionsId === b.id ? (
                        <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          {b.voucher_id ? (
                            <Link
                              to={`/app/accounts/vouchers/${b.voucher_id}`}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              View voucher
                            </Link>
                          ) : null}
                          {b.status !== "SETTLED" && b.status !== "CANCELLED" ? (
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setAllocBill(b);
                                setOpenActionsId(null);
                              }}
                            >
                              Allocate payment
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                      No bills
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "statement" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => void loadStatement()}
            >
              Refresh
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => window.print()}
            >
              Print
            </button>
          </div>
          {statement ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2">Narration</th>
                    <th className="px-3 py-2">Debit</th>
                    <th className="px-3 py-2">Credit</th>
                    <th className="px-3 py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t bg-gray-50 font-medium">
                    <td className="px-3 py-2" colSpan={3}>
                      Opening
                    </td>
                    <td className="px-3 py-2" colSpan={3}>
                      {statement.opening_balance} {statement.opening_balance_type}
                    </td>
                  </tr>
                  {statement.transactions.map((t, i) => (
                    <tr key={`${t.bill_number}-${i}`} className="border-t border-gray-100">
                      <td className="px-3 py-2">{t.date}</td>
                      <td className="px-3 py-2">{t.bill_number}</td>
                      <td className="px-3 py-2">{t.narration}</td>
                      <td className="px-3 py-2">{t.debit}</td>
                      <td className="px-3 py-2">{t.credit}</td>
                      <td className="px-3 py-2">
                        {t.balance} {t.balance_type}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-gray-50 font-medium">
                    <td className="px-3 py-2" colSpan={3}>
                      Closing
                    </td>
                    <td className="px-3 py-2" colSpan={3}>
                      {statement.closing_balance} {statement.closing_balance_type}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "aging" ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Not due</th>
                <th className="px-3 py-2">1–30</th>
                <th className="px-3 py-2">31–60</th>
                <th className="px-3 py-2">61–90</th>
                <th className="px-3 py-2">90+</th>
                <th className="px-3 py-2">Total overdue</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2">{partyAging?.not_due ?? aging?.grand_total.not_due ?? "0"}</td>
                <td className="px-3 py-2">{partyAging?.days_1_30 ?? "0"}</td>
                <td className="px-3 py-2">{partyAging?.days_31_60 ?? "0"}</td>
                <td className="px-3 py-2">{partyAging?.days_61_90 ?? "0"}</td>
                <td className="px-3 py-2">{partyAging?.days_91_plus ?? "0"}</td>
                <td className="px-3 py-2 font-medium text-red-600">
                  {partyAging?.total_overdue ?? "0"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "allocations" ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Bill #</th>
                <th className="px-3 py-2">Voucher #</th>
                <th className="px-3 py-2">Allocated</th>
                <th className="px-3 py-2">Balance after</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{a.allocated_date}</td>
                  <td className="px-3 py-2">{a.bill_number}</td>
                  <td className="px-3 py-2">{a.voucher_number ?? a.voucher_id}</td>
                  <td className="px-3 py-2">{a.allocated_amount}</td>
                  <td className="px-3 py-2">{a.bill_balance_after}</td>
                  <td className="px-3 py-2">{a.notes}</td>
                </tr>
              ))}
              {allocations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    No allocations
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {allocBill ? (
        <BillAllocationModal
          ledgerId={ledgerId}
          bill={allocBill}
          onClose={() => setAllocBill(null)}
          onAllocated={() => {
            void loadBills();
            void loadLedger();
          }}
        />
      ) : null}
    </div>
  );
}
