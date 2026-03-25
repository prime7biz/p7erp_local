import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import {
  api,
  type BtbLcRow,
  type GoodsReceivingResponse,
  type MasterContractRow,
  type OutstandingBillResponse,
  type PaymentRunResponse,
  type ProformaInvoiceRow,
  type PurchaseOrderResponse,
  type VendorCreate,
  type VendorResponse,
  type VendorUpdate,
  type VoucherResponse,
} from "@/api/client";

type DrawerTab = "profile" | "commercial" | "banking" | "accounting" | "payments" | "activity" | "edit";

interface VendorDetailDrawerProps {
  open: boolean;
  mode: "view" | "create";
  vendor: VendorResponse | null;
  onClose: () => void;
  onCreate: (data: VendorCreate) => Promise<void>;
  onUpdate: (id: number, data: VendorUpdate) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onSuccess?: () => void;
}

const emptyCreate: VendorCreate = {
  vendor_code: "",
  name: "",
  contact_person: null,
  email: null,
  phone: null,
  address: null,
  is_active: true,
  default_currency: "USD",
  payment_terms_days: null,
  vendor_type: "foreign",
  country: null,
  city: null,
  tax_id: null,
  bank_name: null,
  bank_account_no: null,
  swift_code: null,
  credit_limit: null,
};

