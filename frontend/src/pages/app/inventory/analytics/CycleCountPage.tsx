import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CycleCountTask } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function CycleCountPage() {
  const [tasks, setTasks] = useState<CycleCountTask[]>([]);
  const [history, setHistory] = useState<CycleCountTask[]>([]);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [today, hist] = await Promise.all([
        api.listCycleCountSchedule({ generate: true }),
        api.listCycleCountSchedule({ history_days: 90 }),
      ]);
      setTasks(today);
      setHistory(hist.filter((t) => t.status === "COMPLETED" || t.status === "VARIANCE"));
      const draft: Record<number, string> = {};
      for (const t of today) {
        draft[t.id] = t.counted_qty ?? t.system_qty;
      }
      setCounts(draft);
    } catch (e) {
      logApiError("CycleCountPage.load", e);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function submit(task: CycleCountTask) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.submitCycleCount(task.id, {
        counted_qty: counts[task.id] ?? task.system_qty,
      });
      setSuccess(
        res.adjustment_suggested
          ? `Variance recorded for ${res.item_code}. Adjustment suggested.`
          : `Count completed for ${res.item_code}.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generateAll() {
    setBusy(true);
    try {
      await api.generateCycleCountSchedule({ force_all_due: true, frequency: "ALL" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Cycle Counting"
        description="ABC-based schedule — A weekly, B monthly, C quarterly"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generateAll()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Generate all due (force)
        </button>
        <Link to="/app/inventory/stock-adjustments" className="text-sm text-slate-700 underline self-center">
          Stock adjustments
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Warehouse</th>
              <th className="px-3 py-2">ABC</th>
              <th className="px-3 py-2 text-right">System qty</th>
              <th className="px-3 py-2 text-right">Counted qty</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  No tasks for today. Enable <code>cycle_counting_enabled</code> and generate.
                </td>
              </tr>
            ) : (
              tasks.map((t) => {
                const counted = Number(counts[t.id] ?? 0);
                const system = Number(t.system_qty);
                const variance = counted - system;
                return (
                  <tr key={t.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      {t.item_code} — {t.item_name}
                      <div className="text-xs text-gray-500">{t.status}</div>
                    </td>
                    <td className="px-3 py-2">{t.warehouse_name ?? t.warehouse_id}</td>
                    <td className="px-3 py-2">{t.abc_class ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{t.system_qty}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        className="w-24 rounded border border-gray-300 px-2 py-1 text-right"
                        value={counts[t.id] ?? ""}
                        disabled={t.status === "COMPLETED"}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${
                        Math.abs(variance) > 0.0001 ? "text-amber-800 font-medium" : ""
                      }`}
                    >
                      {variance.toFixed(4)}
                    </td>
                    <td className="relative px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId((v) => (v === t.id ? null : t.id));
                        }}
                      >
                        Actions
                      </button>
                      {openActionsId === t.id ? (
                        <div
                          className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            disabled={busy || t.status === "COMPLETED"}
                            onClick={() => {
                              setOpenActionsId(null);
                              void submit(t);
                            }}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => {
                              setOpenActionsId(null);
                              setCounts((prev) => ({ ...prev, [t.id]: t.system_qty }));
                            }}
                          >
                            Re-count (reset)
                          </button>
                          {t.adjustment_suggested || Math.abs(variance) > 0.0001 ? (
                            <Link
                              to={
                                t.adjustment_href ||
                                `/app/inventory/stock-adjustments?item_id=${t.item_id}&warehouse_id=${t.warehouse_id}`
                              }
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => setOpenActionsId(null)}
                            >
                              Create adjustment
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">History (90 days)</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 50).map((t) => (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="px-3 py-1.5">{t.scheduled_date}</td>
                  <td className="px-3 py-1.5">{t.item_code}</td>
                  <td className="px-3 py-1.5">{t.status}</td>
                  <td className="px-3 py-1.5 text-right">{t.variance_qty ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
