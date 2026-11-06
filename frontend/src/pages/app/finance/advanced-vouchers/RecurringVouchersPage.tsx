import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type RecurringFrequency,
  type RecurringVoucherHistoryRow,
  type RecurringVoucherResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";

const FREQUENCIES: RecurringFrequency[] = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"];

type LineDraft = { account_id: string; entry_type: "DEBIT" | "CREDIT"; amount: string; notes: string };

export function RecurringVouchersPage() {
  const [rows, setRows] = useState<RecurringVoucherResponse[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [historyRows, setHistoryRows] = useState<RecurringVoucherHistoryRow[] | null>(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState({
    name: "",
    voucher_type: "JOURNAL",
    frequency: "MONTHLY" as RecurringFrequency,
    start_date: todayLocalISO(),
    end_date: "",
    description: "",
    generate_as_status: "DRAFT" as "DRAFT" | "POSTED",
  });
  const [lines, setLines] = useState<LineDraft[]>([
    { account_id: "", entry_type: "DEBIT", amount: "", notes: "" },
    { account_id: "", entry_type: "CREDIT", amount: "", notes: "" },
  ]);

  async function load() {
    try {
      setError("");
      const [rec, types] = await Promise.all([api.listRecurringVouchers(), api.getVoucherTypesMeta()]);
      setRows(rec.rows);
      setVoucherTypes(types.length ? types : ["JOURNAL"]);
    } catch (e) {
      logApiError("RecurringVouchersPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(ev.target as Node)) {
        setOpenActionsId(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function buildVoucherTemplate() {
    const voucherLines = lines
      .filter((l) => l.account_id && l.amount.trim())
      .map((l) => ({
        account_id: Number(l.account_id),
        entry_type: l.entry_type,
        amount: l.amount,
        notes: l.notes || null,
      }));
    return {
      description: form.description || form.name,
      lines: voucherLines,
    };
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      setSuccess("");
      await api.createRecurringVoucher({
        name: form.name.trim(),
        voucher_type: form.voucher_type,
        frequency: form.frequency,
        start_date: form.start_date,
        end_date: form.end_date || null,
        voucher_template: buildVoucherTemplate(),
        generate_as_status: form.generate_as_status,
        is_active: true,
      });
      setForm((p) => ({ ...p, name: "", description: "" }));
      setSuccess("Recurring template created.");
      await load();
    } catch (err) {
      logApiError("RecurringVouchersPage.create", err);
      setError((err as Error).message);
    }
  }

  async function toggleActive(row: RecurringVoucherResponse) {
    try {
      setOpenActionsId(null);
      await api.updateRecurringVoucher(row.id, {
        name: row.name,
        voucher_type: row.voucher_type,
        voucher_class_id: row.voucher_class_id,
        frequency: row.frequency,
        start_date: row.start_date,
        end_date: row.end_date,
        next_due_date: row.next_due_date,
        voucher_template: row.voucher_template,
        generate_as_status: row.generate_as_status,
        is_active: !row.is_active,
      });
      await load();
    } catch (err) {
      logApiError("RecurringVouchersPage.toggle", err);
      setError((err as Error).message);
    }
  }

  async function generateNow(id: number) {
    try {
      setOpenActionsId(null);
      const res = await api.generateRecurringVoucher(id);
      setSuccess(`Generated voucher ${res.voucher_number}.`);
      await load();
    } catch (err) {
      logApiError("RecurringVouchersPage.generate", err);
      setError((err as Error).message);
    }
  }

  async function viewHistory(row: RecurringVoucherResponse) {
    try {
      setOpenActionsId(null);
      const res = await api.getRecurringVoucherHistory(row.id);
      setHistoryRows(res.rows);
      setHistoryTitle(row.name);
    } catch (err) {
      logApiError("RecurringVouchersPage.history", err);
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this recurring template?")) return;
    try {
      setOpenActionsId(null);
      await api.deleteRecurringVoucher(id);
      await load();
    } catch (err) {
      logApiError("RecurringVouchersPage.delete", err);
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Recurring Vouchers"
        description="Templates that auto-generate vouchers on a schedule."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{success}</p>
      ) : null}

      <form onSubmit={onCreate} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-sm font-medium text-gray-900">New template</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-600">
            Name
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-gray-600">
            Voucher type
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.voucher_type}
              onChange={(e) => setForm((p) => ({ ...p, voucher_type: e.target.value }))}
            >
              {voucherTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Frequency
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.frequency}
              onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as RecurringFrequency }))}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Generate as
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.generate_as_status}
              onChange={(e) =>
                setForm((p) => ({ ...p, generate_as_status: e.target.value as "DRAFT" | "POSTED" }))
              }
            >
              <option value="DRAFT">DRAFT</option>
              <option value="POSTED">POSTED</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Start date
            <input
              type="date"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.start_date}
              onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-gray-600">
            End date
            <input
              type="date"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.end_date}
              onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
            />
          </label>
          <label className="text-xs text-gray-600 lg:col-span-2">
            Description
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">Voucher lines</p>
          {lines.map((ln, idx) => (
            <div key={idx} className="grid gap-2 sm:grid-cols-5">
              <input
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
                placeholder="Account ID"
                value={ln.account_id}
                onChange={(e) => {
                  const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, account_id: e.target.value };
                  setLines(next);
                }}
              />
              <select
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={ln.entry_type}
                onChange={(e) => {
                  const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, entry_type: e.target.value as "DEBIT" | "CREDIT" };
                  setLines(next);
                }}
              >
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">CREDIT</option>
              </select>
              <input
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                placeholder="Amount"
                value={ln.amount}
                onChange={(e) => {
                  const next = [...lines];
                  const cur = next[idx];
                  if (!cur) return;
                  next[idx] = { ...cur, amount: e.target.value };
                  setLines(next);
                }}
              />
              <div className="flex gap-1">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Notes"
                  value={ln.notes}
                  onChange={(e) => {
                    const next = [...lines];
                    const cur = next[idx];
                    if (!cur) return;
                    next[idx] = { ...cur, notes: e.target.value };
                    setLines(next);
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 px-2 text-xs text-red-600 hover:bg-red-50"
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            onClick={() => setLines([...lines, { account_id: "", entry_type: "DEBIT", amount: "", notes: "" }])}
          >
            + Add line
          </button>
        </div>

        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Create template
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2">Next due</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.voucher_type}</td>
                <td className="px-3 py-2">{r.frequency}</td>
                <td className="px-3 py-2">{r.next_due_date}</td>
                <td className="px-3 py-2">{r.is_active ? "Active" : "Disabled"}</td>
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
                      <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => void toggleActive(r)}
                        >
                          {r.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => void generateNow(r.id)}
                        >
                          Generate now
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => void viewHistory(r)}
                        >
                          View history
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                          onClick={() => void remove(r.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  No recurring templates yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {historyRows ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">History — {historyTitle}</h3>
              <button
                type="button"
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                onClick={() => setHistoryRows(null)}
              >
                Close
              </button>
            </div>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-1">Number</th>
                  <th className="px-2 py-1">Date</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <Link to={`/app/accounts/vouchers?edit=${h.id}`} className="text-blue-600 hover:underline">
                        {h.voucher_number}
                      </Link>
                    </td>
                    <td className="px-2 py-1">{h.voucher_date}</td>
                    <td className="px-2 py-1">{h.status}</td>
                  </tr>
                ))}
                {!historyRows.length ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                      No generated vouchers yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
