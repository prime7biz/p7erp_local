import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  api,
  type BtbLcRow,
  type MasterContractRow,
  type OutstandingBillResponse,
  type ProformaInvoiceRow,
  type PurchaseOrderResponse,
  type VendorCreate,
  type VendorResponse,
  type VendorUpdate,
} from "@/api/client";

type DrawerTab = "profile" | "commercial" | "banking" | "accounting" | "activity" | "edit";

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
  const [payables, setPayables] = useState<OutstandingBillResponse[]>([]);
  const [vendorProformas, setVendorProformas] = useState<ProformaInvoiceRow[]>([]);
  const [masterContracts, setMasterContracts] = useState<MasterContractRow[]>([]);

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
      setPayables([]);
      setVendorProformas([]);
      setMasterContracts([]);
      return;
    }
    let mounted = true;
    const loadLinkage = async () => {
      try {
        const [poRows, lcRows, payableRows, importPiRows, masterRows] = await Promise.all([
          api.listPurchaseOrders(),
          api.listBtbLcs({ vendor_id: vendor.id }),
          api.listOutstandingBills({ bill_type: "PAYABLE" }),
          api.listProformaInvoices({ direction: "IMPORT", vendor_id: vendor.id }),
          api.listMasterContracts(),
        ]);
        if (!mounted) return;
        const vendorName = (vendor.name || "").trim().toLowerCase();
        setPurchaseOrders(poRows.filter((r) => r.vendor_id === vendor.id));
        setBtbLcs(lcRows.filter((r) => (r.vendor_id ?? null) === vendor.id));
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

  const payableTotal = useMemo(() => {
    return payables.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [payables]);

  const paidTotal = useMemo(() => {
    return payables.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
  }, [payables]);

  const btbTotal = useMemo(() => {
    return btbLcs.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [btbLcs]);

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
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col max-h-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isCreate ? "Add vendor" : vendor ? `${vendor.vendor_code} – ${vendor.name}` : "Vendor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isCreate && vendor && (
          <div className="flex border-b border-gray-200 px-2 gap-1 shrink-0">
            {(["profile", "commercial", "banking", "accounting", "activity", "edit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium rounded-t ${tab === t ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t === "profile"
                  ? "Profile"
                  : t === "commercial"
                    ? "Commercial"
                    : t === "banking"
                      ? "Banking"
                      : t === "accounting"
                        ? "Accounting"
                        : t === "activity"
                          ? "Activity"
                          : "Edit"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {isCreate ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Vendor code *</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. V001"
                  value={createForm.vendor_code}
                  onChange={(e) => setCreateForm((p) => ({ ...p, vendor_code: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Vendor name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contact person</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Contact name"
                  value={createForm.contact_person ?? ""}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, contact_person: e.target.value || null }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="email@example.com"
                  value={createForm.email ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Phone number"
                  value={createForm.phone ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[60px]"
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vendor type</label>
                  <select
                    value={createForm.vendor_type ?? ""}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, vendor_type: e.target.value || null }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    <option value="local">Local</option>
                    <option value="foreign">Foreign</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={createForm.country ?? ""}
                    onChange={(e) => setCreateForm((p) => ({ ...p, country: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={createForm.city ?? ""}
                    onChange={(e) => setCreateForm((p) => ({ ...p, city: e.target.value || null }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
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
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create vendor"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : vendor ? (
            tab === "profile" ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Code</p>
                  <p className="text-sm font-medium text-gray-900">{vendor.vendor_code}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Name</p>
                  <p className="text-sm text-gray-900">{vendor.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Status</p>
                  <span
                    className={
                      vendor.is_active
                        ? "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700"
                        : "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500"
                    }
                  >
                    {vendor.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <div>
                    <p className="text-xs text-gray-500">Type</p>
                    <p className="text-sm font-medium text-gray-800">{vendor.vendor_type || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Currency</p>
                    <p className="text-sm font-medium text-gray-800">{vendor.default_currency || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Country / City</p>
                    <p className="text-sm font-medium text-gray-800">
                      {[vendor.country, vendor.city].filter(Boolean).join(" / ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Payment terms</p>
                    <p className="text-sm font-medium text-gray-800">
                      {vendor.payment_terms_days != null ? `${vendor.payment_terms_days} days` : "—"}
                    </p>
                  </div>
                </div>
                {(vendor.contact_person || vendor.email || vendor.phone || vendor.address) && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Contact</p>
                    <ul className="text-sm text-gray-700 space-y-0.5">
                      {vendor.contact_person && <li>{vendor.contact_person}</li>}
                      {vendor.email && <li>{vendor.email}</li>}
                      {vendor.phone && <li>{vendor.phone}</li>}
                      {vendor.address && <li className="whitespace-pre-wrap">{vendor.address}</li>}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Created</p>
                  <p className="text-sm text-gray-600">
                    {vendor.created_at
                      ? new Date(vendor.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="pt-4 border-t border-gray-200 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("edit")}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : tab === "commercial" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-700">Linked Procurement</p>
                  <p className="text-sm font-semibold text-blue-900">
                    {purchaseOrders.length} PO · {vendorProformas.length} Vendor PI · {btbLcs.length} BTB LC
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <div>
                    <p className="text-xs text-indigo-700">BTB Value</p>
                    <p className="text-sm font-semibold text-indigo-900">{formatMoney(btbTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-indigo-700">Master Contracts Used</p>
                    <p className="text-sm font-semibold text-indigo-900">{linkedMasterCount}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Vendor import proforma invoices</p>
                  {vendorProformas.length === 0 ? (
                    <p className="text-sm text-gray-500">No vendor PI linked yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-gray-700">
                      {vendorProformas.slice(0, 5).map((pi) => (
                        <li key={pi.id} className="rounded border border-gray-200 px-2 py-1">
                          {pi.reference || `PI-${pi.id}`} · {pi.currency || "—"} · {pi.amount ?? "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Recent purchase orders</p>
                  {purchaseOrders.length === 0 ? (
                    <p className="text-sm text-gray-500">No linked purchase order yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-gray-700">
                      {purchaseOrders.slice(0, 5).map((po) => (
                        <li key={po.id} className="rounded border border-gray-200 px-2 py-1">
                          {po.po_code} · {po.status} · {po.currency || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">BTB LC linked</p>
                  {btbLcs.length === 0 ? (
                    <p className="text-sm text-gray-500">No BTB LC linked yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-gray-700">
                      {btbLcs.slice(0, 5).map((lc) => (
                        <li key={lc.id} className="rounded border border-gray-200 px-2 py-1">
                          {lc.reference || `LC-${lc.id}`} · {lc.status || "—"} · {lc.currency || "—"} ·{" "}
                          {lc.master_contract_id ? `Master #${lc.master_contract_id}` : "No master"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {linkedMasterCount > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Linked master contracts</p>
                    <ul className="space-y-1 text-sm text-gray-700">
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
                            <li key={id} className="rounded border border-gray-200 px-2 py-1">
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
              <div className="space-y-2 text-sm text-gray-700">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Bank Name</p>
                  <p className="font-medium text-gray-900">{vendor.bank_name || "—"}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Account Number</p>
                  <p className="font-medium text-gray-900">{vendor.bank_account_no || "—"}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">SWIFT</p>
                  <p className="font-medium text-gray-900">{vendor.swift_code || "—"}</p>
                </div>
              </div>
            ) : tab === "accounting" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500 uppercase">Ledger Link</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {vendor.ledger_id ? `#${vendor.ledger_id}` : "Not Linked"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500 uppercase">Credit Limit</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {vendor.credit_limit != null ? formatMoney(Number(vendor.credit_limit)) : "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-700 uppercase">Payables</p>
                  <p className="text-sm font-semibold text-amber-900">
                    Outstanding: {formatMoney(payableTotal - paidTotal)} | Total Bill: {formatMoney(payableTotal)}
                  </p>
                </div>
              </div>
            ) : tab === "activity" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Recent workflow events</p>
                {purchaseOrders.length === 0 && btbLcs.length === 0 && payables.length === 0 ? (
                  <p className="text-sm text-gray-500">No activity found for this vendor.</p>
                ) : (
                  <ul className="space-y-1">
                    {purchaseOrders.slice(0, 3).map((po) => (
                      <li key={`po-${po.id}`} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700">
                        PO {po.po_code} created ({po.status})
                      </li>
                    ))}
                    {btbLcs.slice(0, 3).map((lc) => (
                      <li key={`lc-${lc.id}`} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700">
                        BTB LC {lc.reference || lc.id} ({lc.status || "DRAFT"}) {lc.currency || ""}
                      </li>
                    ))}
                    {vendorProformas.slice(0, 3).map((pi) => (
                      <li key={`pi-${pi.id}`} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700">
                        Vendor PI {pi.reference || pi.id} ({pi.status || "DRAFT"}) {pi.currency || ""}
                      </li>
                    ))}
                    {payables.slice(0, 3).map((bill) => (
                      <li key={`bill-${bill.id}`} className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700">
                        AP Bill {bill.bill_no || bill.id} ({bill.status}) {bill.currency || ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vendor code *</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={editForm.vendor_code ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, vendor_code: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Contact person</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={editForm.email ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, email: e.target.value || undefined }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={editForm.phone ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, phone: e.target.value || undefined }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                  <textarea
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[60px]"
                    value={editForm.address ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, address: e.target.value || undefined }))
                    }
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Ledger ID</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">Currency</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editForm.default_currency ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, default_currency: e.target.value.toUpperCase() || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Vendor Type</label>
                    <select
                      value={editForm.vendor_type ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, vendor_type: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select type</option>
                      <option value="local">Local</option>
                      <option value="foreign">Foreign</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Payment Terms (days)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                    <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editForm.country ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editForm.city ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value || undefined }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bank Name</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editForm.bank_name ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, bank_name: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bank Account</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editForm.bank_account_no ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, bank_account_no: e.target.value || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">SWIFT Code</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={editForm.swift_code ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, swift_code: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Credit Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="flex items-center gap-2 text-sm text-gray-700">
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
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("profile")}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
