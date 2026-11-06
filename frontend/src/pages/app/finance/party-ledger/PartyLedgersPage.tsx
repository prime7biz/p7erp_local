import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PartyLedgerResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";

export function PartyLedgersPage() {
  const [rows, setRows] = useState<PartyLedgerResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [partyType, setPartyType] = useState("");
  const [search, setSearch] = useState("");
  const [balanceType, setBalanceType] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // Typing in the search box does not reload; the list reloads on submit or when a filter changes.
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setError("");
      const res = await api.listPartyLedgers({
        party_type: partyType || undefined,
        search: searchRef.current.trim() || undefined,
        balance_type: balanceType || undefined,
        overdue_only: overdueOnly || undefined,
        page_size: 100,
      });
      if (!latest.isCurrent(token)) return;
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      logApiError("PartyLedgersPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, partyType, balanceType, overdueOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(ev.target as Node)) {
        setOpenActionsId(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    void load();
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Party Ledgers"
        description="Bill-wise AR/AP balances by customer and vendor"
        actions={
          <Link
            to="/app/finance/party-ledgers/new"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create Party Ledger
          </Link>
        }
      />

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Party type
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={partyType}
            onChange={(e) => setPartyType(e.target.value)}
          >
            <option value="">All</option>
            <option value="CUSTOMER">Customer</option>
            <option value="VENDOR">Vendor</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Balance
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={balanceType}
            onChange={(e) => setBalanceType(e.target.value)}
          >
            <option value="">All</option>
            <option value="DR">DR</option>
            <option value="CR">CR</option>
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Search
          <input
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Party name"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Apply
        </button>
        <span className="ml-auto text-xs text-gray-500">{total} parties</span>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Party Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Ledger Account</th>
              <th className="px-3 py-2">Current Balance</th>
              <th className="px-3 py-2">Credit Limit</th>
              <th className="px-3 py-2">Available</th>
              <th className="px-3 py-2">Overdue</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-900">{r.party_name}</td>
                <td className="px-3 py-2">{r.party_type}</td>
                <td className="px-3 py-2 text-gray-600">
                  {r.ledger_account_number} {r.ledger_account_name}
                </td>
                <td
                  className={`px-3 py-2 font-medium ${
                    r.current_balance_type === "DR" ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {r.current_balance} {r.current_balance_type}
                </td>
                <td className="px-3 py-2">{r.credit_limit ?? "—"}</td>
                <td className="px-3 py-2">{r.available_credit ?? "—"}</td>
                <td className="px-3 py-2">
                  {Number(r.overdue_amount) > 0 ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      {r.overdue_amount}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="relative px-3 py-2">
                  <div ref={openActionsId === r.id ? actionsRef : undefined} className="relative inline-block">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        <Link
                          to={`/app/finance/party-ledgers/${r.id}`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setOpenActionsId(null)}
                        >
                          View
                        </Link>
                        <Link
                          to={`/app/finance/party-ledgers/${r.id}?tab=statement`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setOpenActionsId(null)}
                        >
                          Statement
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                  No party ledgers yet. Create one or enable the feature and post vouchers.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
