import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type VendorBillDetailResponse, type VendorBillSummary } from "@/api/client";
import { PartyLedgerSummaryCard } from "@/pages/app/finance/party-ledger/PartyLedgerSummaryCard";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import {
  listPageErrorClass,
  listPageRootClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { FinanceFormDrawer, FormSection, ScrollTableCard, showingCountLabel } from "@/components/finance/kit";

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
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);

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
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Vendor bills (GRN match)"
        description="Draft bills created from received GRNs. Enter the supplier invoice number, then post to clear GRNI and book trade payables."
      />

      {error && !selected ? <div className={listPageErrorClass}>{error}</div> : null}
      {success ? (
        <div className="rounded border border-status-success/20 bg-status-success-subtle p-3 text-sm text-status-success-foreground">
          {success}
        </div>
      ) : null}

      <ScrollTableCard footer={showingCountLabel(rows.length, rows.length, "bill")}>
        <table className="min-w-full text-left text-sm">
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>Code</th>
              <th className={listTableThClass}>Vendor</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>GRN</th>
              <th className={listTableThClass}>Total</th>
              <th className={`${listTableThClass} w-28`}>Actions</th>
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
                <tr key={r.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{r.bill_code}</td>
                  <td className={listTableTdClass}>{r.vendor_id}</td>
                  <td className={listTableTdClass}>{r.status}</td>
                  <td className={listTableTdClass}>{r.goods_receiving_id ?? "—"}</td>
                  <td className={listTableTdClass}>{r.total_amount ?? "—"}</td>
                  <td className={listTableTdClass}>
                    <RowActionsMenu
                      menuPortal
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      items={[{ key: "view", label: "View", onClick: () => void openDetail(r.id) }]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableCard>

      <FinanceFormDrawer
        open={selected != null}
        mode="panel"
        size="xl"
        title={selected ? `${selected.bill_code} — ${selected.status}` : "Vendor bill"}
        onClose={() => setSelected(null)}
        error={error}
        footer={
          <>
            <button
              type="button"
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
              onClick={() => void saveInvoiceRef()}
            >
              Save ref
            </button>
            <button
              type="button"
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
              onClick={() => void approveSelected()}
            >
              Mark approved
            </button>
            <button
              type="button"
              className="rounded-lg border border-brand-primary bg-brand-primary/10 px-4 py-2 text-sm font-medium text-brand-primary"
              onClick={() => void postSelected()}
            >
              Post AP
            </button>
          </>
        }
      >
        {selected ? (
          <>
            <FormSection title="Source">
              <p className="text-sm text-text-muted">
                Non-PO: {selected.is_non_po_receipt ? "Yes" : "No"} · PO #{selected.purchase_order_id ?? "—"} · Order #
                {selected.source_order_id ?? "—"}
              </p>
              {selected.goods_receiving_id ? (
                <p className="text-sm">
                  <Link
                    to={`/app/inventory/grn-inspection?grn_id=${selected.goods_receiving_id}`}
                    className="text-brand-primary underline"
                  >
                    Open GRN QC inspection
                  </Link>
                  {" · "}
                  <Link to="/app/inventory/quality-dashboard" className="text-text-secondary underline">
                    Quality dashboard
                  </Link>
                </p>
              ) : null}
              <div className="max-w-sm">
                <PartyLedgerSummaryCard partyType="VENDOR" partyId={selected.vendor_id} title="Vendor party ledger" />
              </div>
            </FormSection>

            <FormSection title="Supplier invoice">
              <label className="block text-xs font-medium text-text-muted">
                Vendor invoice ref
                <input
                  className="mt-1 w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm"
                  value={invoiceRef}
                  placeholder="Supplier invoice no."
                  onChange={(e) => setInvoiceRef(e.target.value)}
                />
              </label>
            </FormSection>

            <FormSection title="Lines">
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
            </FormSection>
          </>
        ) : null}
      </FinanceFormDrawer>
    </div>
  );
}
