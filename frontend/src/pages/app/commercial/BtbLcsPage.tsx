import { useEffect, useMemo, useState } from "react";
import {
  api,
  type BtbLcCreate,
  type BtbLcRow,
  type MasterContractRow,
  type ProformaInvoiceRow,
  type PurchaseOrderResponse,
  type VendorResponse,
} from "@/api/client";

const STATUS_OPTIONS = ["DRAFT", "OPEN", "AMENDED", "CLOSED"] as const;

const emptyForm: BtbLcCreate = {
  reference: "",
  status: "DRAFT",
  lc_date: "",
  amount: undefined,
  master_contract_id: undefined,
  proforma_invoice_id: undefined,
  vendor_proforma_invoice_id: undefined,
  purchase_order_id: undefined,
  vendor_id: undefined,
  bank_account_id: undefined,
  currency: "USD",
  exchange_rate_to_base: undefined,
  base_currency_amount: undefined,
  open_date: "",
  expiry_date: "",
  maturity_date: "",
  maturity_amount: undefined,
};

export function BtbLcsPage() {
  const [items, setItems] = useState<BtbLcRow[]>([]);
  const [allLcs, setAllLcs] = useState<BtbLcRow[]>([]);
  const [masterContracts, setMasterContracts] = useState<MasterContractRow[]>([]);
  const [vendors, setVendors] = useState<VendorResponse[]>([]);
  const [exportPis, setExportPis] = useState<ProformaInvoiceRow[]>([]);
  const [vendorPis, setVendorPis] = useState<ProformaInvoiceRow[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedMaster, setSelectedMaster] = useState<number | undefined>(undefined);
  const [selectedVendor, setSelectedVendor] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<BtbLcCreate>(emptyForm);
  const [statusDraft, setStatusDraft] = useState<Record<number, string>>({});
  const [updatingLcId, setUpdatingLcId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [lcRows, allLcRows, masters, vendorRows, exportPiRows, importPiRows, poRows] = await Promise.all([
        api.listBtbLcs({
          status: statusFilter || undefined,
          master_contract_id: selectedMaster,
          vendor_id: selectedVendor,
        }),
        api.listBtbLcs(),
        api.listMasterContracts(),
        api.listVendors(),
        api.listProformaInvoices({ direction: "EXPORT" }),
        api.listProformaInvoices({ direction: "IMPORT" }),
        api.listPurchaseOrders(),
      ]);
      setItems(Array.isArray(lcRows) ? lcRows : []);
      setAllLcs(Array.isArray(allLcRows) ? allLcRows : []);
      setMasterContracts(masters);
      setVendors(vendorRows);
      setExportPis(exportPiRows);
      setVendorPis(importPiRows);
      setPurchaseOrders(poRows);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load BTB LC workflow");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, selectedMaster, selectedVendor]);

  useEffect(() => {
    const selectedMasterContract = masterContracts.find((m) => m.id === form.master_contract_id);
    if (!selectedMasterContract || form.amount == null) return;
    if (!form.currency) {
      setForm((prev) => ({
        ...prev,
        currency: selectedMasterContract.currency || prev.currency || "USD",
      }));
    }
  }, [form.master_contract_id, form.amount, form.currency, masterContracts]);

  const totals = useMemo(() => {
    const totalAmount = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const openCount = items.filter((row) => {
      const s = (row.status || "").toUpperCase();
      return s === "OPEN" || s === "DRAFT";
    }).length;
    return { total: items.length, openCount, totalAmount };
  }, [items]);

  const utilizationMap = useMemo(() => {
    const byMaster = new Map<number, number>();
    for (const lc of allLcs) {
      const key = Number(lc.master_contract_id ?? 0);
      if (!key) continue;
      byMaster.set(key, (byMaster.get(key) ?? 0) + Number(lc.amount || 0));
    }
    return byMaster;
  }, [allLcs]);

  const selectedMasterContract = useMemo(
    () => masterContracts.find((m) => m.id === form.master_contract_id),
    [masterContracts, form.master_contract_id]
  );

  const selectedMasterUtilization = useMemo(() => {
    if (!selectedMasterContract?.id) return null;
    const totalAmount = Number(selectedMasterContract.amount || 0);
    const usedAmount = Number(utilizationMap.get(selectedMasterContract.id) || 0);
    const remaining = Math.max(totalAmount - usedAmount, 0);
    const percent = totalAmount > 0 ? Math.min((usedAmount / totalAmount) * 100, 100) : 0;
    return { totalAmount, usedAmount, remaining, percent };
  }, [selectedMasterContract, utilizationMap]);

  const createLc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reference?.trim()) {
      setError("Reference is required.");
      return;
    }
    if (!form.master_contract_id) {
      setError("Master contract is required.");
      return;
    }
    if (!form.vendor_id) {
      setError("Vendor is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createBtbLc({
        ...form,
        reference: form.reference.trim(),
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create BTB LC");
    } finally {
      setSaving(false);
    }
  };

  const updateLcStatus = async (lc: BtbLcRow) => {
    const nextStatus = statusDraft[lc.id] ?? lc.status ?? "DRAFT";
    if ((lc.status || "DRAFT") === nextStatus) return;
    setUpdatingLcId(lc.id);
    setError("");
    try {
      await api.updateBtbLc(lc.id, { status: nextStatus });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update BTB LC status");
    } finally {
      setUpdatingLcId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">BTB LCs</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Open back-to-back LCs against a parent Master Contract/LC, with vendor PI and PO linkage.
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-semibold text-gray-900">{totals.total}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total BTB LC</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <p className="text-2xl font-semibold text-emerald-700">{totals.openCount}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Open / Draft</p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-sm">
          <p className="text-2xl font-semibold text-indigo-700">{totals.totalAmount.toLocaleString()}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Value</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">Open BTB LC</h2>
          <p className="mt-0.5 text-xs text-slate-500">Link master contract, vendor PI, and procurement in one flow.</p>
        </div>
        <form onSubmit={createLc} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Reference *</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.reference ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="BTB-2026-001"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Status</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.status ?? "DRAFT"}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Master Contract *</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.master_contract_id ?? ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, master_contract_id: e.target.value ? Number(e.target.value) : undefined }))
              }
              required
            >
              <option value="">Select master contract</option>
              {masterContracts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.reference || `#${m.id}`} ({m.contract_type || "—"})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Vendor *</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.vendor_id ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, vendor_id: e.target.value ? Number(e.target.value) : undefined }))}
              required
            >
              <option value="">Select vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_code} - {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Vendor PI (IMPORT)</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.vendor_proforma_invoice_id ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  vendor_proforma_invoice_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            >
              <option value="">Select vendor PI</option>
              {vendorPis
                .filter((pi) => !form.vendor_id || Number(pi.vendor_id ?? 0) === form.vendor_id)
                .map((pi) => (
                  <option key={pi.id} value={pi.id}>
                    {pi.reference || `#${pi.id}`}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Export PI (optional)</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.proforma_invoice_id ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  proforma_invoice_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            >
              <option value="">Select export PI</option>
              {exportPis.map((pi) => (
                <option key={pi.id} value={pi.id}>
                  {pi.reference || `#${pi.id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Purchase Order</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.purchase_order_id ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  purchase_order_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            >
              <option value="">Select PO</option>
              {purchaseOrders
                .filter((po) => !form.vendor_id || po.vendor_id === form.vendor_id)
                .map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.po_code} ({po.status})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">LC Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.lc_date ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, lc_date: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Maturity Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.maturity_date ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, maturity_date: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Amount</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.amount ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Currency</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.currency ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
              placeholder="USD"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">FX Rate to Base</label>
            <input
              type="number"
              step="0.000001"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.exchange_rate_to_base ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  exchange_rate_to_base: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Base Amount</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.base_currency_amount ?? ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  base_currency_amount: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            />
          </div>
          <div className="md:col-span-3">
            {selectedMasterUtilization && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-indigo-700">
                  <span>Master utilization</span>
                  <span>{selectedMasterUtilization.percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-indigo-100">
                  <div
                    className="h-full rounded-full bg-indigo-600"
                    style={{ width: `${selectedMasterUtilization.percent}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-indigo-800">
                  Used: {selectedMasterUtilization.usedAmount.toLocaleString()} | Remaining:{" "}
                  {selectedMasterUtilization.remaining.toLocaleString()} | Total:{" "}
                  {selectedMasterUtilization.totalAmount.toLocaleString()}
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Open BTB LC"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={selectedMaster ?? ""}
            onChange={(e) => setSelectedMaster(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All master contracts</option>
            {masterContracts.map((m) => (
              <option key={m.id} value={m.id}>
                {m.reference || `#${m.id}`}
              </option>
            ))}
          </select>
          <select
            value={selectedVendor ?? ""}
            onChange={(e) => setSelectedVendor(e.target.value ? Number(e.target.value) : undefined)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vendor_code} - {v.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading BTB LCs…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No BTB LC found.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="py-2 px-4">Reference</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Master</th>
                <th className="py-2 px-4">Vendor</th>
                <th className="py-2 px-4">Currency</th>
                <th className="py-2 px-4 text-right">Amount</th>
                <th className="py-2 px-4">Master Utilization</th>
                <th className="py-2 px-4">Maturity</th>
                <th className="py-2 px-4">Created</th>
                <th className="py-2 px-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-4 font-medium text-gray-900">{row.reference ?? row.lc_number ?? `#${row.id}`}</td>
                  <td className="py-2 px-4 text-gray-700">{row.status ?? "—"}</td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.master_contract_id ? `#${row.master_contract_id}` : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.vendor_id ? `#${row.vendor_id}` : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">{row.currency ?? "—"}</td>
                  <td className="py-2 px-4 text-right text-gray-700">
                    {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.master_contract_id ? (
                      (() => {
                        const master = masterContracts.find((m) => m.id === Number(row.master_contract_id));
                        const totalAmount = Number(master?.amount || 0);
                        const usedAmount = Number(utilizationMap.get(Number(row.master_contract_id)) || 0);
                        const percent = totalAmount > 0 ? Math.min((usedAmount / totalAmount) * 100, 100) : 0;
                        return (
                          <div className="min-w-[130px]">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${percent}%` }} />
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">{percent.toFixed(1)}%</div>
                          </div>
                        );
                      })()
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.maturity_date ? new Date(row.maturity_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        value={statusDraft[row.id] ?? (row.status || "DRAFT")}
                        onChange={(e) =>
                          setStatusDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void updateLcStatus(row)}
                        disabled={updatingLcId === row.id}
                        className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 disabled:opacity-50"
                      >
                        {updatingLcId === row.id ? "Saving..." : "Update"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
