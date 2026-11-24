import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useMatch } from "react-router-dom";
import { api } from "@/api/client";
import {
  jobWorkApi,
  type JobWorkBill,
  type JobWorkCloseReport,
  type JobWorkContractDetail,
  type JobWorkDelivery,
  type JobWorkReceipt,
} from "@/api/jobWork";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LinkedRecordsSection } from "@/components/app/LinkedRecordsSection";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { mobilePageStickyActionsClass } from "@/components/app/listPageLayout";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { formatMoney } from "@/lib/money";
import { fetchCustomerPage, fetchInventoryItemPage, hydrateCustomer, hydrateInventoryItem } from "@/lib/remoteSelectFetchers";
import { logApiError } from "@/utils/logApiError";
import { JobWorkBillingPanel } from "./components/JobWorkBillingPanel";
import { JobWorkDeliverablesPanel } from "./components/JobWorkDeliverablesPanel";
import { JobWorkMaterialsPanel } from "./components/JobWorkMaterialsPanel";

type TabId = "contract" | "materials" | "production" | "delivery" | "billing";

const requiredBorder = "border-amber-400 bg-amber-50";

export function InboundJobWorkDetailPage() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const isNew = Boolean(useMatch({ path: "/app/production/job-work/new", end: true }));
  const idNum = jobId && jobId !== "new" ? Number(jobId) : NaN;

  const [tab, setTab] = useState<TabId>("contract");
  const [detail, setDetail] = useState<JobWorkContractDetail | null>(null);
  const [deliveries, setDeliveries] = useState<JobWorkDelivery[]>([]);
  const [bills, setBills] = useState<JobWorkBill[]>([]);
  const [receipts, setReceipts] = useState<JobWorkReceipt[]>([]);
  const [closeReport, setCloseReport] = useState<JobWorkCloseReport | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && isNew);

  // create form
  const [customerId, setCustomerId] = useState(0);
  const [cmRate, setCmRate] = useState("");
  const [currency, setCurrency] = useState("BDT");
  const [fx, setFx] = useState("1");
  const [vatPct, setVatPct] = useState("");
  const [doCutting, setDoCutting] = useState(true);
  const [doSewing, setDoSewing] = useState(true);
  const [doFinishing, setDoFinishing] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [styleRef, setStyleRef] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [qtyOrdered, setQtyOrdered] = useState("0");
  const [matItemId, setMatItemId] = useState(0);
  const [matConsumption, setMatConsumption] = useState("0");
  const [matPlanned, setMatPlanned] = useState("0");

  // ops
  const [matQty, setMatQty] = useState("1");
  const [matLineId, setMatLineId] = useState(0);
  const [prodQty, setProdQty] = useState<Record<number, string>>({});
  const [delQty, setDelQty] = useState<Record<number, string>>({});
  const [rejQty, setRejQty] = useState<Record<number, string>>({});
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptBillId, setReceiptBillId] = useState(0);
  const [cashAccountId, setCashAccountId] = useState(0);
  const [accounts, setAccounts] = useState<Array<{ id: number; label: string }>>([]);

  const load = useCallback(async () => {
    if (!Number.isFinite(idNum)) return;
    setLoading(true);
    setError("");
    try {
      const d = await jobWorkApi.getContract(idNum);
      setDetail(d);
      const [dels, bs, rs, preview] = await Promise.all([
        jobWorkApi.listDeliveries(idNum),
        jobWorkApi.listBills(idNum),
        jobWorkApi.listReceipts(idNum),
        jobWorkApi.closePreview(idNum).catch(() => null),
      ]);
      setDeliveries(dels);
      setBills(bs);
      setReceipts(rs);
      setCloseReport(preview);
      const pq: Record<number, string> = {};
      for (const line of d.deliverables) pq[line.id] = line.qty_produced;
      setProdQty(pq);
      if (d.materials[0]) setMatLineId(d.materials[0].id);
      if (bs[0]) setReceiptBillId(bs[0].id);
    } catch (e) {
      logApiError("InboundJobWorkDetailPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [idNum]);

  useEffect(() => {
    if (!isNew) void load();
  }, [isNew, load]);

  useEffect(() => {
    void api
      .listChartOfAccounts({ active_only: true })
      .then((rows) =>
        setAccounts(
          rows.map((a) => ({
            id: a.id,
            label: `${a.account_number || a.id} — ${a.name || ""}`,
          })),
        ),
      )
      .catch((e) => logApiError("InboundJobWorkDetailPage.accounts", e));
  }, []);

  const workflowItems = useMemo(() => {
    const status = (detail?.status || (isNew ? "DRAFT" : "")).toUpperCase();
    return [
      { label: "Status", value: status || "—" },
      { label: "Ordered", value: detail?.qty_ordered_total || "0" },
      { label: "Delivered", value: detail?.qty_delivered_accepted || "0" },
      { label: "Billable", value: detail?.billable_qty || "0" },
      { label: "Billed", value: detail ? `${formatMoney(detail.amount_billed)} ${detail.currency}` : "—" },
      { label: "Received", value: detail ? `${formatMoney(detail.amount_received)} ${detail.currency}` : "—" },
    ];
  }, [detail, isNew]);

  async function createContract() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (!customerId || !cmRate || !(doCutting || doSewing || doFinishing)) {
        setError("Customer, CM rate and at least one process are required");
        return;
      }
      const created = await jobWorkApi.createContract({
        customer_id: customerId,
        cm_rate: cmRate,
        currency,
        exchange_rate_default: fx || "1",
        vat_rate_pct: vatPct || "0",
        do_cutting: doCutting,
        do_sewing: doSewing,
        do_finishing: doFinishing,
        location_label: locationLabel || null,
        notes: notes || null,
        deliverables: [
          {
            style_ref: styleRef || null,
            color: color || null,
            size: size || null,
            qty_ordered: qtyOrdered || "0",
          },
        ],
        materials: matItemId
          ? [{ item_id: matItemId, consumption_per_unit: matConsumption || "0", qty_planned: matPlanned || "0" }]
          : [],
      });
      setDirty(false);
      navigate(`/app/production/job-work/${created.id}`, { replace: true });
    } catch (e) {
      logApiError("InboundJobWorkDetailPage.create", e);
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function run(action: () => Promise<unknown>, ok: string) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await action();
      setSuccess(ok);
      await load();
    } catch (e) {
      logApiError("InboundJobWorkDetailPage.action", e);
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  if (isNew) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <AppPageHeader
          title="New inbound job work"
          description="Contract from another factory — they supply materials; you charge one CM rate on delivered pieces"
          backTo={{ label: "Job work list", to: "/app/production/job-work" }}
        />
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-2">
          <label className="text-sm">
            Customer (principal factory) *
            <div className="mt-1">
              <RemoteSearchSelect
                value={customerId || null}
                onChange={(v) => {
                  setCustomerId(Number(v || 0));
                  setDirty(true);
                }}
                fetchPage={fetchCustomerPage}
                hydrateById={hydrateCustomer}
                placeholder="Search customer"
                className={!customerId ? requiredBorder : undefined}
              />
            </div>
          </label>
          <label className="text-sm">
            CM rate *
            <input
              value={cmRate}
              onChange={(e) => {
                setCmRate(e.target.value);
                setDirty(true);
              }}
              className={`mt-1 w-full rounded-lg border px-3 py-2 ${!cmRate ? requiredBorder : "border-gray-300"}`}
            />
          </label>
          <label className="text-sm">
            Currency
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            Exchange rate (if not BDT)
            <input value={fx} onChange={(e) => setFx(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm md:col-span-2">
            VAT % (optional — leave empty for nil)
            <input value={vatPct} onChange={(e) => setVatPct(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="0" />
          </label>
          <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={doCutting} onChange={(e) => setDoCutting(e.target.checked)} /> Cutting
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={doSewing} onChange={(e) => setDoSewing(e.target.checked)} /> Sewing
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={doFinishing} onChange={(e) => setDoFinishing(e.target.checked)} /> Finishing
            </label>
          </div>
          <label className="text-sm">
            Style / colour / size
            <div className="mt-1 grid grid-cols-3 gap-2">
              <input value={styleRef} onChange={(e) => setStyleRef(e.target.value)} placeholder="Style" className="rounded-lg border border-gray-300 px-2 py-2" />
              <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Color" className="rounded-lg border border-gray-300 px-2 py-2" />
              <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" className="rounded-lg border border-gray-300 px-2 py-2" />
            </div>
          </label>
          <label className="text-sm">
            Ordered qty
            <input value={qtyOrdered} onChange={(e) => setQtyOrdered(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="text-sm md:col-span-2">
            First material (optional — add more after create)
            <div className="mt-1">
              <RemoteSearchSelect
                value={matItemId || null}
                onChange={(v) => setMatItemId(Number(v || 0))}
                fetchPage={fetchInventoryItemPage}
                hydrateById={hydrateInventoryItem}
                placeholder="Search item"
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input value={matConsumption} onChange={(e) => setMatConsumption(e.target.value)} placeholder="Consumption / pc" className="rounded-lg border border-gray-300 px-2 py-2" />
              <input value={matPlanned} onChange={(e) => setMatPlanned(e.target.value)} placeholder="Planned qty" className="rounded-lg border border-gray-300 px-2 py-2" />
            </div>
          </label>
          <label className="text-sm md:col-span-2">
            Location / notes
            <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="Floor / line" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2" rows={2} />
          </label>
        </div>
        <div className={mobilePageStickyActionsClass}>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createContract()}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create contract"}
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{error || "Contract not found"}</p>
        <Link to="/app/production/job-work" className="text-brand-primary">
          Back to list
        </Link>
      </div>
    );
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "contract", label: "Contract" },
    { id: "materials", label: "Materials" },
    { id: "production", label: "Production" },
    { id: "delivery", label: "Delivery" },
    { id: "billing", label: "Billing & payment" },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title={detail.contract_no}
        description={`${detail.customer_name || `Customer #${detail.customer_id}`} · ${detail.status} · CM ${formatMoney(detail.cm_rate)} ${detail.currency}`}
        backTo={{ label: "Job work list", to: "/app/production/job-work" }}
        actions={
          <div className="flex flex-wrap gap-2">
            {detail.status === "DRAFT" ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                onClick={() => void run(() => jobWorkApi.confirmContract(detail.id), "Confirmed")}
              >
                Confirm
              </button>
            ) : null}
            {detail.status !== "CLOSED" ? (
              <button
                type="button"
                disabled={saving || !(closeReport?.can_close)}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => void run(() => jobWorkApi.closeContract(detail.id), "Closed")}
              >
                Close job
              </button>
            ) : null}
          </div>
        }
        belowTitle={<WorkflowSummaryStrip items={workflowItems} />}
      />

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p> : null}

      <LinkedRecordsSection
        title="Linked records"
        columns={[
          {
            title: "Bills",
            rows: bills
              .filter((b) => b.voucher_id)
              .map((b) => ({
                id: b.id,
                label: b.bill_no,
                sub: `${formatMoney(b.gross_amount)} ${b.currency} · ${b.status}`,
                to: `/app/accounts/vouchers/${b.voucher_id}`,
              })),
          },
          {
            title: "Receipts",
            rows: receipts
              .filter((r) => r.voucher_id)
              .map((r) => ({
                id: r.id,
                label: r.receipt_no,
                sub: `${formatMoney(r.amount)} ${r.currency}`,
                to: `/app/accounts/vouchers/${r.voucher_id}`,
              })),
          },
          {
            title: "Deliveries",
            rows: deliveries.map((d) => ({
              id: d.id,
              label: d.delivery_no,
              sub: `Accepted ${d.qty_accepted}`,
              to: `/app/production/job-work/${detail.id}`,
            })),
          },
        ]}
      />

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "contract" ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <p>
            Processes: {[detail.do_cutting && "Cutting", detail.do_sewing && "Sewing", detail.do_finishing && "Finishing"]
              .filter(Boolean)
              .join(", ") || "—"}
          </p>
          <p className="mt-1">Ordered {detail.qty_ordered_total} · Produced {detail.qty_produced_total} · Accepted delivered {detail.qty_delivered_accepted} · Billable {detail.billable_qty}</p>
          <p className="mt-1">Billed {formatMoney(detail.amount_billed)} · Received {formatMoney(detail.amount_received)} {detail.currency}</p>
          {detail.notes ? <p className="mt-2 text-gray-600">{detail.notes}</p> : null}
          {closeReport && !closeReport.can_close ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">Cannot close yet</p>
              <ul className="mt-1 list-disc pl-5">
                {closeReport.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {closeReport?.warnings?.length ? (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {closeReport.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tab === "materials" ? (
        <JobWorkMaterialsPanel
          detail={detail}
          matLineId={matLineId}
          matQty={matQty}
          saving={saving}
          onMatLineId={setMatLineId}
          onMatQty={setMatQty}
          onAction={run}
        />
      ) : null}

      {tab === "production" ? (
        <JobWorkDeliverablesPanel
          mode="production"
          detail={detail}
          deliveries={deliveries}
          prodQty={prodQty}
          delQty={delQty}
          rejQty={rejQty}
          saving={saving}
          onProdQty={(id, qty) => setProdQty((p) => ({ ...p, [id]: qty }))}
          onDelQty={(id, qty) => setDelQty((p) => ({ ...p, [id]: qty }))}
          onRejQty={(id, qty) => setRejQty((p) => ({ ...p, [id]: qty }))}
          onAction={run}
        />
      ) : null}

      {tab === "delivery" ? (
        <JobWorkDeliverablesPanel
          mode="delivery"
          detail={detail}
          deliveries={deliveries}
          prodQty={prodQty}
          delQty={delQty}
          rejQty={rejQty}
          saving={saving}
          onProdQty={(id, qty) => setProdQty((p) => ({ ...p, [id]: qty }))}
          onDelQty={(id, qty) => setDelQty((p) => ({ ...p, [id]: qty }))}
          onRejQty={(id, qty) => setRejQty((p) => ({ ...p, [id]: qty }))}
          onAction={run}
        />
      ) : null}

      {tab === "billing" ? (
        <JobWorkBillingPanel
          detail={detail}
          bills={bills}
          receipts={receipts}
          receiptBillId={receiptBillId}
          receiptAmount={receiptAmount}
          cashAccountId={cashAccountId}
          accounts={accounts}
          saving={saving}
          onReceiptBillId={setReceiptBillId}
          onReceiptAmount={setReceiptAmount}
          onCashAccountId={setCashAccountId}
          onAction={run}
        />
      ) : null}
    </div>
  );
}
