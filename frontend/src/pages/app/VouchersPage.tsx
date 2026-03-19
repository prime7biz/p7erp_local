import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  api,
  type ChartOfAccountResponse,
  type CostCenterResponse,
  type VoucherCreate,
  type VoucherLineCreate,
  type VoucherResponse,
} from "@/api/client";

const STATUSES = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED", "CANCELLED", "REVERSED"];
const ACTION_TO_STATUS: Record<string, string> = {
  submit: "SUBMITTED",
  check: "CHECKED",
  recommend: "RECOMMENDED",
  approve: "APPROVED",
  reject: "REJECTED",
  set_draft: "DRAFT",
  cancel: "CANCELLED",
};
const ACTION_LABEL: Record<string, string> = {
  submit: "Submit",
  check: "Check",
  recommend: "Recommend",
  approve: "Approve",
  post: "Post",
  reject: "Reject",
  set_draft: "Set Draft",
  cancel: "Cancel",
  reverse: "Reverse",
};
const CTL =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";

function rowAmount(lines: VoucherLineCreate[], t: "DEBIT" | "CREDIT") {
  return lines.filter((l) => l.entry_type === t).reduce((sum, l) => sum + Number(l.amount || 0), 0);
}

function makeLine(accountId: number, currency: string, exchangeRate: string, entryType: "DEBIT" | "CREDIT" = "DEBIT"): VoucherLineCreate {
  return { account_id: accountId, cost_center_id: null, currency, exchange_rate: exchangeRate, entry_type: entryType, amount: "0", notes: "" };
}

