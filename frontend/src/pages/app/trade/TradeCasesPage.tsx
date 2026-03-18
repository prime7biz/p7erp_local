import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { api, type TradeCaseCreate, type TradeCaseRow } from "@/api/client";

const EMPTY_FORM: TradeCaseCreate = {
  direction: "EXPORT",
  reference: "",
  status: "DRAFT",
  current_stage: "DRAFT",
  order_id: undefined,
  customer_id: undefined,
  vendor_id: undefined,
  proforma_invoice_id: undefined,
  amount: undefined,
  currency: "USD",
};

export function TradeCasesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TradeCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<TradeCaseCreate>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api.listTradeCases({
        direction: directionFilter || undefined,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setItems(rows);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load trade cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [directionFilter, statusFilter]);

  const counts = useMemo(() => {
    const total = items.length;
    const open = items.filter((it) => (it.current_stage || "").toUpperCase() !== "SETTLED").length;
    const shipped = items.filter((it) => (it.current_stage || "").toUpperCase() === "SHIPPED").length;
    return { total, open, shipped };
  }, [items]);

  const createCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reference?.trim()) {
      setError("Reference is required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const created = await api.createTradeCase({
        ...form,
        reference: form.reference.trim(),
      });
      setForm(EMPTY_FORM);
      await load();
      navigate(`/app/trade/cases/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create trade case");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Trade Cases</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Unified export/import case hub linked with orders, proforma invoices, LC, shipment, and trade documents.
          </p>
        </div>
        <Link
          to="/app/trade/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
        >
          Open Control Tower
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Total Cases</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/10/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Open Cases</p>
          <p className="mt-1 text-2xl font-semibold text-brand-primary">{counts.open}</p>
        </div>
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle/70 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-text-muted">Shipped Cases</p>
          <p className="mt-1 text-2xl font-semibold text-status-success-foreground">{counts.shipped}</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border bg-surface-subtle/80 px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">Create Trade Case</h2>
        </div>
        <form onSubmit={createCase} className="grid grid-cols-1 gap-4 p-5 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Direction</label>
            <select
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.direction ?? "EXPORT"}
              onChange={(e) => setForm((prev) => ({ ...prev, direction: e.target.value }))}
            >
              <option value="EXPORT">EXPORT</option>
              <option value="IMPORT">IMPORT</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Reference *</label>
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.reference ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="TC-2026-001"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Order ID</label>
            <input
              type="number"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.order_id ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, order_id: e.target.value ? Number(e.target.value) : undefined }))}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">Proforma Invoice ID</label>
            <input
              type="number"
              className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
              value={form.proforma_invoice_id ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, proforma_invoice_id: e.target.value ? Number(e.target.value) : undefined }))}
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating..." : "Create Trade Case"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2">
          <input
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference / status / stage"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Search
          </button>
          <select
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
          >
            <option value="">All directions</option>
            <option value="EXPORT">EXPORT</option>
            <option value="IMPORT">IMPORT</option>
          </select>
          <select
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="COMMERCIAL">COMMERCIAL</option>
            <option value="LC_OPEN">LC_OPEN</option>
            <option value="BOOKING">BOOKING</option>
            <option value="DOCS">DOCS</option>
            <option value="SHIPPED">SHIPPED</option>
            <option value="SETTLED">SETTLED</option>
          </select>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-text-muted">Loading trade cases...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-text-muted">No trade cases found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">PI</th>
                  <th className="px-4 py-3">ETD</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-2.5 font-medium text-text-primary">{row.reference}</td>
                    <td className="px-4 py-2.5">{row.direction}</td>
                    <td className="px-4 py-2.5">{row.status}</td>
                    <td className="px-4 py-2.5">{row.current_stage}</td>
                    <td className="px-4 py-2.5">{row.order_id ? `#${row.order_id}` : "—"}</td>
                    <td className="px-4 py-2.5">{row.proforma_invoice_id ? `#${row.proforma_invoice_id}` : "—"}</td>
                    <td className="px-4 py-2.5">{row.etd ? new Date(row.etd).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2.5">{row.eta ? new Date(row.eta).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2.5">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="relative px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Actions
                      </button>
                      {openActionsId === row.id && (
                        <div className="absolute right-4 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                          <Link
                            to={`/app/trade/cases/${row.id}`}
                            onClick={() => setOpenActionsId(null)}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              navigate(`/app/logistics?trade_case_id=${row.id}`);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Create Shipment
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
