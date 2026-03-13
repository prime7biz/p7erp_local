import { FormEvent, useEffect, useState } from "react";
import { api, type AccountingPeriodCreate, type AccountingPeriodResponse } from "@/api/client";

export function AccountingPeriodsPage() {
  const [rows, setRows] = useState<AccountingPeriodResponse[]>([]);
  const [error, setError] = useState("");
  const [lockDate, setLockDate] = useState(new Date().toISOString().slice(0, 10));
  const [lockInfo, setLockInfo] = useState<{ locked: boolean; reason?: string; period_id?: number; period_name?: string } | null>(null);
  const [form, setForm] = useState<AccountingPeriodCreate>({
    period_name: "",
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    try {
      setError("");
      setRows(await api.listAccountingPeriods());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!form.period_name.trim()) throw new Error("Period name is required");
      await api.createAccountingPeriod(form);
      setForm((p) => ({ ...p, period_name: "" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function closePeriod(id: number) {
    try {
      await api.closeAccountingPeriod(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reopenPeriod(id: number) {
    try {
      await api.reopenAccountingPeriod(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deletePeriod(id: number) {
    try {
      await api.deleteAccountingPeriod(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function checkLock() {
    try {
      setError("");
      setLockInfo(await api.checkAccountingPeriodLock(lockDate));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Accounting Periods</h1>
        <p className="text-sm text-slate-500">Posting is blocked when a voucher date is outside any open period.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Period name (e.g. Mar-2026)" value={form.period_name} onChange={(e) => setForm((p) => ({ ...p, period_name: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.end_date} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Create Period</button>
      </form>

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input type="date" className="rounded border px-3 py-2 text-sm" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
        <button className="rounded border px-3 py-2 text-sm" onClick={() => void checkLock()}>
          Check Date Lock
        </button>
        <div className="md:col-span-2 rounded border bg-slate-50 px-3 py-2 text-sm">
          {lockInfo ? (lockInfo.locked ? `Locked: ${lockInfo.reason ?? "Period closed"}` : `Open: ${lockInfo.period_name ?? "Available period"}`) : "No check yet."}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Start</th>
              <th className="px-2 py-1">End</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.period_name}</td>
                <td className="px-2 py-1">{r.start_date}</td>
                <td className="px-2 py-1">{r.end_date}</td>
                <td className="px-2 py-1">{r.is_closed ? "CLOSED" : "OPEN"}</td>
                <td className="px-2 py-1">
                  <div className="flex gap-2">
                    {!r.is_closed ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void closePeriod(r.id)}>
                        Close
                      </button>
                    ) : (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void reopenPeriod(r.id)}>
                        Reopen
                      </button>
                    )}
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void deletePeriod(r.id)}>
                      Delete
                    </button>
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
