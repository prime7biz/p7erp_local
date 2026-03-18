import { useEffect, useMemo, useState } from "react";
import {
  api,
  type BtbLcRow,
  type MasterContractCreate,
  type MasterContractRow,
  type MasterContractUpdate,
} from "@/api/client";
import { X } from "lucide-react";

const CONTRACT_TYPES = [
  { value: "EXPORT_LC", label: "Master Export LC" },
  { value: "SALES_CONTRACT", label: "Sales Contract" },
] as const;

const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "CLOSED"] as const;

const emptyForm: MasterContractCreate = {
  contract_type: "EXPORT_LC",
  reference: "",
  status: "DRAFT",
  contract_date: "",
  amount: undefined,
  currency: "USD",
  buyer_name: "",
  bank_name: "",
  expiry_date: "",
};

export function MasterContractsPage() {
  const [items, setItems] = useState<MasterContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MasterContractCreate>(emptyForm);
  const [selectedContract, setSelectedContract] = useState<MasterContractRow | null>(null);
  const [selectedLcs, setSelectedLcs] = useState<BtbLcRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [updateForm, setUpdateForm] = useState<MasterContractUpdate>({});
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api.listMasterContracts({
        status: statusFilter || undefined,
      });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load master contracts");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  const totals = useMemo(() => {
    const total = items.length;
    const active = items.filter((row) => (row.status || "").toUpperCase() === "ACTIVE").length;
    const amount = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { total, active, amount };
  }, [items]);

  const createContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reference?.trim()) {
      setError("Reference is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createMasterContract({
        ...form,
        reference: form.reference.trim(),
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create master contract");
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (row: MasterContractRow) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError("");
    try {
      const [contract, lcs] = await Promise.all([
        api.getMasterContract(row.id),
        api.listBtbLcs({ master_contract_id: row.id }),
      ]);
      setSelectedContract(contract);
      setSelectedLcs(lcs);
      setUpdateForm({
        contract_type: contract.contract_type,
        reference: contract.reference,
        status: contract.status,
        contract_date: contract.contract_date ?? undefined,
        amount: contract.amount ?? undefined,
        currency: contract.currency ?? undefined,
        buyer_name: contract.buyer_name ?? undefined,
        bank_name: contract.bank_name ?? undefined,
        expiry_date: contract.expiry_date ?? undefined,
      });
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : "Failed to load master contract detail");
      setSelectedContract(null);
      setSelectedLcs([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  const saveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) return;
    setUpdating(true);
    setDrawerError("");
    try {
      const updated = await api.updateMasterContract(selectedContract.id, updateForm);
      setSelectedContract(updated);
      const lcs = await api.listBtbLcs({ master_contract_id: updated.id });
      setSelectedLcs(lcs);
      await load();
    } catch (e) {
      setDrawerError(e instanceof Error ? e.message : "Failed to update master contract");
    } finally {
      setUpdating(false);
    }
  };

  const utilization = useMemo(() => {
    if (!selectedContract) return null;
    const total = Number(selectedContract.amount || 0);
    const used = selectedLcs.reduce((sum, lc) => sum + Number(lc.amount || 0), 0);
    const remaining = Math.max(total - used, 0);
    const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    return { total, used, remaining, percent };
  }, [selectedContract, selectedLcs]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Master Contracts</h1>
        <p className="mt-1 text-sm text-text-muted">
          Track customer-side Master Export LC / Sales Contract and monitor how many BTB LCs are opened under each parent.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-2xl font-semibold text-text-primary">{totals.total}</p>
          <p className="text-xs uppercase tracking-wide text-text-muted">Total Master Contracts</p>
        </div>
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle/70 p-4 shadow-sm">
          <p className="text-2xl font-semibold text-status-success-foreground">{totals.active}</p>
          <p className="text-xs uppercase tracking-wide text-text-muted">Active</p>
        </div>
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10/70 p-4 shadow-sm">
          <p className="text-2xl font-semibold text-brand-primary">{totals.amount.toLocaleString()}</p>
          <p className="text-xs uppercase tracking-wide text-text-muted">Total Value</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border bg-surface-subtle/70 px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">Create Master Contract</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            One master contract can have multiple BTB LCs under it.
          </p>
        </div>
        <form onSubmit={createContract} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Type</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.contract_type ?? "EXPORT_LC"}
              onChange={(e) => setForm((prev) => ({ ...prev, contract_type: e.target.value }))}
            >
              {CONTRACT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Reference *</label>
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.reference ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="e.g. ELC-2026-001"
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
              {STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Contract Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.contract_date ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, contract_date: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Expiry Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.expiry_date ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, expiry_date: e.target.value || undefined }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Amount</label>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.amount ?? ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, amount: e.target.value ? Number(e.target.value) : undefined }))
              }
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
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Buyer Name</label>
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.buyer_name ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, buyer_name: e.target.value }))}
              placeholder="Customer / buyer"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Bank Name</label>
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.bank_name ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))}
              placeholder="Lien bank"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground shadow-sm hover:bg-brand-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create Master Contract"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="flex items-center justify-between border-b border-border bg-surface-subtle/70 px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">Master Contract Register</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
          >
            <option value="">All status</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-text-muted">Loading master contracts...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-text-muted">No master contract found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-surface-subtle" onClick={() => void openDetail(row)}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{row.reference || `#${row.id}`}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{row.contract_type || "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{row.status || "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{row.buyer_name || "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {row.contract_date ? new Date(row.contract_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-text-secondary">
                      {row.amount != null ? Number(row.amount).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">{row.currency || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface-raised shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold text-text-primary">
                {selectedContract?.reference || "Master Contract Detail"}
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {drawerError && (
                <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
                  {drawerError}
                </div>
              )}
              {drawerLoading ? (
                <div className="p-6 text-sm text-text-muted">Loading details...</div>
              ) : selectedContract ? (
                <>
                  {utilization && (
                    <div className={`rounded-lg border p-3 ${
                      utilization.percent >= 90 ? "border-status-danger/20 bg-status-danger-subtle" : "border-brand-primary/30 bg-brand-primary/10"
                    }`}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={utilization.percent >= 90 ? "text-status-danger-foreground" : "text-brand-primary"}>
                          Utilization
                        </span>
                        <span className={utilization.percent >= 90 ? "text-status-danger-foreground" : "text-brand-primary"}>
                          {utilization.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-raised/70">
                        <div
                          className={`h-full rounded-full ${utilization.percent >= 90 ? "bg-status-danger" : "bg-brand-primary"}`}
                          style={{ width: `${utilization.percent}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        Used: {utilization.used.toLocaleString()} | Remaining: {utilization.remaining.toLocaleString()} |
                        Total: {utilization.total.toLocaleString()}
                      </p>
                      {utilization.percent >= 90 && (
                        <p className="mt-1 text-xs font-medium text-status-danger-foreground">
                          Alert: Master contract is near fully utilized.
                        </p>
                      )}
                    </div>
                  )}

                  <form onSubmit={saveUpdate} className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-muted">Type</label>
                      <select
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={updateForm.contract_type ?? "EXPORT_LC"}
                        onChange={(e) => setUpdateForm((p) => ({ ...p, contract_type: e.target.value }))}
                      >
                        {CONTRACT_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-muted">Status</label>
                      <select
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={updateForm.status ?? "DRAFT"}
                        onChange={(e) => setUpdateForm((p) => ({ ...p, status: e.target.value }))}
                      >
                        {STATUS_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-muted">Reference</label>
                      <input
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={updateForm.reference ?? ""}
                        onChange={(e) => setUpdateForm((p) => ({ ...p, reference: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-muted">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={updateForm.amount ?? ""}
                        onChange={(e) =>
                          setUpdateForm((p) => ({ ...p, amount: e.target.value ? Number(e.target.value) : undefined }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-muted">Currency</label>
                      <input
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={updateForm.currency ?? ""}
                        onChange={(e) =>
                          setUpdateForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-muted">Buyer</label>
                      <input
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={updateForm.buyer_name ?? ""}
                        onChange={(e) => setUpdateForm((p) => ({ ...p, buyer_name: e.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="submit"
                        disabled={updating}
                        className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                      >
                        {updating ? "Saving..." : "Save Contract"}
                      </button>
                    </div>
                  </form>

                  <div className="rounded-lg border border-border">
                    <div className="border-b border-border bg-surface-subtle px-3 py-2 text-sm font-medium text-text-secondary">
                      Child BTB LCs ({selectedLcs.length})
                    </div>
                    {selectedLcs.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-text-muted">No BTB LC linked yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-surface-subtle text-left text-text-secondary">
                            <tr>
                              <th className="px-3 py-2">Reference</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2">Vendor</th>
                              <th className="px-3 py-2">Currency</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedLcs.map((lc) => (
                              <tr key={lc.id}>
                                <td className="px-3 py-2">{lc.reference || `#${lc.id}`}</td>
                                <td className="px-3 py-2">{lc.status || "—"}</td>
                                <td className="px-3 py-2">{lc.vendor_id ? `#${lc.vendor_id}` : "—"}</td>
                                <td className="px-3 py-2">{lc.currency || "—"}</td>
                                <td className="px-3 py-2 text-right">{Number(lc.amount || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-6 text-sm text-text-muted">No contract selected.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
