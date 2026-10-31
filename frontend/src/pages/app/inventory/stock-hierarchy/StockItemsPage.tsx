import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type StockGroupResponse,
  type StockItemListRow,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { downloadCsv } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";

export function StockItemsPage() {
  const [rows, setRows] = useState<StockItemListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<StockGroupResponse[]>([]);
  const [groupId, setGroupId] = useState("");
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [expiryNearing, setExpiryNearing] = useState(false);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setError("");
      const res = await api.listStockItemsEnhanced({
        group_id: groupId ? Number(groupId) : undefined,
        search: search.trim() || undefined,
        low_stock: lowStock || undefined,
        expiry_nearing: expiryNearing || undefined,
        page_size: 100,
      });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      logApiError("StockItemsPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void api
      .listStockGroups()
      .then(setGroups)
      .catch((e) => logApiError("StockItemsPage.groups", e));
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, lowStock, expiryNearing]);

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

  function exportCsv() {
    const header = ["Code", "Name", "Group", "Unit", "Current Stock", "Avg Cost", "Standard Price"];
    const lines = rows.map((r) =>
      [
        r.item_code,
        r.name,
        r.stock_group_name ?? "",
        r.base_unit ?? "",
        r.current_stock,
        r.avg_cost,
        r.standard_price ?? "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    downloadCsv([header.join(","), ...lines].join("\n"), "stock_items");
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Stock Items"
        description="Items by stock group with stock, cost, and expiry filters"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Export Excel (CSV)
            </button>
            <Link
              to="/app/inventory/items"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Stock Master
            </Link>
          </div>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form
        onSubmit={onSearch}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
      >
        <label className="text-xs text-gray-600">
          Group
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.group_code} — {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Search
          <input
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
          Low stock
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={expiryNearing}
            onChange={(e) => setExpiryNearing(e.target.checked)}
          />
          Expiry nearing
        </label>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Apply
        </button>
        <span className="ml-auto text-xs text-gray-500">{total} items</span>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Group</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 text-right">Current Stock</th>
              <th className="px-3 py-2 text-right">Avg Cost</th>
              <th className="px-3 py-2 text-right">Standard Price</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{r.item_code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-gray-600">{r.stock_group_name ?? "—"}</td>
                <td className="px-3 py-2">{r.base_unit ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.current_stock}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.avg_cost}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.standard_price ?? "—"}</td>
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
                          to={`/app/inventory/stock-items/${r.id}`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setOpenActionsId(null)}
                        >
                          View
                        </Link>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                  No stock items found. Enable stock hierarchy and assign items to groups.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
