import type { JobWorkBill, JobWorkContractDetail, JobWorkReceipt } from "@/api/jobWork";
import { jobWorkApi } from "@/api/jobWork";
import { formatMoney } from "@/lib/money";

type Props = {
  detail: JobWorkContractDetail;
  bills: JobWorkBill[];
  receipts: JobWorkReceipt[];
  receiptBillId: number;
  receiptAmount: string;
  cashAccountId: number;
  accounts: Array<{ id: number; label: string }>;
  saving: boolean;
  onReceiptBillId: (id: number) => void;
  onReceiptAmount: (amount: string) => void;
  onCashAccountId: (id: number) => void;
  onAction: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
};

/** CM bill (delivered × rate) and cash/bank receipts against AR. */
export function JobWorkBillingPanel({
  detail,
  bills,
  receipts,
  receiptBillId,
  receiptAmount,
  cashAccountId,
  accounts,
  saving,
  onReceiptBillId,
  onReceiptAmount,
  onCashAccountId,
  onAction,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p>
          Billable qty {detail.billable_qty} · CM {formatMoney(detail.cm_rate)} {detail.currency}
        </p>
        {detail.status !== "CLOSED" && detail.status !== "DRAFT" ? (
          <button
            type="button"
            disabled={saving}
            className="mt-3 rounded-lg bg-brand-primary px-3 py-2 text-white"
            onClick={() =>
              void onAction(
                () =>
                  jobWorkApi.createBill(detail.id, {
                    vat_rate_pct: detail.vat_rate_pct || "0",
                    request_id: `bill-${detail.id}-${Date.now()}`,
                  }),
                "Bill posted",
              )
            }
          >
            Bill remaining CM
          </button>
        ) : null}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="font-medium">Bills</p>
        {bills.map((b) => (
          <div key={b.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
            <span>
              {b.bill_no} · {formatMoney(b.gross_amount)} {b.currency} · {b.status} · received{" "}
              {formatMoney(b.amount_received)}
            </span>
            {b.status !== "CANCELLED" && b.amount_received === "0.00" ? (
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => void onAction(() => jobWorkApi.cancelBill(detail.id, b.id), "Bill cancelled")}
              >
                Cancel bill
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="mb-2 font-medium">Cash / bank receipt</p>
        <div className="flex flex-wrap gap-2">
          <select
            value={receiptBillId}
            onChange={(e) => onReceiptBillId(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-2 py-2"
          >
            {bills
              .filter((b) => b.status === "OPEN" || b.status === "PARTIAL")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bill_no}
                </option>
              ))}
          </select>
          <input
            value={receiptAmount}
            onChange={(e) => onReceiptAmount(e.target.value)}
            placeholder="Amount"
            className="rounded-lg border border-gray-300 px-2 py-2"
          />
          <select
            value={cashAccountId}
            onChange={(e) => onCashAccountId(Number(e.target.value))}
            className="min-w-[200px] rounded-lg border border-gray-300 px-2 py-2"
          >
            <option value={0}>Cash / bank ledger</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving || !receiptBillId || !cashAccountId}
            className="rounded-lg border px-3 py-2"
            onClick={() =>
              void onAction(
                () =>
                  jobWorkApi.createReceipt(detail.id, {
                    bill_id: receiptBillId,
                    amount: receiptAmount,
                    cash_or_bank_account_id: cashAccountId,
                    request_id: `rcpt-${receiptBillId}-${Date.now()}`,
                  }),
                "Receipt posted",
              )
            }
          >
            Post receipt
          </button>
        </div>
        {receipts.map((r) => (
          <p key={r.id} className="mt-2 border-t pt-2">
            {r.receipt_no} · {formatMoney(r.amount)} {r.currency} · {r.status}
          </p>
        ))}
      </div>
    </div>
  );
}
