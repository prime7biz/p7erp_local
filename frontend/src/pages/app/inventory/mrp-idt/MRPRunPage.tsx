import { useState } from "react";
import { api, type MrpRunResult, type PlannedOrderResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function MRPRunPage() {
  const [horizon, setHorizon] = useState(90);
  const [orderIds, setOrderIds] = useState("");
  const [result, setResult] = useState<MrpRunResult | null>(null);
  const [planned, setPlanned] = useState<PlannedOrderResponse[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const ids = orderIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const res = await api.runMrp({
        horizon_days: horizon,
        order_ids: ids.length ? ids : null,
      });
      setResult(res);
      setPlanned(res.planned_orders);
    } catch (e) {
      logApiError("MRPRunPage.run", e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadPlanned() {
    try {
      setPlanned(await api.listPlannedOrders());
    } catch (e) {
      logApiError("MRPRunPage.loadPlanned", e);
      setError((e as Error).message);
    }
  }

  async function firmOne(id: number) {
    try {
      await api.firmPlannedOrder(id);
      await loadPlanned();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function releaseOne(id: number) {
    try {
      await api.releasePlannedOrder(id);
      await loadPlanned();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="MRP Run"
        description="Explode BOM demand, net against stock and open POs, generate planned orders"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Horizon (days)
          <input
            type="number"
            className="mt-1 block w-28 rounded-lg border border-gray-300 px-2 py-1.5"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value) || 90)}
          />
        </label>
        <label className="text-sm">
          Order IDs (comma-separated, optional)
          <input
            className="mt-1 block w-64 rounded-lg border border-gray-300 px-2 py-1.5"
            value={orderIds}
            onChange={(e) => setOrderIds(e.target.value)}
            placeholder="e.g. 12,15"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run MRP"}
        </button>
        <button
          type="button"
          onClick={() => void loadPlanned()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Refresh planned
        </button>
      </div>

      {result?.exceptions?.length ? (
        <div className="space-y-1">
          {result.exceptions.map((ex, i) => (
            <p
              key={`${ex.code}-${i}`}
              className={`rounded-lg px-3 py-2 text-sm ${
                ex.severity === "red"
                  ? "border border-red-200 bg-red-50 text-red-800"
                  : "border border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              [{ex.code}] {ex.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Number</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Req date</th>
              <th className="px-3 py-2">Req qty</th>
              <th className="px-3 py-2">Planned</th>
              <th className="px-3 py-2">Release</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {planned.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">{r.planned_order_number}</td>
                <td className="px-3 py-2">{r.item_id}</td>
                <td className="px-3 py-2">{r.requirement_date}</td>
                <td className="px-3 py-2">{r.required_qty}</td>
                <td className="px-3 py-2">{r.planned_qty}</td>
                <td className="px-3 py-2">{r.release_date}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="relative px-3 py-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                  >
                    Actions
                  </button>
                  {openActionsId === r.id ? (
                    <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        onClick={() => {
                          setOpenActionsId(null);
                          void firmOne(r.id);
                        }}
                      >
                        Firm
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                        onClick={() => {
                          setOpenActionsId(null);
                          void releaseOne(r.id);
                        }}
                      >
                        Release
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {!planned.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                  No planned orders yet. Run MRP to generate.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
