import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type AccountingPeriodCreate, type AccountingPeriodResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function AccountingPeriodsPage() {
  const [rows, setRows] = useState<AccountingPeriodResponse[]>([]);
  const [error, setError] = useState("");
  const [lockDate, setLockDate] = useState(new Date().toISOString().slice(0, 10));
  const [lockInfo, setLockInfo] = useState<{ locked: boolean; reason?: string; period_id?: number; period_name?: string } | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountingPeriodCreate>({
    period_name: "",
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [rows]);

  async function load() {
    try {
      setError("");
      setRows(await api.listAccountingPeriods());
    } catch (e) {
      logApiError("AccountingPeriodsPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!form.period_name.trim()) throw new Error("Period name is required");
      await api.createAccountingPeriod(form);
      setForm((p) => ({ ...p, period_name: "" }));
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.createAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function closePeriod(id: number) {
    try {
      await api.closeAccountingPeriod(id);
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.closeAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function reopenPeriod(id: number) {
    try {
      await api.reopenAccountingPeriod(id);
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.reopenAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function deletePeriod(id: number) {
    try {
      await api.deleteAccountingPeriod(id);
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.deleteAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function checkLock() {
    try {
      setError("");
      setLockInfo(await api.checkAccountingPeriodLock(lockDate));
    } catch (e) {
      logApiError("AccountingPeriodsPage.checkAccountingPeriodLock", e);
      setError((e as Error).message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Accounting Periods</h1>
        <p className="text-sm text-text-muted">Posting is blocked when a voucher date is outside any open period.</p>
      </div>
      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      {sorted.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Timeline</h2>
          <div className="flex flex-wrap gap-2">
            {sorted.map((r) => {
              const isFuture = r.start_date > today;
              return (
                <div
                  key={r.id}
                  className={`min-w-[8rem] rounded-lg border px-3 py-2 text-xs ${
                    r.is_closed ? "border-border bg-surface-subtle text-text-muted" : isFuture ? "border-dashed border-border text-text-secondary" : "border-status-success/40 bg-status-success-subtle"
                  }`}
                  title={`${r.start_date} → ${r.end_date}`}
                >
                  <div className="font-semibold text-text-primary">{r.period_name}</div>
                  <div className="mt-0.5">{r.is_closed ? "Closed" : isFuture ? "Future" : "Open"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Period name (e.g. Mar-2026)" value={form.period_name} onChange={(e) => setForm((p) => ({ ...p, period_name: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
        <button className="rounded bg-brand-primary px-3 py-2 text-sm text-brand-primary-foreground">Create Period</button>
      </form>

      <div className="grid gap-2 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-4">
        <input type="date" className="rounded border px-3 py-2 text-sm" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void checkLock()}>
          Check Date Lock
        </button>
        <div className="md:col-span-2 rounded border bg-surface-subtle px-3 py-2 text-sm">
          {lockInfo ? (lockInfo.locked ? `Locked: ${lockInfo.reason ?? "Period closed"}` : `Open: ${lockInfo.period_name ?? "Available period"}`) : "No check yet."}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Start</th>
              <th className="px-2 py-1">End</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.period_name}</td>
                <td className="px-2 py-1">{r.start_date}</td>
                <td className="px-2 py-1">{r.end_date}</td>
                <td className="px-2 py-1">{r.is_closed ? "CLOSED" : "OPEN"}</td>
                <td className="px-2 py-1 text-right">
                  <div className="relative inline-block text-left">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((id) => (id === r.id ? null : r.id));
                      }}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id && (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        {!r.is_closed ? (
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              void closePeriod(r.id);
                            }}
                          >
                            Close
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              void reopenPeriod(r.id);
                            }}
                          >
                            Reopen
                          </button>
                        )}
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            void deletePeriod(r.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
