import { useEffect, useState } from "react";
import { api, type BtbLcRow } from "@/api/client";

export function BtbLcsPage() {
  const [items, setItems] = useState<BtbLcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listBtbLcs()
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load BTB LCs");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">BTB LCs</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Back-to-back letters of credit for commercial and export finance.
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading BTB LCs…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No data</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="py-2 px-4">LC Number</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Bank</th>
                <th className="py-2 px-4 text-right">Amount</th>
                <th className="py-2 px-4">Maturity</th>
                <th className="py-2 px-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-4 font-medium text-gray-900">{row.reference ?? row.lc_number ?? `#${row.id}`}</td>
                  <td className="py-2 px-4 text-gray-700">{row.status ?? "—"}</td>
                  <td className="py-2 px-4 text-gray-700">{row.bank ?? "—"}</td>
                  <td className="py-2 px-4 text-right text-gray-700">
                    {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.maturity_date ? new Date(row.maturity_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
