import { FormEvent, useState } from "react";
import { api, type PartyLedgerBillResponse, type PartyLedgerAllocationResponse } from "@/api/client";

type Props = {
  ledgerId: number;
  bill: PartyLedgerBillResponse;
  onClose: () => void;
  onAllocated: () => void;
};

export function BillAllocationModal({ ledgerId, bill, onClose, onAllocated }: Props) {
  const [voucherId, setVoucherId] = useState("");
  const [amount, setAmount] = useState(bill.pending_amount);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const vid = Number(voucherId);
    if (!Number.isFinite(vid) || vid <= 0) {
      setError("Enter a valid voucher ID (posted RECEIPT or PAYMENT).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.allocatePartyLedgerBill(ledgerId, bill.id, {
        voucher_id: vid,
        allocated_amount: amount,
        notes: notes || undefined,
        allocated_date: date,
      });
      onAllocated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Allocate payment</h3>
            <p className="text-xs text-gray-500">
              Bill {bill.bill_number} · Pending {bill.pending_amount} {bill.amount_type}
            </p>
          </div>
          <button type="button" className="text-sm text-gray-500 hover:text-gray-800" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            Voucher ID
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={voucherId}
              onChange={(e) => setVoucherId(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Amount
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Notes
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Allocate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export type { PartyLedgerAllocationResponse };
