import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ReorderSuggestionResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function ReorderSuggestionsPage() {
  const [rows, setRows] = useState<ReorderSuggestionResponse[]>([]);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      setError("");
      setRows(await api.listReorderSuggestions());
    } catch (e) {
      logApiError("ReorderSuggestionsPage.load", e);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkAll() {
    try {
      await api.checkReorderAll();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pending = rows.filter((r) => r.status === "PENDING" || r.status === "APPROVED");

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Reorder Suggestions"
        description="Only items with Auto Reorder enabled generate suggestions"
        actions={
          <button
            type="button"
            onClick={() => void checkAll()}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
          >
            Check all stock
          </button>
        }
      />
      {pending.length ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pending.length} item(s) below reorder point
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
          onClick={() =>
            void (async () => {
              try {
                await api.bulkConvertReorderSuggestions(selected);
                setSelected([]);
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            })()
          }
          disabled={!selected.length}
        >
          Create POs for selected
        </button>
        <Link to="/app/inventory/items" className="text-xs text-slate-600 underline">
          Item master (planning)
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2" />
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Suggested</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Est. cost</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-2">{r.item_id}</td>
                <td className="px-3 py-2">{r.current_stock}</td>
                <td className="px-3 py-2">{r.reorder_level}</td>
                <td className="px-3 py-2">{r.suggested_qty}</td>
                <td className="px-3 py-2">{r.preferred_vendor_id ?? "—"}</td>
                <td className="px-3 py-2">{r.estimated_cost ?? "—"}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="relative px-3 py-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50"
                    onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                  >
                    Actions
                  </button>
                  {openActionsId === r.id ? (
                    <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        onClick={() => {
                          setOpenActionsId(null);
                          void api.approveReorderSuggestion(r.id).then(load);
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        onClick={() => {
                          setOpenActionsId(null);
                          void api.convertReorderSuggestion(r.id).then(load).catch((e) => setError((e as Error).message));
                        }}
                      >
                        Approve &amp; Create PO
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setOpenActionsId(null);
                          void api.rejectReorderSuggestion(r.id).then(load);
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  No suggestions. Click Check all stock.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
