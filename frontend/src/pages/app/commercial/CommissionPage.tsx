import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type ChartOfAccountResponse,
  type CommissionDirection,
  type CommissionEntry,
  type CommissionRule,
  type CommissionSettings,
  type CommissionShipment,
  type CommissionStatement,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useConfirm } from "@/components/app/useConfirm";
import { listPageRootClass, listPageTableCardClass } from "@/components/app/listPageLayout";
import { logApiError } from "@/utils/logApiError";
import { todayLocalISO } from "@/lib/dates";
import { addMoney, sumMoneyBy } from "@/lib/money";

type Tab = "shipments" | "statements" | "rules";
type Option = { id: number; label: string };

const inputClass = "w-full rounded-lg border border-border-strong px-2.5 py-1.5 text-sm text-text-primary focus:border-brand-primary focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-text-secondary";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50";

const fmt = (v: string | number, currency?: string) =>
  `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;
const dirLabel = (d: CommissionDirection) => (d === "RECEIVABLE" ? "We earn" : "We pay");
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function useOptions() {
  const [orders, setOrders] = useState<Option[]>([]);
  const [vendors, setVendors] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [agents, setAgents] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  useEffect(() => {
    Promise.all([
      api.listOrdersPaginated({ page: 1, page_size: 200 }),
      api.listVendorsPaginated({ is_active: true, page: 1, page_size: 500 }),
      api.listCustomersPaginated({ page: 1, page_size: 500 }),
      api.listIntermediaries({ is_active: true }),
      api.listChartOfAccounts(),
    ])
      .then(([o, v, c, a, coa]) => {
        setOrders(o.items.map((x) => ({ id: x.id, label: `${x.order_code}${x.customer_name ? ` · ${x.customer_name}` : ""}` })));
        setVendors(v.items.map((x) => ({ id: x.id, label: x.name })));
        setCustomers(c.items.map((x) => ({ id: x.id, label: x.name })));
        setAgents(a.map((x) => ({ id: x.id, label: x.name })));
        setAccounts(coa);
      })
      .catch((e) => logApiError("CommissionPage.options", e));
  }, []);
  return { orders, vendors, customers, agents, accounts };
}

export function CommissionPage() {
  const [tab, setTab] = useState<Tab>("shipments");
  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const options = useOptions();

  useEffect(() => {
    api.getCommissionSettings().then(setSettings).catch((e) => logApiError("CommissionPage.settings", e));
  }, []);

  if (settings && !settings.enabled) {
    return (
      <div className={listPageRootClass}>
        <AppPageHeader title="Commission" description="Commission earned from factories and buyers, and paid to agents." />
        <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          The commission engine is turned off for this company. An admin can enable it in{" "}
          <Link to="/app/settings/config" className="font-medium text-brand-primary hover:underline">
            Settings → Configuration
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Commission"
        description="Record each shipment's FOB value; commission you earn (from factories/buyers) and pay (to agents) is calculated automatically."
      />
      <div role="tablist" aria-label="Commission sections" className="flex gap-1 border-b border-border">
        {(
          [
            ["shipments", "Shipments"],
            ["statements", "Statements"],
            ["rules", "Rules & settings"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key ? "border-brand-primary text-brand-primary" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "shipments" ? <ShipmentsTab options={options} /> : null}
      {tab === "statements" ? <StatementsTab /> : null}
      {tab === "rules" ? <RulesTab options={options} settings={settings} onSettings={setSettings} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ shipments */

function ShipmentsTab({ options }: { options: ReturnType<typeof useOptions> }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<CommissionShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [saving, setSaving] = useState(false);
  const today = todayLocalISO();
  const [form, setForm] = useState({
    order_id: "",
    vendor_id: "",
    shipment_ref: "",
    shipment_date: today,
    shipped_qty: "",
    shipped_value: "",
    currency: "USD",
    exchange_rate_to_base: "1",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listCommissionShipments());
    } catch (e) {
      logApiError("CommissionPage.shipments", e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.order_id || !form.shipment_ref.trim() || !form.shipped_value) return;
    setSaving(true);
    try {
      const created = await api.createCommissionShipment({
        order_id: Number(form.order_id),
        vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
        shipment_ref: form.shipment_ref.trim(),
        shipment_date: form.shipment_date,
        shipped_qty: form.shipped_qty ? Number(form.shipped_qty) : null,
        shipped_value: form.shipped_value,
        currency: form.currency.trim().toUpperCase() || "USD",
        exchange_rate_to_base: form.exchange_rate_to_base || "1",
      });
      toast.success(
        created.entries.length
          ? `Shipment ${created.shipment_ref} recorded with ${created.entries.length} commission line(s)`
          : `Shipment ${created.shipment_ref} recorded — no rule matched, so no commission was calculated`,
      );
      setForm((f) => ({ ...f, shipment_ref: "", shipped_qty: "", shipped_value: "" }));
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Could not record the shipment"));
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<GridColumn<CommissionShipment>[]>(() => {
    const sumDir = (s: CommissionShipment, d: CommissionDirection) =>
      sumMoneyBy(s.entries.filter((e) => e.direction === d), (e) => e.gross_amount);
    return [
      { id: "date", header: "Date", value: (s) => s.shipment_date, cell: (s) => s.shipment_date },
      { id: "ref", header: "Shipment ref", alwaysVisible: true, value: (s) => s.shipment_ref, cell: (s) => <span className="font-medium text-text-primary">{s.shipment_ref}</span> },
      { id: "order", header: "Order", value: (s) => s.order_code ?? "", cell: (s) => <Link className="text-brand-primary hover:underline" to={`/app/orders/${s.order_id}`}>{s.order_code}</Link> },
      { id: "factory", header: "Factory", value: (s) => s.vendor_name ?? "", cell: (s) => s.vendor_name ?? "—" },
      { id: "qty", header: "Pieces", align: "right", value: (s) => s.shipped_qty ?? null, cell: (s) => (s.shipped_qty ?? "—").toLocaleString() },
      { id: "value", header: "Shipped value", align: "right", value: (s) => Number(s.shipped_value), cell: (s) => fmt(s.shipped_value, s.currency) },
      { id: "earn", header: "We earn", align: "right", value: (s) => sumDir(s, "RECEIVABLE"), cell: (s) => fmt(sumDir(s, "RECEIVABLE"), s.currency) },
      { id: "pay", header: "We pay", align: "right", value: (s) => sumDir(s, "PAYABLE"), cell: (s) => fmt(sumDir(s, "PAYABLE"), s.currency) },
      {
        id: "status",
        header: "Status",
        value: (s) => (s.entries.some((e) => e.status === "STATEMENTED") ? "On statement" : "Pending"),
        cell: (s) => (s.entries.some((e) => e.status === "STATEMENTED") ? "On statement" : s.entries.length ? "Pending" : "No commission"),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        alwaysVisible: true,
        noExport: true,
        enableSorting: false,
        cell: (s) => {
          const locked = s.entries.some((e) => e.status === "STATEMENTED");
          const items: RowActionItem[] = [
            { key: "order", label: "Open order", href: `/app/orders/${s.order_id}` },
            {
              key: "recalc",
              label: "Recalculate",
              disabled: locked,
              onClick: async () => {
                try {
                  await api.recalculateCommissionShipment(s.id);
                  toast.success("Commission recalculated with current rules");
                  await load();
                } catch (e) {
                  toast.error(errMsg(e, "Recalculation failed"));
                }
              },
            },
            {
              key: "delete",
              label: "Delete",
              danger: true,
              disabled: locked,
              onClick: async () => {
                if (!(await confirm({ title: `Delete shipment ${s.shipment_ref}?`, description: "Its commission lines are removed too.", danger: true, confirmLabel: "Delete" }))) return;
                try {
                  await api.deleteCommissionShipment(s.id);
                  await load();
                } catch (e) {
                  toast.error(errMsg(e, "Delete failed"));
                }
              },
            },
          ];
          return <RowActionsMenu rowId={s.id} openId={openId} onOpenChange={setOpenId} items={items} />;
        },
      },
    ];
  }, [confirm, load, openId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
        <h2 className="text-sm font-semibold text-text-primary sm:col-span-2 lg:col-span-4">Record a shipment</h2>
        <div>
          <label className={labelClass} htmlFor="cs-order">Order *</label>
          <select id="cs-order" required value={form.order_id} onChange={set("order_id")} className={inputClass}>
            <option value="">Select order…</option>
            {options.orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-factory">Factory (if we earn from it)</label>
          <select id="cs-factory" value={form.vendor_id} onChange={set("vendor_id")} className={inputClass}>
            <option value="">—</option>
            {options.vendors.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-ref">Shipment / invoice ref *</label>
          <input id="cs-ref" required maxLength={64} value={form.shipment_ref} onChange={set("shipment_ref")} placeholder="e.g. INV-2026-014" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-date">Shipment date *</label>
          <input id="cs-date" type="date" required value={form.shipment_date} onChange={set("shipment_date")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-value">Shipped FOB value *</label>
          <input id="cs-value" type="number" min={0} step="0.01" required value={form.shipped_value} onChange={set("shipped_value")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-currency">Currency</label>
          <input id="cs-currency" maxLength={10} value={form.currency} onChange={set("currency")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-rate">Rate to BDT</label>
          <input id="cs-rate" type="number" min={0} step="0.0001" value={form.exchange_rate_to_base} onChange={set("exchange_rate_to_base")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="cs-qty">Pieces (for per-piece rates)</label>
          <input id="cs-qty" type="number" min={0} value={form.shipped_qty} onChange={set("shipped_qty")} className={inputClass} />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Record shipment
          </button>
        </div>
      </form>
      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="commission.shipments"
          exportName="commission-shipments"
          columns={columns}
          rows={rows}
          getRowId={(s) => s.id}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No shipments recorded yet.</p>}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ statements */

type PendingGroup = {
  key: string;
  direction: CommissionDirection;
  counterparty_type: CommissionEntry["counterparty_type"];
  counterparty_id: number;
  counterparty_name: string;
  currency: string;
  count: number;
  gross: number;
  net: number;
};

function StatementsTab() {
  const confirm = useConfirm();
  const [pending, setPending] = useState<CommissionEntry[]>([]);
  const [statements, setStatements] = useState<CommissionStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([api.listCommissionEntries({ status: "PENDING" }), api.listCommissionStatements()]);
      setPending(p);
      setStatements(s);
    } catch (e) {
      logApiError("CommissionPage.statements", e);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo<PendingGroup[]>(() => {
    const map = new Map<string, PendingGroup>();
    for (const e of pending) {
      const key = `${e.direction}|${e.counterparty_type}|${e.counterparty_id}|${e.currency}`;
      const g = map.get(key) ?? {
        key,
        direction: e.direction,
        counterparty_type: e.counterparty_type,
        counterparty_id: e.counterparty_id,
        counterparty_name: e.counterparty_name ?? `#${e.counterparty_id}`,
        currency: e.currency,
        count: 0,
        gross: 0,
        net: 0,
      };
      g.count += 1;
      g.gross = addMoney(g.gross, e.gross_amount);
      g.net = addMoney(g.net, e.net_amount);
      map.set(key, g);
    }
    return [...map.values()];
  }, [pending]);

  const createStatement = async (g: PendingGroup) => {
    setBusy(g.key);
    try {
      const st = await api.createCommissionStatement({
        direction: g.direction,
        counterparty_type: g.counterparty_type,
        counterparty_id: g.counterparty_id,
        currency: g.currency,
      });
      toast.success(`Statement ${st.statement_code} created as a draft`);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not create the statement"));
    } finally {
      setBusy(null);
    }
  };

  const columns = useMemo<GridColumn<CommissionStatement>[]>(
    () => [
      { id: "code", header: "Statement", alwaysVisible: true, value: (s) => s.statement_code, cell: (s) => <span className="font-medium text-text-primary">{s.statement_code}</span> },
      { id: "date", header: "Date", value: (s) => s.statement_date, cell: (s) => s.statement_date },
      { id: "direction", header: "Type", value: (s) => dirLabel(s.direction), cell: (s) => dirLabel(s.direction) },
      { id: "party", header: "Party", value: (s) => s.counterparty_name ?? "", cell: (s) => s.counterparty_name ?? "—" },
      { id: "gross", header: "Gross", align: "right", value: (s) => Number(s.gross_total), cell: (s) => fmt(s.gross_total, s.currency) },
      { id: "tax", header: "TDS + VDS", align: "right", value: (s) => addMoney(s.tds_total, s.vds_total), cell: (s) => fmt(addMoney(s.tds_total, s.vds_total), s.currency) },
      { id: "net", header: "Net", align: "right", value: (s) => Number(s.net_total), cell: (s) => fmt(s.net_total, s.currency) },
      { id: "status", header: "Status", value: (s) => s.status, cell: (s) => s.status },
      {
        id: "voucher",
        header: "Voucher",
        value: (s) => s.voucher_number ?? "",
        cell: (s) => (s.voucher_id ? <Link className="text-brand-primary hover:underline" to={`/app/accounts/vouchers/${s.voucher_id}`}>{s.voucher_number}</Link> : "—"),
      },
      {
        id: "actions",
        header: "Actions",
        align: "right",
        alwaysVisible: true,
        noExport: true,
        enableSorting: false,
        cell: (s) => {
          const items: RowActionItem[] = [];
          if (s.status === "DRAFT")
            items.push({
              key: "issue",
              label: "Issue",
              onClick: async () => {
                const ok = await confirm({
                  title: `Issue ${s.statement_code}?`,
                  description: "A DRAFT journal voucher is created for accounts to review and post.",
                  confirmLabel: "Issue",
                });
                if (!ok) return;
                try {
                  const res = await api.issueCommissionStatement(s.id);
                  if (res.warning) toast.warning(res.warning);
                  else toast.success(`Issued — draft voucher ${res.voucher_number} created`);
                  await load();
                } catch (e) {
                  toast.error(errMsg(e, "Issue failed"));
                }
              },
            });
          if (s.voucher_id) items.push({ key: "voucher", label: "Open voucher", href: `/app/accounts/vouchers/${s.voucher_id}` });
          if (s.status !== "CANCELLED")
            items.push({
              key: "cancel",
              label: "Cancel",
              danger: true,
              onClick: async () => {
                const ok = await confirm({
                  title: `Cancel ${s.statement_code}?`,
                  description: "Its commission lines return to pending. A draft voucher is cancelled; a posted voucher must be reversed in Accounts first.",
                  danger: true,
                  confirmLabel: "Cancel statement",
                });
                if (!ok) return;
                try {
                  await api.cancelCommissionStatement(s.id);
                  await load();
                } catch (e) {
                  toast.error(errMsg(e, "Cancel failed"));
                }
              },
            });
          return items.length ? <RowActionsMenu rowId={s.id} openId={openId} onOpenChange={setOpenId} items={items} /> : null;
        },
      },
    ],
    [confirm, load, openId],
  );

  return (
    <>
      <section className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">Pending commission</h2>
        <p className="mb-3 text-xs text-text-muted">Grouped by party and currency. Create a statement to invoice (we earn) or settle (we pay).</p>
        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing pending.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {groups.map((g) => (
              <li key={g.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.direction === "RECEIVABLE" ? "bg-status-success-subtle text-status-success-foreground" : "bg-status-warning-subtle text-status-warning-foreground"}`}>
                    {dirLabel(g.direction)}
                  </span>
                  <span className="font-medium text-text-primary">{g.counterparty_name}</span>
                  <span className="text-text-muted"> · {g.count} shipment line(s) · gross {fmt(g.gross, g.currency)} · net {fmt(g.net, g.currency)}</span>
                </span>
                <button type="button" disabled={busy === g.key} onClick={() => void createStatement(g)} className={btnPrimary}>
                  {busy === g.key ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Create statement
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="commission.statements"
          exportName="commission-statements"
          columns={columns}
          rows={statements}
          getRowId={(s) => s.id}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No statements yet.</p>}
        />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ rules & settings */

const ACCOUNT_FIELDS: { key: keyof CommissionSettings; label: string }[] = [
  { key: "income_account_id", label: "Commission income" },
  { key: "receivable_account_id", label: "Commission receivable" },
  { key: "tds_receivable_account_id", label: "TDS/AIT deducted by payer (asset)" },
  { key: "vds_receivable_account_id", label: "VDS deducted by payer (asset)" },
  { key: "expense_account_id", label: "Commission expense (agents)" },
  { key: "payable_account_id", label: "Commission payable (agents)" },
  { key: "tds_payable_account_id", label: "TDS/AIT payable" },
  { key: "vds_payable_account_id", label: "VDS payable" },
];

function RulesTab({
  options,
  settings,
  onSettings,
}: {
  options: ReturnType<typeof useOptions>;
  settings: CommissionSettings | null;
  onSettings: (s: CommissionSettings) => void;
}) {
  const confirm = useConfirm();
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [draft, setDraft] = useState<CommissionSettings | null>(settings);
  const [rule, setRule] = useState({ direction: "RECEIVABLE" as CommissionDirection, scope: "DEFAULT" as CommissionRule["scope"], target: "", rate_type: "PERCENTAGE" as "PERCENTAGE" | "FIXED", rate: "" });

  useEffect(() => setDraft(settings), [settings]);
  const load = useCallback(async () => {
    try {
      setRules(await api.listCommissionRules());
    } catch (e) {
      logApiError("CommissionPage.rules", e);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const scopes: CommissionRule["scope"][] = rule.direction === "RECEIVABLE" ? ["DEFAULT", "VENDOR", "CUSTOMER"] : ["DEFAULT", "INTERMEDIARY"];
  const targets = rule.scope === "VENDOR" ? options.vendors : rule.scope === "CUSTOMER" ? options.customers : rule.scope === "INTERMEDIARY" ? options.agents : [];

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCommissionRule({
        direction: rule.direction,
        scope: rule.scope,
        customer_id: rule.scope === "CUSTOMER" ? Number(rule.target) : null,
        vendor_id: rule.scope === "VENDOR" ? Number(rule.target) : null,
        intermediary_id: rule.scope === "INTERMEDIARY" ? Number(rule.target) : null,
        rate_type: rule.rate_type,
        rate: rule.rate,
      });
      setRule((r) => ({ ...r, target: "", rate: "" }));
      toast.success("Rule added");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Could not add the rule"));
    }
  };

  const saveSettings = async () => {
    if (!draft) return;
    try {
      const { enabled: _enabled, ...body } = draft;
      void _enabled;
      onSettings(await api.saveCommissionSettings(body));
      toast.success("Commission settings saved");
    } catch (e) {
      toast.error(errMsg(e, "Could not save settings"));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">Commission rules</h2>
        <p className="text-xs text-text-muted">
          The most specific rule wins: factory or buyer rules before the default. Commission terms typed on an order override rules —
          they count as agent commission when the order has an agent, otherwise as commission you earn.
        </p>
        <ul className="divide-y divide-border-subtle text-sm">
          {rules.length === 0 ? <li className="py-2 text-text-muted">No rules yet.</li> : null}
          {rules.map((r) => (
            <li key={r.id} className={`flex items-center justify-between gap-2 py-2 ${r.is_active ? "" : "opacity-50"}`}>
              <span>
                <span className="font-medium text-text-primary">{dirLabel(r.direction)}</span>
                <span className="text-text-secondary"> · {r.scope === "DEFAULT" ? "Default" : r.target_name ?? r.scope}</span>
                <span className="text-text-muted"> · {r.rate_type === "PERCENTAGE" ? `${Number(r.rate)}% of FOB` : `${Number(r.rate)} per piece`}</span>
              </span>
              <RowActionsMenu
                rowId={r.id}
                openId={openId}
                onOpenChange={setOpenId}
                items={[
                  {
                    key: "toggle",
                    label: r.is_active ? "Deactivate" : "Activate",
                    onClick: async () => {
                      await api.updateCommissionRule(r.id, { is_active: !r.is_active }).catch((e) => toast.error(errMsg(e, "Update failed")));
                      await load();
                    },
                  },
                  {
                    key: "delete",
                    label: "Delete",
                    danger: true,
                    onClick: async () => {
                      if (!(await confirm({ title: "Delete this rule?", danger: true, confirmLabel: "Delete" }))) return;
                      await api.deleteCommissionRule(r.id).catch((e) => toast.error(errMsg(e, "Delete failed")));
                      await load();
                    },
                  },
                ]}
              />
            </li>
          ))}
        </ul>
        <form onSubmit={addRule} className="grid gap-2 border-t border-border-subtle pt-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="cr-dir">Direction</label>
            <select id="cr-dir" value={rule.direction} onChange={(e) => setRule({ ...rule, direction: e.target.value as CommissionDirection, scope: "DEFAULT", target: "" })} className={inputClass}>
              <option value="RECEIVABLE">We earn (from factory/buyer)</option>
              <option value="PAYABLE">We pay (to agent)</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="cr-scope">Applies to</label>
            <select id="cr-scope" value={rule.scope} onChange={(e) => setRule({ ...rule, scope: e.target.value as CommissionRule["scope"], target: "" })} className={inputClass}>
              {scopes.map((s) => (
                <option key={s} value={s}>{s === "DEFAULT" ? "Everyone (default)" : s === "VENDOR" ? "One factory" : s === "CUSTOMER" ? "One buyer" : "One agent"}</option>
              ))}
            </select>
          </div>
          {rule.scope !== "DEFAULT" ? (
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="cr-target">Which one</label>
              <select id="cr-target" required value={rule.target} onChange={(e) => setRule({ ...rule, target: e.target.value })} className={inputClass}>
                <option value="">Select…</option>
                {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="cr-type">Rate type</label>
            <select id="cr-type" value={rule.rate_type} onChange={(e) => setRule({ ...rule, rate_type: e.target.value as "PERCENTAGE" | "FIXED" })} className={inputClass}>
              <option value="PERCENTAGE">% of shipped FOB value</option>
              <option value="FIXED">Fixed amount per piece</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="cr-rate">Rate</label>
            <input id="cr-rate" type="number" min={0} step="0.0001" required value={rule.rate} onChange={(e) => setRule({ ...rule, rate: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary}><Plus className="h-4 w-4" aria-hidden /> Add rule</button>
          </div>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">Tax and accounts</h2>
        <p className="text-xs text-text-muted">
          TDS/AIT and VDS are deducted from each commission line. Accounts are used for the draft voucher created when a statement is issued; without them the
          statement is issued without a voucher.
        </p>
        {draft ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="cset-tds">TDS / AIT %</label>
              <input id="cset-tds" type="number" min={0} max={100} step="0.001" value={draft.tds_rate_pct} onChange={(e) => setDraft({ ...draft, tds_rate_pct: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="cset-vds">VDS %</label>
              <input id="cset-vds" type="number" min={0} max={100} step="0.001" value={draft.vds_rate_pct} onChange={(e) => setDraft({ ...draft, vds_rate_pct: e.target.value })} className={inputClass} />
            </div>
            {ACCOUNT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className={labelClass} htmlFor={`cset-${f.key}`}>{f.label}</label>
                <select
                  id={`cset-${f.key}`}
                  value={(draft[f.key] as number | null) ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value ? Number(e.target.value) : null })}
                  className={inputClass}
                >
                  <option value="">Not set</option>
                  {options.accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.account_number} · {a.name}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="sm:col-span-2">
              <button type="button" onClick={() => void saveSettings()} className={btnPrimary}>Save settings</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Loading…</p>
        )}
      </section>
    </div>
  );
}
