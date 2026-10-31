import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PartyLedgerResponse } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

type Props = {
  partyType: "CUSTOMER" | "VENDOR";
  partyId: number | null | undefined;
  title?: string;
};

/** Compact party ledger summary for Order / CI / Vendor Bill pages. */
export function PartyLedgerSummaryCard({ partyType, partyId, title = "Party Ledger" }: Props) {
  const { me } = useAuth();
  const enabled = me?.feature_flags?.party_ledger_enabled === true;
  const [row, setRow] = useState<PartyLedgerResponse | null>(null);

  useEffect(() => {
    if (!enabled || !partyId) {
      setRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getPartyLedgerByParty(partyType, partyId);
        if (!cancelled) setRow(res);
      } catch (e) {
        logApiError("PartyLedgerSummaryCard", e);
        if (!cancelled) setRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, partyType, partyId]);

  if (!enabled || !partyId) return null;
  if (!row) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        <p className="font-medium text-gray-800">{title}</p>
        <p className="mt-1 text-xs text-gray-500">No party ledger yet for this {partyType.toLowerCase()}.</p>
        <Link to="/app/finance/party-ledgers/new" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
          Create ledger
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
      <p className="font-medium text-gray-800">{title}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          row.current_balance_type === "DR" ? "text-red-600" : "text-green-700"
        }`}
      >
        {row.current_balance} {row.current_balance_type}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Overdue {row.overdue_amount}
        {row.credit_limit ? ` · Limit ${row.credit_limit}` : ""}
      </p>
      <Link
        to={`/app/finance/party-ledgers/${row.id}`}
        className="mt-2 inline-block text-xs text-blue-600 hover:underline"
      >
        View ledger
      </Link>
    </div>
  );
}