export function VendorDetailDrawer({
  open,
  mode,
  vendor,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onSuccess,
}: VendorDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("profile");
  const [createForm, setCreateForm] = useState<VendorCreate>(emptyCreate);
  const [editForm, setEditForm] = useState<VendorUpdate>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderResponse[]>([]);
  const [btbLcs, setBtbLcs] = useState<BtbLcRow[]>([]);
  const [grns, setGrns] = useState<GoodsReceivingResponse[]>([]);
  const [payables, setPayables] = useState<OutstandingBillResponse[]>([]);
  const [vendorProformas, setVendorProformas] = useState<ProformaInvoiceRow[]>([]);
  const [masterContracts, setMasterContracts] = useState<MasterContractRow[]>([]);
  const [paymentVouchers, setPaymentVouchers] = useState<VoucherResponse[]>([]);
  const [paymentRuns, setPaymentRuns] = useState<PaymentRunResponse[]>([]);

  useEffect(() => {
    if (!open) {
      setTab("profile");
      setCreateForm(emptyCreate);
      setEditForm({});
      setError("");
    } else if (vendor) {
      setEditForm({
        vendor_code: vendor.vendor_code,
        name: vendor.name,
        contact_person: vendor.contact_person ?? undefined,
        email: vendor.email ?? undefined,
        phone: vendor.phone ?? undefined,
        address: vendor.address ?? undefined,
        is_active: vendor.is_active,
        ledger_id: vendor.ledger_id ?? undefined,
        default_currency: vendor.default_currency ?? undefined,
        payment_terms_days: vendor.payment_terms_days ?? undefined,
        vendor_type: vendor.vendor_type ?? undefined,
        country: vendor.country ?? undefined,
        city: vendor.city ?? undefined,
        tax_id: vendor.tax_id ?? undefined,
        bank_name: vendor.bank_name ?? undefined,
        bank_account_no: vendor.bank_account_no ?? undefined,
        swift_code: vendor.swift_code ?? undefined,
        credit_limit: vendor.credit_limit ?? undefined,
      });
    }
  }, [open, vendor]);

  useEffect(() => {
    if (!open || !vendor) {
      setPurchaseOrders([]);
      setBtbLcs([]);
      setGrns([]);
      setPayables([]);
      setVendorProformas([]);
      setMasterContracts([]);
      return;
    }
    let mounted = true;
    const loadLinkage = async () => {
      try {
        const [poRows, lcRows, grnRows, payableRows, importPiRows, masterRows] = await Promise.all([
          api.listPurchaseOrders(),
          api.listBtbLcs({ vendor_id: vendor.id }),
          api.listGoodsReceiving(),
          api.listOutstandingBills({ bill_type: "PAYABLE" }),
          api.listProformaInvoices({ direction: "IMPORT", vendor_id: vendor.id }),
          api.listMasterContracts(),
        ]);
        if (!mounted) return;
        const vendorName = (vendor.name || "").trim().toLowerCase();
        const vendorPos = poRows.filter((r) => r.vendor_id === vendor.id);
        const vendorPoIds = new Set(vendorPos.map((po) => po.id));
        setPurchaseOrders(vendorPos);
        setBtbLcs(lcRows.filter((r) => (r.vendor_id ?? null) === vendor.id));
        setGrns(grnRows.filter((row) => row.purchase_order_id != null && vendorPoIds.has(row.purchase_order_id)));
        setVendorProformas(importPiRows);
        setMasterContracts(masterRows);
        setPayables(
          payableRows.filter((r) => {
            const rowVendor = (r as unknown as { vendor_id?: number | null }).vendor_id;
            if (rowVendor != null) return rowVendor === vendor.id;
            return (r.party_name || "").trim().toLowerCase() === vendorName;
          })
        );
      } catch {
        // Keep drawer usable even if one dataset fails
      }
    };
    loadLinkage();
    return () => {
      mounted = false;
    };
  }, [open, vendor]);

  useEffect(() => {
    if (!open || !vendor || tab !== "payments") {
      setPaymentVouchers([]);
      setPaymentRuns([]);
      return;
    }
    let mounted = true;
    const loadPay = async () => {
      try {
        const [vouchers, runs] = await Promise.all([api.listVouchers({}), api.listPaymentRuns({})]);
        if (!mounted || !vendor) return;
        const lid = vendor.ledger_id;
        const vFiltered =
          lid != null
            ? vouchers.filter((v) => v.lines?.some((l) => l.account_id === lid))
            : [];
        const nameLower = (vendor.name || "").trim().toLowerCase();
        const runsFiltered = runs.filter((r) =>
          r.items?.some((i) => (i.party_name || "").trim().toLowerCase() === nameLower),
        );
        setPaymentVouchers(vFiltered.slice(0, 40));
        setPaymentRuns(runsFiltered.slice(0, 25));
      } catch {
        if (mounted) {
          setPaymentVouchers([]);
          setPaymentRuns([]);
        }
      }
    };
    void loadPay();
    return () => {
      mounted = false;
    };
  }, [open, vendor, tab]);

  const payableTotal = useMemo(() => {
    return payables.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [payables]);

  const paidTotal = useMemo(() => {
    return payables.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
  }, [payables]);

  const btbTotal = useMemo(() => {
    return btbLcs.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [btbLcs]);

  const paymentHistoryCount = useMemo(() => paymentVouchers.length + paymentRuns.length, [paymentVouchers, paymentRuns]);

  const linkedMasterCount = useMemo(() => {
    const ids = new Set(
      btbLcs.map((row) => Number(row.master_contract_id || 0)).filter((id) => id > 0)
    );
    return ids.size;
  }, [btbLcs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onCreate(createForm);
      setCreateForm(emptyCreate);
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create vendor");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    setError("");
    setSaving(true);
    try {
      await onUpdate(vendor.id, editForm);
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!vendor || !window.confirm("Delete this vendor?")) return;
    setError("");
    setSaving(true);
    try {
      await onDelete(vendor.id);
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete vendor");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const isCreate = mode === "create";
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(value) ? value : 0
    );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-surface-raised shadow-xl flex flex-col max-h-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">
            {isCreate ? "Add vendor" : vendor ? `${vendor.vendor_code} – ${vendor.name}` : "Vendor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-subtle text-text-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isCreate && vendor && (
          <div className="flex border-b border-border px-2 gap-1 shrink-0">
            {(["profile", "commercial", "banking", "accounting", "payments", "activity", "edit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium rounded-t ${tab === t ? "bg-surface-subtle text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
              >
                {t === "profile"
                  ? "Profile"
                  : t === "commercial"
                    ? "Commercial"
                    : t === "banking"
                      ? "Banking"
                      : t === "accounting"
                        ? "Accounting"
                        : t === "payments"
                          ? "Payments"
                          : t === "activity"
                            ? "Activity"
                            : "Edit"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              {error}
            </div>
          )}

          {isCreate ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Vendor code *</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="e.g. V001"
                  value={createForm.vendor_code}
                  onChange={(e) => setCreateForm((p) => ({ ...p, vendor_code: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="Vendor name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Contact person</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="Contact name"
                  value={createForm.contact_person ?? ""}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, contact_person: e.target.value || null }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="email@example.com"
                  value={createForm.email ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Phone</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="Phone number"
                  value={createForm.phone ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Address</label>
                <textarea
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm min-h-[60px]"
                  placeholder="Address"
                  value={createForm.address ?? ""}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, address: e.target.value || null }))
                  }
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Vendor type</label>
                  <select
                    value={createForm.vendor_type ?? ""}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, vendor_type: e.target.value || null }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    <option value="local">Local</option>
                    <option value="foreign">Foreign</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Currency</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={createForm.default_currency ?? ""}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, default_currency: e.target.value.toUpperCase() || null }))
                    }
                    placeholder="USD"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Country</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={createForm.country ?? ""}
                    onChange={(e) => setCreateForm((p) => ({ ...p, country: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">City</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={createForm.city ?? ""}
                    onChange={(e) => setCreateForm((p) => ({ ...p, city: e.target.value || null }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={createForm.is_active ?? true}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, is_active: e.target.checked }))
                  }
                />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create vendor"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : vendor ? (
            tab === "profile" ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Code</p>
                  <p className="text-sm font-medium text-text-primary">{vendor.vendor_code}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Name</p>
                  <p className="text-sm text-text-primary">{vendor.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Status</p>
                  <span
                    className={
                      vendor.is_active
                        ? "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground"
                        : "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-surface-subtle text-text-muted"
                    }
                  >
                    {vendor.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-subtle p-2">
                  <div>
                    <p className="text-xs text-text-muted">Type</p>
                    <p className="text-sm font-medium text-text-primary">{vendor.vendor_type || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Currency</p>
                    <p className="text-sm font-medium text-text-primary">{vendor.default_currency || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Country / City</p>
                    <p className="text-sm font-medium text-text-primary">
                      {[vendor.country, vendor.city].filter(Boolean).join(" / ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Payment terms</p>
                    <p className="text-sm font-medium text-text-primary">
                      {vendor.payment_terms_days != null ? `${vendor.payment_terms_days} days` : "—"}
                    </p>
                  </div>
                </div>
                {(vendor.contact_person || vendor.email || vendor.phone || vendor.address) && (
                  <div>
                    <p className="text-xs font-medium text-text-muted uppercase mb-1">Contact</p>
                    <ul className="text-sm text-text-secondary space-y-0.5">
                      {vendor.contact_person && <li>{vendor.contact_person}</li>}
                      {vendor.email && <li>{vendor.email}</li>}
                      {vendor.phone && <li>{vendor.phone}</li>}
                      {vendor.address && <li className="whitespace-pre-wrap">{vendor.address}</li>}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Created</p>
                  <p className="text-sm text-text-secondary">
                    {vendor.created_at
                      ? new Date(vendor.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs font-medium text-text-muted uppercase mb-2">Related Records</p>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/app/inventory/purchase-orders" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      POs ({purchaseOrders.length})
                    </Link>
                    <Link to="/app/inventory/goods-receiving" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      GRNs ({grns.length})
                    </Link>
                    <Link to="/app/accounts/outstanding-bills" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      Outstanding bills ({payables.length})
                    </Link>
                    <button
                      type="button"
                      onClick={() => setTab("payments")}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Payment history ({paymentHistoryCount})
                    </button>
                    <Link to="/app/commercial/btb-lcs" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      BTB LCs ({btbLcs.length})
                    </Link>
                  </div>
                </div>
                <div className="pt-4 border-t border-border flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("edit")}
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-1.5 text-sm font-medium text-status-danger-foreground hover:bg-status-danger-subtle disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : tab === "commercial" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-2">
                  <p className="text-xs text-status-info-foreground">Linked Procurement</p>
                  <p className="text-sm font-semibold text-status-info-foreground">
                    {purchaseOrders.length} PO · {vendorProformas.length} Vendor PI · {btbLcs.length} BTB LC
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-3">
                  <div>
                    <p className="text-xs text-brand-primary">BTB Value</p>
                    <p className="text-sm font-semibold text-brand-primary">{formatMoney(btbTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-primary">Master Contracts Used</p>
                    <p className="text-sm font-semibold text-brand-primary">{linkedMasterCount}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Vendor import proforma invoices</p>
                  {vendorProformas.length === 0 ? (
                    <p className="text-sm text-text-muted">No vendor PI linked yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {vendorProformas.slice(0, 5).map((pi) => (
                        <li key={pi.id} className="rounded border border-border px-2 py-1">
                          {pi.reference || `PI-${pi.id}`} · {pi.currency || "—"} · {pi.amount ?? "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Recent purchase orders</p>
                  {purchaseOrders.length === 0 ? (
                    <p className="text-sm text-text-muted">No linked purchase order yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {purchaseOrders.slice(0, 5).map((po) => (
                        <li key={po.id} className="rounded border border-border px-2 py-1">
                          {po.po_code} · {po.status} · {po.currency || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">BTB LC linked</p>
                  {btbLcs.length === 0 ? (
                    <p className="text-sm text-text-muted">No BTB LC linked yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {btbLcs.slice(0, 5).map((lc) => (
                        <li key={lc.id} className="rounded border border-border px-2 py-1">
                          {lc.reference || `LC-${lc.id}`} · {lc.status || "—"} · {lc.currency || "—"} ·{" "}
                          {lc.master_contract_id ? `Master #${lc.master_contract_id}` : "No master"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {linkedMasterCount > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-muted uppercase mb-1">Linked master contracts</p>
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {Array.from(
                        new Set(
                          btbLcs
                            .map((row) => Number(row.master_contract_id || 0))
                            .filter((id) => id > 0)
                        )
                      )
                        .slice(0, 5)
                        .map((id) => {
                          const mc = masterContracts.find((m) => m.id === id);
                          return (
                            <li key={id} className="rounded border border-border px-2 py-1">
                              {mc?.reference || `#${id}`} · {mc?.contract_type || "—"} ·{" "}
                              {mc?.amount != null ? formatMoney(Number(mc.amount)) : "—"}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
              </div>
            ) : tab === "banking" ? (
              <div className="space-y-2 text-sm text-text-secondary">
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs text-text-muted uppercase">Bank Name</p>
                  <p className="font-medium text-text-primary">{vendor.bank_name || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs text-text-muted uppercase">Account Number</p>
                  <p className="font-medium text-text-primary">{vendor.bank_account_no || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs text-text-muted uppercase">SWIFT</p>
                  <p className="font-medium text-text-primary">{vendor.swift_code || "—"}</p>
                </div>
              </div>
            ) : tab === "accounting" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-text-muted uppercase">Ledger Link</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {vendor.ledger_id ? `#${vendor.ledger_id}` : "Not Linked"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-text-muted uppercase">Credit Limit</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {vendor.credit_limit != null ? formatMoney(Number(vendor.credit_limit)) : "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle p-3">
                  <p className="text-xs text-status-warning-foreground uppercase">Payables</p>
                  <p className="text-sm font-semibold text-status-warning-foreground">
                    Outstanding: {formatMoney(payableTotal - paidTotal)} | Total Bill: {formatMoney(payableTotal)}
                  </p>
                  <Link to="/app/accounts/reports/ar-ap-aging" className="mt-1 inline-block text-xs font-medium text-brand-primary hover:underline">
                    View full AP aging
                  </Link>
                </div>
                <p className="text-xs text-text-muted">
                  <button type="button" className="font-medium text-brand-primary hover:underline" onClick={() => setTab("payments")}>
                    View payment history & vouchers
                  </button>
                </p>
              </div>
            ) : tab === "payments" ? (
              <div className="space-y-3 text-sm">
                {!vendor.ledger_id ? (
                  <p className="text-text-muted">Link a ledger account to the vendor to match payment vouchers.</p>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Vouchers touching this ledger</p>
                  {paymentVouchers.length === 0 ? (
                    <p className="text-text-muted">No matching vouchers found.</p>
                  ) : (
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {paymentVouchers.map((v) => (
                        <li key={v.id}>
                          <a
                            href={`/app/vouchers/${v.id}`}
                            className="text-brand-primary hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {v.voucher_number}
                          </a>{" "}
                          {v.voucher_date} · {v.voucher_type} · {v.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Payment runs</p>
                  {paymentRuns.length === 0 ? (
                    <p className="text-text-muted">No payment runs with this party name.</p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {paymentRuns.map((r) => (
                        <li key={r.id} className="rounded border border-border px-2 py-1">
                          {r.run_code} · {r.run_date} · {r.status} · {formatMoney(Number(r.total_amount || 0))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : tab === "activity" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-muted uppercase">Recent workflow events</p>
                {purchaseOrders.length === 0 && btbLcs.length === 0 && payables.length === 0 ? (
                  <p className="text-sm text-text-muted">No activity found for this vendor.</p>
                ) : (
                  <ul className="space-y-1">
                    {purchaseOrders.slice(0, 3).map((po) => (
                      <li key={`po-${po.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        PO {po.po_code} created ({po.status})
                      </li>
                    ))}
                    {btbLcs.slice(0, 3).map((lc) => (
                      <li key={`lc-${lc.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        BTB LC {lc.reference || lc.id} ({lc.status || "DRAFT"}) {lc.currency || ""}
                      </li>
                    ))}
                    {vendorProformas.slice(0, 3).map((pi) => (
                      <li key={`pi-${pi.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        Vendor PI {pi.reference || pi.id} ({pi.status || "DRAFT"}) {pi.currency || ""}
                      </li>
                    ))}
                    {payables.slice(0, 3).map((bill) => (
                      <li key={`bill-${bill.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        AP Bill {bill.bill_no || bill.id} ({bill.status}) {bill.currency || ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Vendor code *</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.vendor_code ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, vendor_code: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Contact person</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.contact_person ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        contact_person: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.email ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, email: e.target.value || undefined }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Phone</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.phone ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, phone: e.target.value || undefined }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Address</label>
                  <textarea
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm min-h-[60px]"
                    value={editForm.address ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, address: e.target.value || undefined }))
                    }
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Ledger ID</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.ledger_id ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          ledger_id: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Currency</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.default_currency ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, default_currency: e.target.value.toUpperCase() || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Vendor Type</label>
                    <select
                      value={editForm.vendor_type ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, vendor_type: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      <option value="">Select type</option>
                      <option value="local">Local</option>
                      <option value="foreign">Foreign</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Payment Terms (days)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.payment_terms_days ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          payment_terms_days: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Country</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.country ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">City</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.city ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value || undefined }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Bank Name</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.bank_name ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, bank_name: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Bank Account</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.bank_account_no ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, bank_account_no: e.target.value || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">SWIFT Code</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.swift_code ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, swift_code: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Credit Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.credit_limit ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          credit_limit: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={editForm.is_active ?? true}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, is_active: e.target.checked }))
                    }
                  />
                  Active
                </label>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("profile")}
                    className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