export function VouchersPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const voucherIdFromUrl = searchParams.get("voucher_id");
  const voucherIdFilter = voucherIdFromUrl ? Number(voucherIdFromUrl) : undefined;

  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterResponse[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [rows, setRows] = useState<VoucherResponse[]>([]);
  const [availableActionMap, setAvailableActionMap] = useState<Record<number, string[]>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Multi-currency
  const [multiCurrency, setMultiCurrency] = useState(false);
  const [liveRateStatus, setLiveRateStatus] = useState<"idle" | "loading" | "fetched" | "error">("idle");

  const [form, setForm] = useState<VoucherCreate>({
    voucher_type: "JOURNAL",
    voucher_date: new Date().toISOString().slice(0, 10),
    description: "",
    reference: "",
    currency: "BDT",
    base_currency: "BDT",
    exchange_rate: "1",
    trade_case_id: undefined,
    btb_lc_id: undefined,
    lines: [makeLine(0, "BDT", "1", "DEBIT")],
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [a, c, v, types] = await Promise.all([
        api.listChartOfAccounts({ active_only: true }),
        api.listCostCenters({ active_only: true }),
        api.listVouchers(statusFilter ? { status_filter: statusFilter } : undefined),
        api.getVoucherTypesMeta(),
      ]);
      setAccounts(a);
      setCostCenters(c);
      setRows(v);
      setVoucherTypes(types);
      const actionPairs = await Promise.all(
        v.map(async (row) => {
          try {
            const meta = await api.getVoucherAvailableActions(row.id);
            return [row.id, meta.actions] as [number, string[]];
          } catch {
            return [row.id, []] as [number, string[]];
          }
        }),
      );
      const map: Record<number, string[]> = {};
      for (const [id, actions] of actionPairs) map[id] = actions;
      setAvailableActionMap(map);
      const firstAccountId = a[0]?.id ?? 0;
      setForm((prev) => {
        if (prev.lines[0]?.account_id) return prev;
        const currentLine = prev.lines[0] ?? makeLine(firstAccountId, prev.currency ?? "BDT", prev.exchange_rate ?? "1", "DEBIT");
        return {
          ...prev,
          voucher_type: types.includes(prev.voucher_type) ? prev.voucher_type : (types[0] ?? "JOURNAL"),
          lines: [{ ...currentLine, account_id: firstAccountId }],
        };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const debitTotal = useMemo(() => rowAmount(form.lines, "DEBIT"), [form.lines]);
  const creditTotal = useMemo(() => rowAmount(form.lines, "CREDIT"), [form.lines]);
  const isBalanced = Math.abs(debitTotal - creditTotal) < 0.001;

  const filteredRows = useMemo(() => {
    if (Number.isFinite(voucherIdFilter)) return rows.filter((r) => r.id === voucherIdFilter);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.voucher_number.toLowerCase().includes(q) ||
        r.voucher_type.toLowerCase().includes(q) ||
        (r.reference ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [rows, search, voucherIdFilter]);

  function setLine(idx: number, patch: Partial<VoucherLineCreate>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)),
    }));
  }

  function addLine(entryType: "DEBIT" | "CREDIT" = "DEBIT") {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, makeLine(accounts[0]?.id ?? 0, prev.currency ?? "BDT", prev.exchange_rate ?? "1", entryType)],
    }));
  }

  function copyLine(idx: number) {
    setForm((prev) => {
      const source = prev.lines[idx];
      if (!source) return prev;
      return { ...prev, lines: [...prev.lines, { ...source }] };
    });
  }

  function removeLine(idx: number) {
    setForm((prev) => (prev.lines.length <= 1 ? prev : { ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  }

  function setLineSideAmount(idx: number, side: "DEBIT" | "CREDIT", value: string) {
    setLine(idx, { entry_type: side, amount: value });
  }

  function autoBalanceVoucher() {
    const diff = debitTotal - creditTotal;
    if (Math.abs(diff) < 0.001) { setSuccess("Voucher is already balanced."); return; }
    const entryType: "DEBIT" | "CREDIT" = diff > 0 ? "CREDIT" : "DEBIT";
    const amount = Math.abs(diff).toFixed(2);
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { ...makeLine(accounts[0]?.id ?? 0, prev.currency ?? "BDT", prev.exchange_rate ?? "1", entryType), amount, notes: "Auto balance line" }],
    }));
    setSuccess("Auto-balance line added.");
  }

  function validateVoucherForm() {
    if (!form.voucher_type.trim()) throw new Error("Voucher type is required.");
    if (!form.voucher_date) throw new Error("Voucher date is required.");
    if (!(form.description ?? "").trim()) throw new Error("Narration is required for audit purposes.");
    if (multiCurrency) {
      if (!form.currency?.trim()) throw new Error("Transaction currency is required.");
      if (!form.base_currency?.trim()) throw new Error("Base currency is required.");
      if (Number(form.exchange_rate ?? 0) <= 0) throw new Error("Exchange rate must be greater than zero.");
    }
    if (form.lines.length < 2) throw new Error("Use at least two lines (debit and credit).");
    if (form.lines.some((line) => !line.account_id)) throw new Error("Select account for each line.");
    if (form.lines.some((line) => Number(line.amount) <= 0)) throw new Error("Line amount must be greater than zero.");
    if (!isBalanced) throw new Error("Voucher is not balanced.");
  }

  function resetForm() {
    setEditingVoucherId(null);
    setMultiCurrency(false);
    setLiveRateStatus("idle");
    setForm({
      voucher_type: voucherTypes[0] ?? "JOURNAL",
      voucher_date: new Date().toISOString().slice(0, 10),
      description: "",
      reference: "",
      currency: "BDT",
      base_currency: "BDT",
      exchange_rate: "1",
      trade_case_id: undefined,
      btb_lc_id: undefined,
      lines: [makeLine(accounts[0]?.id ?? 0, "BDT", "1", "DEBIT")],
    });
  }

  async function fetchLiveRate() {
    const cur = (form.currency ?? "BDT").toUpperCase();
    const base = (form.base_currency ?? "BDT").toUpperCase();
    if (cur === base) { setForm((p) => ({ ...p, exchange_rate: "1" })); return; }
    setLiveRateStatus("loading");
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
      const json = await res.json();
      if (json.result === "success" && json.rates?.[base]) {
        setForm((p) => ({ ...p, exchange_rate: String(json.rates[base]), exchange_rate_source: `open.er-api.com ${new Date().toISOString().slice(0, 10)}` }));
        setLiveRateStatus("fetched");
      } else {
        setLiveRateStatus("error");
      }
    } catch {
      setLiveRateStatus("error");
    }
  }

  async function submitVoucher(quickSubmit: boolean) {
    setError(null);
    setSuccess(null);
    try {
      validateVoucherForm();
      let voucher: VoucherResponse;
      if (editingVoucherId) {
        voucher = await api.updateVoucher(editingVoucherId, {
          voucher_type: form.voucher_type,
          voucher_date: form.voucher_date,
          description: form.description,
          reference: form.reference,
          currency: form.currency,
          base_currency: form.base_currency,
          exchange_rate: form.exchange_rate,
          lines: form.lines,
        });
      } else {
        voucher = await api.createVoucher(form);
      }
      if (quickSubmit) await api.updateVoucherStatus(voucher.id, "SUBMITTED");
      setSuccess(quickSubmit ? "Voucher saved and submitted." : editingVoucherId ? "Voucher updated." : "Voucher created.");
      resetForm();
      setShowCreate(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await submitVoucher(false);
  }

  async function takeAction(voucherId: number, action: string) {
    setError(null);
    setSuccess(null);
    try {
      if (action === "post") await api.postVoucher(voucherId);
      else if (action === "reverse") await api.reverseVoucher(voucherId);
      else {
        const nextStatus = ACTION_TO_STATUS[action];
        if (!nextStatus) throw new Error(`Unsupported action: ${action}`);
        await api.updateVoucherStatus(voucherId, nextStatus);
      }
      setSuccess(`Action complete: ${ACTION_LABEL[action] ?? action}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(voucher: VoucherResponse) {
    setEditingVoucherId(voucher.id);
    const isMc = voucher.currency !== voucher.base_currency;
    setMultiCurrency(isMc);
    setShowCreate(true);
    setForm({
      voucher_type: voucher.voucher_type,
      voucher_date: voucher.voucher_date,
      description: voucher.description ?? "",
      reference: voucher.reference ?? "",
      currency: voucher.currency,
      base_currency: voucher.base_currency,
      exchange_rate: voucher.exchange_rate,
      trade_case_id: voucher.trade_case_id,
      btb_lc_id: voucher.btb_lc_id,
      lines: voucher.lines.map((line) => ({
        account_id: line.account_id,
        cost_center_id: line.cost_center_id ?? null,
        currency: line.currency ?? voucher.currency,
        exchange_rate: line.exchange_rate ?? voucher.exchange_rate,
        base_amount: line.base_amount ?? undefined,
        is_rate_overridden: line.is_rate_overridden ?? false,
        rate_source: line.rate_source ?? "system",
        entry_type: line.entry_type,
        amount: line.amount,
        notes: line.notes ?? "",
      })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(voucherId: number) {
    if (!window.confirm("Delete this voucher? This cannot be undone.")) return;
    try {
      await api.deleteVoucher(voucherId);
      setSuccess("Voucher deleted.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const bdtEquivalent = multiCurrency ? (debitTotal * Number(form.exchange_rate || 1)).toFixed(2) : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Vouchers</h1>
          <p className="mt-1 text-sm text-text-muted">Create, manage and track accounting vouchers with multi-currency, cost center and digital verification.</p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          onClick={() => { resetForm(); setShowCreate(true); }}
        >
          + New Voucher
        </button>
      </div>

      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      {/* ─────────────── CREATE / EDIT FORM ─────────────── */}
      {showCreate ? (
        <form onSubmit={submit} className="space-y-5">
          {/* Card: Voucher Information */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{editingVoucherId ? `Edit Voucher #${editingVoucherId}` : "New Voucher"}</h2>
              <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => { resetForm(); setShowCreate(false); }}>
                Cancel
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Voucher Type</label>
                <select className={CTL} value={form.voucher_type} onChange={(e) => setForm((p) => ({ ...p, voucher_type: e.target.value }))}>
                  {voucherTypes.length === 0 ? <option value="JOURNAL">JOURNAL</option> : null}
                  {voucherTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Voucher Date</label>
                <input type="date" className={CTL} value={form.voucher_date} onChange={(e) => setForm((p) => ({ ...p, voucher_date: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">Reference</label>
                <input className={CTL} placeholder="e.g. INV-001" value={form.reference ?? ""} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-text-secondary">Narration <span className="text-status-danger-foreground">*</span></label>
                <input className={CTL} placeholder="Enter narration (required for audit)" value={form.description ?? ""} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Trade Case</label>
                  <input type="number" className={CTL} placeholder="ID" value={form.trade_case_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, trade_case_id: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">BTB LC</label>
                  <input type="number" className={CTL} placeholder="ID" value={form.btb_lc_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, btb_lc_id: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Card: Multi-Currency */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Multi-Currency Entry</h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-strong text-brand-primary focus:ring-brand-primary/20"
                  checked={multiCurrency}
                  onChange={(e) => {
                    setMultiCurrency(e.target.checked);
                    if (!e.target.checked) {
                      setForm((p) => ({ ...p, currency: "BDT", base_currency: "BDT", exchange_rate: "1" }));
                      setLiveRateStatus("idle");
                    }
                  }}
                />
                Enable Multi-Currency
              </label>
            </div>

            {multiCurrency ? (
              <div className="grid gap-4 md:grid-cols-4 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Transaction Currency</label>
                  <select
                    className={CTL}
                    value={form.currency ?? "BDT"}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, currency: e.target.value }));
                      setLiveRateStatus("idle");
                    }}
                  >
                    {["BDT", "USD", "EUR", "GBP", "JPY", "CNY", "INR", "AED", "SAR", "CAD", "AUD", "SGD", "MYR", "CHF"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Base Currency</label>
                  <select className={CTL} value={form.base_currency ?? "BDT"} onChange={(e) => { setForm((p) => ({ ...p, base_currency: e.target.value })); setLiveRateStatus("idle"); }}>
                    {["BDT", "USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Exchange Rate</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      className={CTL}
                      value={form.exchange_rate ?? "1"}
                      onChange={(e) => { setForm((p) => ({ ...p, exchange_rate: e.target.value })); setLiveRateStatus("idle"); }}
                    />
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-xs font-semibold text-brand-primary hover:bg-brand-primary/20"
                      onClick={() => void fetchLiveRate()}
                      disabled={liveRateStatus === "loading"}
                    >
                      {liveRateStatus === "loading" ? "Fetching..." : "Live Rate"}
                    </button>
                  </div>
                  {liveRateStatus === "fetched" ? (
                    <p className="mt-1 text-xs text-status-success-foreground">Live rate fetched from open.er-api.com</p>
                  ) : liveRateStatus === "error" ? (
                    <p className="mt-1 text-xs text-status-danger-foreground">Could not fetch live rate. Enter manually.</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">BDT Equivalent</label>
                  <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-text-primary">
                    {bdtEquivalent ? `${form.base_currency} ${Number(bdtEquivalent).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">Toggle on to record vouchers in foreign currencies with automatic or manual exchange rates.</p>
            )}
          </div>

          {/* Card: Voucher Items */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Voucher Items</h3>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => addLine("DEBIT")}>+ Debit Line</button>
                <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => addLine("CREDIT")}>+ Credit Line</button>
                <button type="button" className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/20" onClick={autoBalanceVoucher}>Auto Balance</button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle text-left">
                  <tr>
                    <th className="w-10 px-3 py-2 text-center">#</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Cost Center</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2">Notes / Narration</th>
                    <th className="w-24 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-3 py-2 text-center text-text-muted">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <select className={CTL} value={line.account_id} onChange={(e) => setLine(idx, { account_id: Number(e.target.value) })}>
                          <option value={0} disabled>Select account</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_number} — {a.name}{a.enable_bill_wise ? " [Bill-Wise]" : ""}</option>)}
                        </select>
                        {line.account_id > 0 && accounts.find((a) => a.id === line.account_id)?.enable_bill_wise ? (
                          <span className="mt-0.5 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Bill-Wise Enabled</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <select className={CTL} value={line.cost_center_id ?? ""} onChange={(e) => setLine(idx, { cost_center_id: e.target.value ? Number(e.target.value) : null })}>
                          <option value="">None</option>
                          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.center_code} — {c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input className={`${CTL} text-right`} type="number" min="0" step="0.01" placeholder="0.00" value={line.entry_type === "DEBIT" ? line.amount : ""} onChange={(e) => setLineSideAmount(idx, "DEBIT", e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={`${CTL} text-right`} type="number" min="0" step="0.01" placeholder="0.00" value={line.entry_type === "CREDIT" ? line.amount : ""} onChange={(e) => setLineSideAmount(idx, "CREDIT", e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={CTL} placeholder="Line description" value={line.notes ?? ""} onChange={(e) => setLine(idx, { notes: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button type="button" className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => copyLine(idx)}>Copy</button>
                          <button type="button" className="rounded-md border border-status-danger/30 px-2 py-1 text-xs text-status-danger-foreground hover:bg-status-danger-subtle" onClick={() => removeLine(idx)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card: Totals & Actions */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="grid gap-4 md:grid-cols-4 items-center">
              <div className="text-sm">Debit Total: <span className="font-semibold text-text-primary">{debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="text-sm">Credit Total: <span className="font-semibold text-text-primary">{creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className={`rounded-lg px-3 py-1.5 text-center text-sm font-semibold ${isBalanced ? "bg-status-success-subtle text-status-success-foreground" : "bg-status-danger-subtle text-status-danger-foreground"}`}>
                {isBalanced ? "Balanced" : `Difference: ${Math.abs(debitTotal - creditTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-status-info/30 bg-status-info-subtle px-4 py-2 text-sm font-medium text-status-info-foreground hover:bg-status-info-subtle/80"
                  onClick={() => void submitVoucher(true)}
                >
                  {editingVoucherId ? "Update & Submit" : "Save & Submit"}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
                >
                  {editingVoucherId ? "Update Draft" : "Save Draft"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {/* ─────────────── VOUCHER LIST ─────────────── */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Voucher List</h2>
          <div className="flex flex-wrap gap-2">
            <select className={`${CTL} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={`${CTL} md:w-72`} placeholder="Search number, type, reference, narration..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Narration</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Signed</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-5 text-text-muted" colSpan={10}>Loading vouchers...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td className="px-3 py-5 text-text-muted" colSpan={10}>No vouchers found.</td></tr>
              ) : (
                filteredRows.map((row) => {
                  const amount = row.lines.filter((l) => l.entry_type === "DEBIT").reduce((s, l) => s + Number(l.amount || 0), 0);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-border hover:bg-surface-subtle/50"
                      onClick={() => navigate(`/app/accounts/vouchers/${row.id}`)}
                    >
                      <td className="px-3 py-2 font-medium text-brand-primary">{row.voucher_number}</td>
                      <td className="px-3 py-2">{row.voucher_date}</td>
                      <td className="px-3 py-2">{row.voucher_type}</td>
                      <td className="px-3 py-2"><span className="rounded-md bg-surface-subtle px-2 py-0.5 text-xs font-medium">{row.status}</span></td>
                      <td className="max-w-[10rem] truncate px-3 py-2">{row.reference ?? "—"}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2">{row.description ?? "—"}</td>
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2 text-right font-medium">{amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">{row.signed_by_system ? <span className="text-status-success-foreground">Yes</span> : <span className="text-text-muted">No</span>}</td>
                      <td className="px-3 py-2">
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                          >
                            Actions
                          </button>
                          {openActionsId === row.id ? (
                            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => navigate(`/app/accounts/vouchers/${row.id}`)}>View Details</button>
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => startEdit(row)}>Edit</button>
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => navigate(`/app/accounts/vouchers/print?voucher_id=${row.id}`)}>Print / PDF</button>
                              {(availableActionMap[row.id] ?? []).map((action) => (
                                <button key={action} type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => void takeAction(row.id, action)}>
                                  {ACTION_LABEL[action] ?? action}
                                </button>
                              ))}
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger-foreground hover:bg-status-danger-subtle" onClick={() => void handleDelete(row.id)}>Delete</button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
