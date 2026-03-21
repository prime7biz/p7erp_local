import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type BtbLcCreate,
  type BtbLcAccountingRow,
  type BtbLcRow,
  type ChartOfAccountResponse,
  type MerchAlertItem,
  type MasterContractRow,
  type ProformaInvoiceRow,
  type PurchaseOrderResponse,
  type VendorResponse,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const STATUS_OPTIONS = ["DRAFT", "OPEN", "AMENDED", "CLOSED"] as const;

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

function bandClasses(band: BtbWarningBand): { bar: string; text: string } {
  if (band === "VERY_GOOD") return { bar: "bg-status-success", text: "text-status-success-foreground" };
  if (band === "GOOD") return { bar: "bg-brand-primary", text: "text-brand-primary" };
  if (band === "SATISFACTORY") return { bar: "bg-status-warning", text: "text-status-warning-foreground" };
  if (band === "NO_CREDIT") return { bar: "bg-status-warning", text: "text-status-warning-foreground" };
  return { bar: "bg-status-danger", text: "text-status-danger-foreground" };
}

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
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
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
  const [updatingLcId, setUpdatingLcId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [accountingDrawerOpen, setAccountingDrawerOpen] = useState(false);
  const [selectedAccountingLc, setSelectedAccountingLc] = useState<BtbLcRow | null>(null);
  const [accountingData, setAccountingData] = useState<BtbLcAccountingRow | null>(null);
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingError, setAccountingError] = useState("");
  const [submittingAccountingAction, setSubmittingAccountingAction] = useState(false);

  const [openEntryForm, setOpenEntryForm] = useState({
    upcoming_lc_liability_account_id: "",
    blocked_credit_facility_account_id: "",
    voucher_date: "",
    amount: "",
  });
  const [docsEntryForm, setDocsEntryForm] = useState({
    lc_liability_account_id: "",
    import_bill_liability_account_id: "",
    maturity_date: "",
    voucher_date: "",
    amount: "",
  });
  const [realizationEntryForm, setRealizationEntryForm] = useState({
    import_bill_liability_account_id: "",
    payment_account_id: "",
    voucher_date: "",
    amount: "",
  });
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
      const [lcRows, allLcRows, masters, vendorRows, exportPiRows, importPiRows, poRows, accountRows, alerts] = await Promise.all([
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
        api.listChartOfAccounts({ active_only: true }),
        api.getMerchAlerts({
          entity_type: "btb_lc",
          page: 1,
          page_size: 100,
          sort: "-created_at",
        }).catch((e) => {
          logApiError("BtbLcsPage.getMerchAlerts", e);
          return { items: [] as MerchAlertItem[] };
        }),
      ]);
      setItems(Array.isArray(lcRows) ? lcRows : []);
      setAllLcs(Array.isArray(allLcRows) ? allLcRows : []);
      setMasterContracts(masters);
      setVendors(vendorRows);
      setExportPis(exportPiRows);
      setVendorPis(importPiRows);
      setPurchaseOrders(poRows);
      setAccounts(accountRows);
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
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed to load BTB LC workflow");
      setAlertMap({});
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedMaster, selectedVendor]);

  useEffect(() => {
    void load();
  }, [load]);

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

  useEffect(() => {
    if (openActionsId == null) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(event.target as Node)) {
        setOpenActionsId(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openActionsId]);

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
    const rawPercent = totalAmount > 0 ? (usedAmount / totalAmount) * 100 : 0;
    const band = getBand(rawPercent);
    return { totalAmount, usedAmount, remaining, percent: rawPercent, band };
  }, [selectedMasterContract, utilizationMap]);

  const topSeverity = (btbLcId: number): string | null => {
    const alerts = alertMap[btbLcId] ?? [];
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

  const resetAccountingForms = (lc: BtbLcRow) => {
    setOpenEntryForm({
      upcoming_lc_liability_account_id: "",
      blocked_credit_facility_account_id: "",
      voucher_date: lc.open_date ?? lc.lc_date ?? new Date().toISOString().slice(0, 10),
      amount: lc.amount != null ? String(lc.amount) : "",
    });
    setDocsEntryForm({
      lc_liability_account_id: "",
      import_bill_liability_account_id: "",
      maturity_date: lc.maturity_date ?? "",
      voucher_date: new Date().toISOString().slice(0, 10),
      amount: lc.maturity_amount != null ? String(lc.maturity_amount) : lc.amount != null ? String(lc.amount) : "",
    });
    setRealizationEntryForm({
      import_bill_liability_account_id: "",
      payment_account_id: "",
      voucher_date: lc.maturity_date ?? new Date().toISOString().slice(0, 10),
      amount: lc.maturity_amount != null ? String(lc.maturity_amount) : lc.amount != null ? String(lc.amount) : "",
    });
  };

  const loadAccounting = async (lc: BtbLcRow) => {
    setAccountingLoading(true);
    setAccountingError("");
    try {
      const data = await api.getBtbLcAccounting(lc.id);
      setAccountingData(data);
    } catch (e) {
      setAccountingData(null);
      setAccountingError(e instanceof Error ? e.message : "Failed to load BTB LC accounting.");
    } finally {
      setAccountingLoading(false);
    }
  };

  const openAccountingDrawer = async (lc: BtbLcRow) => {
    setOpenActionsId(null);
    setSelectedAccountingLc(lc);
    setAccountingDrawerOpen(true);
    resetAccountingForms(lc);
    await loadAccounting(lc);
  };

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

  const setLcStatusQuick = async (lc: BtbLcRow, nextStatus: string) => {
    setOpenActionsId(null);
    setUpdatingLcId(lc.id);
    setError("");
    try {
      await api.updateBtbLc(lc.id, { status: nextStatus });
      await load();
      if (selectedAccountingLc?.id === lc.id) {
        const refreshed = await api.getBtbLc(lc.id);
        setSelectedAccountingLc(refreshed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update BTB LC status");
    } finally {
      setUpdatingLcId(null);
    }
  };

  const submitOpening = async () => {
    if (!selectedAccountingLc) return;
    setSubmittingAccountingAction(true);
    setAccountingError("");
    try {
      await api.recordBtbLcOpening(selectedAccountingLc.id, {
        upcoming_lc_liability_account_id: Number(openEntryForm.upcoming_lc_liability_account_id),
        blocked_credit_facility_account_id: Number(openEntryForm.blocked_credit_facility_account_id),
        voucher_date: openEntryForm.voucher_date || undefined,
        amount: openEntryForm.amount ? Number(openEntryForm.amount) : undefined,
      });
      await Promise.all([loadAccounting(selectedAccountingLc), load()]);
    } catch (e) {
      setAccountingError(e instanceof Error ? e.message : "Failed to record LC opening.");
    } finally {
      setSubmittingAccountingAction(false);
    }
  };

  const submitDocumentsAcceptance = async () => {
    if (!selectedAccountingLc) return;
    setSubmittingAccountingAction(true);
    setAccountingError("");
    try {
      await api.recordBtbLcDocumentsAcceptance(selectedAccountingLc.id, {
        lc_liability_account_id: Number(docsEntryForm.lc_liability_account_id),
        import_bill_liability_account_id: Number(docsEntryForm.import_bill_liability_account_id),
        maturity_date: docsEntryForm.maturity_date || undefined,
        voucher_date: docsEntryForm.voucher_date || undefined,
        amount: docsEntryForm.amount ? Number(docsEntryForm.amount) : undefined,
      });
      await Promise.all([loadAccounting(selectedAccountingLc), load()]);
    } catch (e) {
      setAccountingError(e instanceof Error ? e.message : "Failed to record documents acceptance.");
    } finally {
      setSubmittingAccountingAction(false);
    }
  };

  const submitRealization = async () => {
    if (!selectedAccountingLc) return;
    setSubmittingAccountingAction(true);
    setAccountingError("");
    try {
      await api.recordBtbLcRealization(selectedAccountingLc.id, {
        import_bill_liability_account_id: Number(realizationEntryForm.import_bill_liability_account_id),
        payment_account_id: Number(realizationEntryForm.payment_account_id),
        voucher_date: realizationEntryForm.voucher_date || undefined,
        amount: realizationEntryForm.amount ? Number(realizationEntryForm.amount) : undefined,
      });
      await Promise.all([loadAccounting(selectedAccountingLc), load()]);
    } catch (e) {
      setAccountingError(e instanceof Error ? e.message : "Failed to record realization.");
    } finally {
      setSubmittingAccountingAction(false);
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
              <div className="mb-3 rounded-lg border border-border p-3">
                <div className={`mb-1 flex items-center justify-between text-xs ${bandClasses(selectedMasterUtilization.band).text}`}>
                  <span>Master utilization</span>
                  <span>{selectedMasterUtilization.percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-brand-primary/20">
                  <div
                    className={`h-full rounded-full ${bandClasses(selectedMasterUtilization.band).bar}`}
                    style={{ width: `${Math.min(selectedMasterUtilization.percent, 100)}%` }}
                  />
                </div>
                <p className={`mt-1 text-xs ${bandClasses(selectedMasterUtilization.band).text}`}>
                  Used: {selectedMasterUtilization.usedAmount.toLocaleString()} | Remaining:{" "}
                  {selectedMasterUtilization.remaining.toLocaleString()} | Total:{" "}
                  {selectedMasterUtilization.totalAmount.toLocaleString()}
                </p>
                {selectedMasterUtilization.percent > 70 && (
                  <p className="mt-1 text-xs font-medium text-status-danger-foreground">
                    Red flag: utilization is above 70% and should be blocked by bank policy.
                  </p>
                )}
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
          <div className="overflow-x-auto overflow-y-visible">
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
                  <th className="py-2 px-4">Lifecycle</th>
                  <th className="py-2 px-4">Maturity</th>
                  <th className="py-2 px-4">Cost Center</th>
                  <th className="py-2 px-4">Alert</th>
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
                          const rawPercent = totalAmount > 0 ? (usedAmount / totalAmount) * 100 : 0;
                          const percent = Math.min(rawPercent, 100);
                          const band = getBand(rawPercent);
                          return (
                            <div className="min-w-[130px]">
                              <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
                                <div className={`h-full rounded-full ${bandClasses(band).bar}`} style={{ width: `${percent}%` }} />
                              </div>
                              <div className={`mt-1 text-[11px] ${bandClasses(band).text}`}>{rawPercent.toFixed(1)}%</div>
                            </div>
                          );
                        })()
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {row.accounting_status ? (
                        <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs">
                          {row.accounting_status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {row.maturity_date ? new Date(row.maturity_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {row.master_cost_center_id ? `#${row.master_cost_center_id}` : "—"}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {(() => {
                        const sev = topSeverity(row.id);
                        const count = alertMap[row.id]?.length ?? 0;
                        if (!sev || count === 0) return "—";
                        return (
                          <Link
                            to={`/app/merchandising/alerts?entity_type=btb_lc&entity_id=${row.id}`}
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium hover:opacity-90 ${severityBadgeClass(sev)}`}
                          >
                            {sev.toUpperCase()} ({count})
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-4 text-text-secondary">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 px-4">
                      <div className="relative inline-flex" ref={openActionsId === row.id ? actionsMenuRef : null}>
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                          disabled={updatingLcId === row.id}
                        >
                          {updatingLcId === row.id ? "Saving..." : "Actions"}
                        </button>
                        {openActionsId === row.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => void openAccountingDrawer(row)}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Accounting
                            </button>
                            <button
                              type="button"
                              onClick={() => void setLcStatusQuick(row, "DRAFT")}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Set Draft
                            </button>
                            <button
                              type="button"
                              onClick={() => void setLcStatusQuick(row, "OPEN")}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Set Open
                            </button>
                            <button
                              type="button"
                              onClick={() => void setLcStatusQuick(row, "AMENDED")}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Set Amended
                            </button>
                            <button
                              type="button"
                              onClick={() => void setLcStatusQuick(row, "CLOSED")}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              Set Closed
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {accountingDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setAccountingDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface-raised shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold text-text-primary">
                BTB LC Accounting - {selectedAccountingLc?.reference ?? ""}
              </h2>
              <button
                type="button"
                className="rounded-lg border border-border px-2 py-1 text-xs"
                onClick={() => setAccountingDrawerOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {accountingError && (
                <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
                  {accountingError}
                </div>
              )}
              {accountingLoading ? (
                <div className="text-sm text-text-muted">Loading accounting timeline...</div>
              ) : (
                <>
                  <section className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold text-text-primary">Current lifecycle</h3>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
                      <div>Status: {accountingData?.status ?? "Not yet recorded"}</div>
                      <div>Maturity: {accountingData?.maturity_date ?? selectedAccountingLc?.maturity_date ?? "—"}</div>
                      <div>
                        Open Voucher:{" "}
                        {accountingData?.lc_open_voucher_id ? (
                          <Link
                            to={`/app/accounts/vouchers?voucher_id=${accountingData.lc_open_voucher_id}`}
                            className="text-brand-primary hover:underline"
                          >
                            #{accountingData.lc_open_voucher_id}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div>
                        Import Bill Voucher:{" "}
                        {accountingData?.import_bill_voucher_id ? (
                          <Link
                            to={`/app/accounts/vouchers?voucher_id=${accountingData.import_bill_voucher_id}`}
                            className="text-brand-primary hover:underline"
                          >
                            #{accountingData.import_bill_voucher_id}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div>
                        Realization Voucher:{" "}
                        {accountingData?.realization_voucher_id ? (
                          <Link
                            to={`/app/accounts/vouchers?voucher_id=${accountingData.realization_voucher_id}`}
                            className="text-brand-primary hover:underline"
                          >
                            #{accountingData.realization_voucher_id}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div>Cost Center: {selectedAccountingLc?.master_cost_center_id ? `#${selectedAccountingLc.master_cost_center_id}` : "—"}</div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold text-text-primary">1) Record LC Opening</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={openEntryForm.upcoming_lc_liability_account_id}
                        onChange={(e) =>
                          setOpenEntryForm((p) => ({ ...p, upcoming_lc_liability_account_id: e.target.value }))
                        }
                      >
                        <option value="">Upcoming LC Liability Account</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_number} - {a.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={openEntryForm.blocked_credit_facility_account_id}
                        onChange={(e) =>
                          setOpenEntryForm((p) => ({ ...p, blocked_credit_facility_account_id: e.target.value }))
                        }
                      >
                        <option value="">Blocked Credit Facility Account</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_number} - {a.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={openEntryForm.voucher_date}
                        onChange={(e) => setOpenEntryForm((p) => ({ ...p, voucher_date: e.target.value }))}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        placeholder="Amount"
                        value={openEntryForm.amount}
                        onChange={(e) => setOpenEntryForm((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={submittingAccountingAction}
                      onClick={() => void submitOpening()}
                      className="mt-3 rounded border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary disabled:opacity-50"
                    >
                      Record Opening
                    </button>
                  </section>

                  <section className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold text-text-primary">2) Record Documents Acceptance</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={docsEntryForm.lc_liability_account_id}
                        onChange={(e) =>
                          setDocsEntryForm((p) => ({ ...p, lc_liability_account_id: e.target.value }))
                        }
                      >
                        <option value="">LC Liability (Debit)</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_number} - {a.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={docsEntryForm.import_bill_liability_account_id}
                        onChange={(e) =>
                          setDocsEntryForm((p) => ({ ...p, import_bill_liability_account_id: e.target.value }))
                        }
                      >
                        <option value="">Import Bill Liability (Credit)</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_number} - {a.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={docsEntryForm.maturity_date}
                        onChange={(e) => setDocsEntryForm((p) => ({ ...p, maturity_date: e.target.value }))}
                      />
                      <input
                        type="date"
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={docsEntryForm.voucher_date}
                        onChange={(e) => setDocsEntryForm((p) => ({ ...p, voucher_date: e.target.value }))}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="rounded border border-border-strong px-2 py-1 text-sm md:col-span-2"
                        placeholder="Amount"
                        value={docsEntryForm.amount}
                        onChange={(e) => setDocsEntryForm((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={submittingAccountingAction}
                      onClick={() => void submitDocumentsAcceptance()}
                      className="mt-3 rounded border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary disabled:opacity-50"
                    >
                      Record Documents Acceptance
                    </button>
                  </section>

                  <section className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold text-text-primary">3) Record Realization</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={realizationEntryForm.import_bill_liability_account_id}
                        onChange={(e) =>
                          setRealizationEntryForm((p) => ({
                            ...p,
                            import_bill_liability_account_id: e.target.value,
                          }))
                        }
                      >
                        <option value="">Import Bill Liability (Debit)</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_number} - {a.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={realizationEntryForm.payment_account_id}
                        onChange={(e) =>
                          setRealizationEntryForm((p) => ({ ...p, payment_account_id: e.target.value }))
                        }
                      >
                        <option value="">Payment Account (Bank/Cash)</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.account_number} - {a.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        value={realizationEntryForm.voucher_date}
                        onChange={(e) => setRealizationEntryForm((p) => ({ ...p, voucher_date: e.target.value }))}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="rounded border border-border-strong px-2 py-1 text-sm"
                        placeholder="Amount"
                        value={realizationEntryForm.amount}
                        onChange={(e) => setRealizationEntryForm((p) => ({ ...p, amount: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={submittingAccountingAction}
                      onClick={() => void submitRealization()}
                      className="mt-3 rounded border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary disabled:opacity-50"
                    >
                      Record Realization
                    </button>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
