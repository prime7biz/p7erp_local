import { useCallback, useEffect, useState } from "react";
import { api, type VendorBillDetailResponse, type VendorBillSummary } from "@/api/client";

/**
 * Finance-owned vendor bills (AP) matched to GRN accepted quantities.
 * Route: /app/accounts/vendor-bills
 */
export function VendorBillsPage() {
  const [rows, setRows] = useState<VendorBillSummary[]>([]);
  const [selected, setSelected] = useState<VendorBillDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const list = await api.listVendorBills();
      setRows(list);
    } catch (e) {
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

  async function openDetail(id: number) {
    setError("");
    try {
      const d = await api.getVendorBill(id);
      setSelected(d);
      setInvoiceRef((d.vendor_invoice_ref ?? "").trim());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function approveSelected() {
    if (!selected) return;
    setError("");
    setSuccess("");
    try {
      await api.patchVendorBill(selected.id, { status: "APPROVED" });
      setSuccess("Bill marked approved.");
      await load();
      await openDetail(selected.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveInvoiceRef() {
    if (!selected) return;
    setError("");
    setSuccess("");
    try {
      await api.patchVendorBill(selected.id, { vendor_invoice_ref: invoiceRef.trim() || null });
      setSuccess("Invoice reference saved.");
      await load();
      await openDetail(selected.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function postSelected() {
    if (!selected) return;
    setError("");
    setSuccess("");
    try {
      if (!invoiceRef.trim()) {
        setError("Enter vendor invoice reference before posting.");
        return;
      }
      await api.patchVendorBill(selected.id, { vendor_invoice_ref: invoiceRef.trim() });
      const r = await api.postVendorBill(selected.id);
      setSuccess(`Posted. Voucher #${r.voucher_id ?? "—"}`);
      setSelected(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Vendor bills (GRN match)</h1>
        <p className="text-sm text-text-muted">
          Draft bills created from received GRNs. Enter the supplier invoice number, then post to clear GRNI and book trade
          payables.
        </p>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="rounded border border-status-success/20 bg-status-success-subtle p-3 text-sm text-status-success-foreground">{success}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-subtle text-text-secondary">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">GRN</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  No vendor bills yet. Create a draft from a received GRN (API or future GRN shortcut).
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium">{r.bill_code}</td>
                  <td className="px-3 py-2">{r.vendor_id}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{r.goods_receiving_id ?? "—"}</td>
                  <td className="px-3 py-2">{r.total_amount ?? "—"}</td>
                  <td className="relative px-3 py-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((v) => (v === r.id ? null : r.id));
                      }}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div
                        className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => {
                            setOpenActionsId(null);
                            void openDetail(r.id);
                          }}
                        >
                          View
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {selected.bill_code} — {selected.status}
            </h2>
            <button type="button" className="text-sm text-text-muted underline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p className="text-sm text-text-muted">
            Non-PO: {selected.is_non_po_receipt ? "Yes" : "No"} · PO #{selected.purchase_order_id ?? "—"} · Order #
            {selected.source_order_id ?? "—"}
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs text-text-muted">Vendor invoice ref</label>
              <input
                className="rounded border px-2 py-1 text-sm"
                value={invoiceRef}
                placeholder="Supplier invoice no."
                onChange={(e) => setInvoiceRef(e.target.value)}
              />
            </div>
            <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void saveInvoiceRef()}>
              Save ref
            </button>
            <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => void approveSelected()}>
              Mark approved
            </button>
            <button
              type="button"
              className="rounded border border-brand-primary bg-brand-primary/10 px-3 py-1 text-sm font-medium text-brand-primary"
              onClick={() => void postSelected()}
            >
              Post AP
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b text-text-secondary">
                  <th className="py-1 pr-2">Item</th>
                  <th className="py-1 pr-2">Qty</th>
                  <th className="py-1 pr-2">Rate</th>
                  <th className="py-1">Line total</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((ln) => (
                  <tr key={ln.id} className="border-b border-border/40">
                    <td className="py-1 pr-2">{ln.item_id}</td>
                    <td className="py-1 pr-2">{ln.quantity}</td>
                    <td className="py-1 pr-2">{ln.unit_price}</td>
                    <td className="py-1">{ln.line_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
