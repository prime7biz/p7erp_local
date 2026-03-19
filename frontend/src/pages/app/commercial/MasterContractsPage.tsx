import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type BtbLcRow,
  type MerchAlertItem,
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

const COMMERCIAL_ACTIVE_MERCH_ALERT_STATUSES = new Set([
  "new",
  "acknowledged",
  "in_progress",
  "waiting_on_buyer",
  "waiting_on_supplier",
  "snoozed",
  "escalated",
]);

type BtbWarningBand = "VERY_GOOD" | "GOOD" | "SATISFACTORY" | "NO_CREDIT" | "RED_FLAG";

function getBand(percent: number): BtbWarningBand {
  if (percent < 50) return "VERY_GOOD";
  if (percent < 60) return "GOOD";
  if (percent < 65) return "SATISFACTORY";
  if (percent <= 70) return "NO_CREDIT";
  return "RED_FLAG";
}

function bandLabel(band: BtbWarningBand): string {
  if (band === "VERY_GOOD") return "Very Good";
  if (band === "GOOD") return "Good";
  if (band === "SATISFACTORY") return "Satisfactory";
  if (band === "NO_CREDIT") return "No Credit Zone";
  return "Red Flag";
}

function bandClasses(band: BtbWarningBand): { container: string; text: string; bar: string } {
  if (band === "VERY_GOOD") {
    return {
      container: "border-status-success/30 bg-status-success-subtle",
      text: "text-status-success-foreground",
      bar: "bg-status-success",
    };
  }
  if (band === "GOOD") {
    return {
      container: "border-brand-primary/30 bg-brand-primary/10",
      text: "text-brand-primary",
      bar: "bg-brand-primary",
    };
  }
  if (band === "SATISFACTORY") {
    return {
      container: "border-status-warning/30 bg-status-warning-subtle",
      text: "text-status-warning-foreground",
      bar: "bg-status-warning",
    };
  }
  if (band === "NO_CREDIT") {
    return {
      container: "border-status-warning/40 bg-status-warning-subtle",
      text: "text-status-warning-foreground",
      bar: "bg-status-warning",
    };
  }
  return {
    container: "border-status-danger/20 bg-status-danger-subtle",
    text: "text-status-danger-foreground",
    bar: "bg-status-danger",
  };
}

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
  const [utilizationSort, setUtilizationSort] = useState<"none" | "desc" | "asc">("none");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MasterContractCreate>(emptyForm);
  const [selectedContract, setSelectedContract] = useState<MasterContractRow | null>(null);
  const [selectedLcs, setSelectedLcs] = useState<BtbLcRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [updateForm, setUpdateForm] = useState<MasterContractUpdate>({});
  const [updating, setUpdating] = useState(false);
  const [alertMap, setAlertMap] = useState<Record<number, MerchAlertItem[]>>({});

  const severityRank: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    informational: 1,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, alerts] = await Promise.all([
        api.listMasterContracts({
          status: statusFilter || undefined,
        }),
        api.getMerchAlerts({
          entity_type: "master_contract",
          page: 1,
          page_size: 100,
          sort: "-created_at",
        }).catch(() => ({ items: [] as MerchAlertItem[] })),
      ]);
      setItems(rows);
      const grouped: Record<number, MerchAlertItem[]> = {};
      for (const alert of alerts.items) {
        if (!COMMERCIAL_ACTIVE_MERCH_ALERT_STATUSES.has((alert.status || "").toLowerCase())) continue;
        const key = Number(alert.entity_id || 0);
        if (!key) continue;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(alert);
      }
      setAlertMap(grouped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load master contracts");
      setItems([]);
      setAlertMap({});
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const total = items.length;
    const active = items.filter((row) => (row.status || "").toUpperCase() === "ACTIVE").length;
    const amount = items.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return { total, active, amount };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (utilizationSort === "none") return items;
    const cloned = [...items];
    cloned.sort((a, b) => {
      const aPct = Number(a.btb_utilization_pct ?? -1);
      const bPct = Number(b.btb_utilization_pct ?? -1);
      return utilizationSort === "desc" ? bPct - aPct : aPct - bPct;
    });
    return cloned;
  }, [items, utilizationSort]);

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
    const rawPercent = total > 0 ? (used / total) * 100 : 0;
    const band = getBand(rawPercent);
    return { total, used, remaining, percent: rawPercent, band };
  }, [selectedContract, selectedLcs]);

  const readiness = useMemo(() => {
    if (!selectedContract) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueSoonThreshold = new Date(today);
    dueSoonThreshold.setDate(dueSoonThreshold.getDate() + 7);

    let overdueUnrealized = 0;
    let dueSoonUnrealized = 0;
    for (const lc of selectedLcs) {
      if (!lc.maturity_date) continue;
      if ((lc.accounting_status || "").toUpperCase() === "REALIZED") continue;
      const maturity = new Date(lc.maturity_date);
      maturity.setHours(0, 0, 0, 0);
      if (maturity < today) overdueUnrealized += 1;
      else if (maturity <= dueSoonThreshold) dueSoonUnrealized += 1;
    }

    return {
      hasCostCenter: Boolean(selectedContract.cost_center_id),
      btbCount: selectedLcs.length,
      overdueUnrealized,
      dueSoonUnrealized,
      activeAlertCount: alertMap[selectedContract.id]?.length ?? 0,
    };
  }, [selectedContract, selectedLcs, alertMap]);

  const exportReadinessCsv = () => {
    if (!selectedContract) return;
    const contractRef = selectedContract.reference || `contract_${selectedContract.id}`;
    const safeRef = contractRef.replace(/[^\w.-]+/g, "_");
    const now = new Date().toISOString().slice(0, 10);
    const utilTotal = Number(selectedContract.amount || 0);
    const utilUsed = selectedLcs.reduce((sum, lc) => sum + Number(lc.amount || 0), 0);
    const utilPct = utilTotal > 0 ? (utilUsed / utilTotal) * 100 : 0;

    const rows: string[][] = [
      ["section", "metric", "value"],
      ["contract", "reference", selectedContract.reference || ""],
      ["contract", "type", selectedContract.contract_type || ""],
      ["contract", "status", selectedContract.status || ""],
      ["contract", "cost_center_id", selectedContract.cost_center_id ? String(selectedContract.cost_center_id) : ""],
      ["contract", "amount", selectedContract.amount != null ? String(selectedContract.amount) : ""],
      ["contract", "currency", selectedContract.currency || ""],
      ["readiness", "utilization_pct", utilPct.toFixed(2)],
      ["readiness", "active_alert_count", String(readiness?.activeAlertCount ?? 0)],
      ["readiness", "maturity_due_soon_unrealized", String(readiness?.dueSoonUnrealized ?? 0)],
      ["readiness", "maturity_overdue_unrealized", String(readiness?.overdueUnrealized ?? 0)],
      ["", "", ""],
      ["btb_lc", "id", "reference,status,lifecycle,maturity_date,currency,amount,vendor_id"],
    ];

    for (const lc of selectedLcs) {
      rows.push([
        "btb_lc",
        String(lc.id),
        [
          lc.reference || "",
          lc.status || "",
          lc.accounting_status || "",
          lc.maturity_date || "",
          lc.currency || "",
          lc.amount != null ? String(lc.amount) : "",
          lc.vendor_id != null ? String(lc.vendor_id) : "",
        ]
          .map((v) => String(v).replace(/,/g, " "))
          .join(","),
      ]);
    }

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeRef}_readiness_${now}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const printReadinessSummary = () => {
    if (!selectedContract || !utilization || !readiness) return;
    const printable = window.open("", "_blank", "width=980,height=720");
    if (!printable) return;
    const rowsHtml = selectedLcs
      .map(
        (lc) => `
          <tr>
            <td>${lc.reference || `#${lc.id}`}</td>
            <td>${lc.status || "—"}</td>
            <td>${lc.accounting_status || "—"}</td>
            <td>${lc.maturity_date ? new Date(lc.maturity_date).toLocaleDateString() : "—"}</td>
            <td>${lc.currency || "—"}</td>
            <td style="text-align:right">${Number(lc.amount || 0).toLocaleString()}</td>
          </tr>
        `
      )
      .join("");
    printable.document.write(`
      <html>
        <head>
          <title>Master Contract Readiness - ${selectedContract.reference || selectedContract.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
            h1 { font-size: 20px; margin: 0 0 8px; }
            h2 { font-size: 14px; margin: 16px 0 8px; }
            .meta { font-size: 12px; color: #4b5563; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
            th { background: #f3f4f6; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Master Contract Readiness Summary</h1>
          <div class="meta">
            Ref: ${selectedContract.reference || `#${selectedContract.id}`} | Date: ${new Date().toLocaleString()}
          </div>

          <h2>Contract & Readiness</h2>
          <div class="grid">
            <div>Type: ${selectedContract.contract_type || "—"}</div>
            <div>Status: ${selectedContract.status || "—"}</div>
            <div>Cost Center: ${selectedContract.cost_center_id ? `#${selectedContract.cost_center_id}` : "Missing"}</div>
            <div>Currency: ${selectedContract.currency || "—"}</div>
            <div>Utilization: ${utilization.percent.toFixed(1)}%</div>
            <div>Band: ${bandLabel(utilization.band)}</div>
            <div>Due soon (unrealized): ${readiness.dueSoonUnrealized}</div>
            <div>Overdue (unrealized): ${readiness.overdueUnrealized}</div>
            <div>Active alerts: ${readiness.activeAlertCount}</div>
          </div>

          <h2>BTB LC Lifecycle</h2>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Status</th>
                <th>Lifecycle</th>
                <th>Maturity</th>
                <th>Currency</th>
                <th style="text-align:right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6">No BTB LC linked.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printable.document.close();
    printable.focus();
    printable.print();
  };

  const topSeverity = (contractId: number): string | null => {
    const alerts = alertMap[contractId] ?? [];
    if (alerts.length === 0) return null;
    const sorted = [...alerts].sort(
      (a, b) => (severityRank[b.severity?.toLowerCase() || ""] || 0) - (severityRank[a.severity?.toLowerCase() || ""] || 0)
    );
    return sorted[0]?.severity?.toLowerCase() ?? null;
  };

  const severityBadgeClass = (severity: string) => {
    if (severity === "critical") return "bg-status-danger-subtle text-status-danger-foreground border-status-danger/20";
    if (severity === "high") return "bg-status-warning-subtle text-status-warning-foreground border-status-warning/30";
    if (severity === "medium") return "bg-status-info-subtle text-status-info-foreground border-status-info/30";
    if (severity === "low") return "bg-brand-primary/10 text-brand-primary border-brand-primary/20";
    return "bg-status-neutral-subtle text-status-neutral-foreground border-border";
  };

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
          <div className="flex items-center gap-2">
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
            <select
              value={utilizationSort}
              onChange={(e) => setUtilizationSort(e.target.value as "none" | "desc" | "asc")}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
            >
              <option value="none">Utilization: Default</option>
              <option value="desc">Utilization: Highest first</option>
              <option value="asc">Utilization: Lowest first</option>
            </select>
          </div>
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
                  <th className="px-4 py-3">Cost Center</th>
                  <th className="px-4 py-3">BTB Utilization</th>
                  <th className="px-4 py-3">Alert</th>
                  <th className="px-4 py-3">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleItems.map((row) => (
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
                    <td className="px-4 py-2.5 text-text-secondary">{row.cost_center_id ? `#${row.cost_center_id}` : "—"}</td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {row.btb_utilization_pct != null ? (
                        (() => {
                          const pct = Number(row.btb_utilization_pct);
                          const band = getBand(pct);
                          const styles = bandClasses(band);
                          return (
                            <div className="min-w-[150px]">
                              <div className="mb-1 flex items-center justify-between">
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles.container} ${styles.text}`}>
                                  {bandLabel(band)}
                                </span>
                                <span className={`text-xs font-semibold ${styles.text}`}>{pct.toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
                                <div
                                  className={`h-full rounded-full ${styles.bar}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {(() => {
                        const sev = topSeverity(row.id);
                        const count = alertMap[row.id]?.length ?? 0;
                        if (!sev || count === 0) return "—";
                        return (
                          <Link
                            to={`/app/merchandising/alerts?entity_type=master_contract&entity_id=${row.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium hover:opacity-90 ${severityBadgeClass(sev)}`}
                          >
                            {sev.toUpperCase()} ({count})
                          </Link>
                        );
                      })()}
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
                    <div className={`rounded-lg border p-3 ${bandClasses(utilization.band).container}`}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={bandClasses(utilization.band).text}>
                          Utilization ({bandLabel(utilization.band)})
                        </span>
                        <span className={bandClasses(utilization.band).text}>
                          {utilization.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-raised/70">
                        <div
                          className={`h-full rounded-full ${bandClasses(utilization.band).bar}`}
                          style={{ width: `${Math.min(utilization.percent, 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        Used: {utilization.used.toLocaleString()} | Remaining: {utilization.remaining.toLocaleString()} |
                        Total: {utilization.total.toLocaleString()}
                      </p>
                      {utilization.band === "RED_FLAG" ? (
                        <p className="mt-1 text-xs font-medium text-status-danger-foreground">
                          Alert: BTB utilization is above 70%. This is a red flag.
                        </p>
                      ) : null}
                    </div>
                  )}

                  {readiness && (
                    <div className="rounded-lg border border-border bg-surface-subtle/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Readiness
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={exportReadinessCsv}
                            className="rounded border border-border-strong bg-surface-raised px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-subtle"
                          >
                            Export CSV
                          </button>
                          <button
                            type="button"
                            onClick={printReadinessSummary}
                            className="rounded border border-border-strong bg-surface-raised px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-subtle"
                          >
                            Print
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
                        <div>
                          Cost center:{" "}
                          <span className={readiness.hasCostCenter ? "text-status-success-foreground" : "text-status-danger-foreground"}>
                            {readiness.hasCostCenter ? "Linked" : "Missing"}
                          </span>
                        </div>
                        <div>BTB LC count: {readiness.btbCount}</div>
                        <div>
                          Maturity due soon:{" "}
                          <span className={readiness.dueSoonUnrealized > 0 ? "text-status-warning-foreground" : ""}>
                            {readiness.dueSoonUnrealized}
                          </span>
                        </div>
                        <div>
                          Maturity overdue:{" "}
                          <span className={readiness.overdueUnrealized > 0 ? "text-status-danger-foreground" : ""}>
                            {readiness.overdueUnrealized}
                          </span>
                        </div>
                        <div className="col-span-2">
                          Active alerts: {readiness.activeAlertCount}{" "}
                          {selectedContract ? (
                            <Link
                              className="text-brand-primary hover:underline"
                              to={`/app/merchandising/alerts?entity_type=master_contract&entity_id=${selectedContract.id}`}
                            >
                              Open Alerts
                            </Link>
                          ) : null}
                        </div>
                      </div>
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
                      <label className="mb-1 block text-xs font-medium text-text-muted">Cost Center</label>
                      <input
                        className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                        value={selectedContract.cost_center_id ? `#${selectedContract.cost_center_id}` : "Auto on OPEN/ACTIVE"}
                        disabled
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
                              <th className="px-3 py-2">Lifecycle</th>
                              <th className="px-3 py-2">Vendor</th>
                              <th className="px-3 py-2">Currency</th>
                              <th className="px-3 py-2">Maturity</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedLcs.map((lc) => (
                              <tr key={lc.id}>
                                <td className="px-3 py-2">{lc.reference || `#${lc.id}`}</td>
                                <td className="px-3 py-2">{lc.status || "—"}</td>
                                <td className="px-3 py-2">{lc.accounting_status || "—"}</td>
                                <td className="px-3 py-2">{lc.vendor_id ? `#${lc.vendor_id}` : "—"}</td>
                                <td className="px-3 py-2">{lc.currency || "—"}</td>
                                <td className="px-3 py-2">
                                  {lc.maturity_date ? new Date(lc.maturity_date).toLocaleDateString() : "—"}
                                </td>
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
