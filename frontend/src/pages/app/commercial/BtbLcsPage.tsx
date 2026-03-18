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
        <h1 className="text-2xl font-bold text-text-primary">BTB LCs</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Open back-to-back LCs against a parent Master Contract/LC, with vendor PI and PO linkage.
        </p>
      </header>

      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-2xl font-semibold text-text-primary">{totals.total}</p>
          <p className="text-xs text-text-muted uppercase tracking-wide">Total BTB LC</p>
        </div>
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle/70 p-4 shadow-sm">
          <p className="text-2xl font-semibold text-status-success-foreground">{totals.openCount}</p>
          <p className="text-xs text-text-muted uppercase tracking-wide">Open / Draft</p>
        </div>
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10 p-4 shadow-sm">
          <p className="text-2xl font-semibold text-brand-primary">{totals.totalAmount.toLocaleString()}</p>
          <p className="text-xs text-text-muted uppercase tracking-wide">Total Value</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border bg-surface-subtle/70 px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">Open BTB LC</h2>
          <p className="mt-0.5 text-xs text-text-muted">Link master contract, vendor PI, and procurement in one flow.</p>
        </div>
        <form onSubmit={createLc} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Reference *</label>
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.reference ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="BTB-2026-001"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Status</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Master Contract *</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Vendor *</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Vendor PI (IMPORT)</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Export PI (optional)</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Purchase Order</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">LC Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.lc_date ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, lc_date: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Maturity Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.maturity_date ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, maturity_date: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Amount</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.amount ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Currency</label>
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.currency ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
              placeholder="USD"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">FX Rate to Base</label>
            <input
              type="number"
              step="0.000001"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Base Amount</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
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
              <div className="mb-3 rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-brand-primary">
                  <span>Master utilization</span>
                  <span>{selectedMasterUtilization.percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-brand-primary/20">
                  <div
                    className="h-full rounded-full bg-brand-primary"
                    style={{ width: `${selectedMasterUtilization.percent}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-brand-primary">
                  Used: {selectedMasterUtilization.usedAmount.toLocaleString()} | Remaining:{" "}
                  {selectedMasterUtilization.remaining.toLocaleString()} | Total:{" "}
                  {selectedMasterUtilization.totalAmount.toLocaleString()}
                </p>
              </div>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow-sm hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Open BTB LC"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
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
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
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
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
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
          <div className="p-12 text-center text-text-muted">Loading BTB LCs…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-text-muted">No BTB LC found.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
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
                <tr key={row.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 px-4 font-medium text-text-primary">{row.reference ?? row.lc_number ?? `#${row.id}`}</td>
                  <td className="py-2 px-4 text-text-secondary">{row.status ?? "—"}</td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.master_contract_id ? `#${row.master_contract_id}` : "—"}
                  </td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.vendor_id ? `#${row.vendor_id}` : "—"}
                  </td>
                  <td className="py-2 px-4 text-text-secondary">{row.currency ?? "—"}</td>
                  <td className="py-2 px-4 text-right text-text-secondary">
                    {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.master_contract_id ? (
                      (() => {
                        const master = masterContracts.find((m) => m.id === Number(row.master_contract_id));
                        const totalAmount = Number(master?.amount || 0);
                        const usedAmount = Number(utilizationMap.get(Number(row.master_contract_id)) || 0);
                        const percent = totalAmount > 0 ? Math.min((usedAmount / totalAmount) * 100, 100) : 0;
                        return (
                          <div className="min-w-[130px]">
                            <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
                              <div className="h-full rounded-full bg-brand-primary" style={{ width: `${percent}%` }} />
                            </div>
                            <div className="mt-1 text-[11px] text-text-muted">{percent.toFixed(1)}%</div>
                          </div>
                        );
                      })()
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.maturity_date ? new Date(row.maturity_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-4 text-text-secondary">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-xs"
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
                        className="rounded border border-brand-primary/30 bg-brand-primary/10 px-2 py-1 text-xs font-medium text-brand-primary disabled:opacity-50"
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
