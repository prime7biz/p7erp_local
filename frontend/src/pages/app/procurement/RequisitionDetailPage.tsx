/**
 * One requisition: approval steps, supplier quotations, the Comparative Statement (CS) grid,
 * supplier selection with a recorded reason, and "Create PO". Flag: procurement_cs_enabled.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type ComparativeStatement,
  type InventoryItemResponse,
  type RequisitionDetail,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { VendorQuickCreateModal } from "@/components/quick-create/VendorQuickCreateModal";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { useAuth } from "@/context/AuthContext";
import { resolveRole } from "@/lib/roles";
import { logApiError } from "@/utils/logApiError";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { getInventoryItemsCached } from "@/lib/masterData";
import { fetchVendorPage, hydrateVendor } from "@/lib/remoteSelectFetchers";
import { RequisitionStatusBadge } from "./RequisitionStatusBadge";

const CTL = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const BTN = "rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50";
const BTN_PRIMARY = "rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50";

type ReasonAsk =
  | { kind: "status"; status: "REJECTED" | "CANCELLED" }
  | { kind: "select"; quotationId: number; vendorName: string; isLowest: boolean };

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export function RequisitionDetailPage() {
  const { requisitionId } = useParams();
  const id = Number(requisitionId);
  const navigate = useNavigate();
  const { me } = useAuth();
  const canApprove = resolveRole(me?.role_name).isElevated;

  const [pr, setPr] = useState<RequisitionDetail | null>(null);
  const [cs, setCs] = useState<ComparativeStatement | null>(null);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk | null>(null);
  const [vendorCreateOpen, setVendorCreateOpen] = useState(false);

  const [qVendor, setQVendor] = useState<number | "">("");
  const [qRef, setQRef] = useState("");
  const [qCurrency, setQCurrency] = useState("USD");
  const [qDays, setQDays] = useState("");
  const [qTerms, setQTerms] = useState("");
  const [qPrices, setQPrices] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const [detail, statement] = await Promise.all([api.getRequisition(id), api.getComparativeStatement(id)]);
      setPr(detail);
      setCs(statement);
    } catch (e) {
      logApiError("RequisitionDetailPage.load", e);
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (Number.isFinite(id) && id > 0) void load();
  }, [id, load]);

  useEffect(() => {
    void getInventoryItemsCached()
      .then(setItems)
      .catch((e) => logApiError("RequisitionDetailPage.masters", e));
  }, []);

  const itemLabel = useMemo(() => new Map(items.map((i) => [i.id, `${i.item_code} - ${i.name}`])), [items]);

  async function run(fn: () => Promise<unknown>, okMessage: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(okMessage);
      await load();
    } catch (e) {
      logApiError("RequisitionDetailPage.action", e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addQuotation() {
    if (!pr || !qVendor) return setError("Choose a supplier.");
    const lines = pr.lines
      .filter((ln) => (qPrices[ln.id] ?? "").trim() !== "")
      .map((ln) => ({ requisition_line_id: ln.id, unit_price: qPrices[ln.id] ?? "0" }));
    if (lines.length === 0) return setError("Enter a price for at least one line.");
    await run(
      () =>
        api.addSupplierQuotation(pr.id, {
          vendor_id: Number(qVendor),
          quote_ref: qRef || null,
          currency: qCurrency || null,
          delivery_days: qDays ? Number(qDays) : null,
          payment_terms: qTerms || null,
          lines,
        }),
      "Quotation added.",
    );
    setQVendor("");
    setQRef("");
    setQDays("");
    setQTerms("");
    setQPrices({});
  }

  async function createPo() {
    if (!pr) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.createPoFromRequisition(pr.id);
      setNotice(`Purchase order ${res.po_code} created as DRAFT.`);
      await load();
    } catch (e) {
      logApiError("RequisitionDetailPage.createPo", e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!pr) {
    return <div className="py-16 text-center text-sm text-text-muted">{error || "Loading…"}</div>;
  }

  const st = pr.status;
  const quoteCols = cs?.quotations ?? [];

  return (
    <div className="space-y-6">
      <AppPageHeader
        title={`Requisition ${pr.pr_code}`}
        description={[pr.department, pr.purpose, pr.required_date ? `required by ${pr.required_date}` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RequisitionStatusBadge status={st} />
            {st === "DRAFT" || st === "REJECTED" ? (
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void run(() => api.setRequisitionStatus(pr.id, st === "REJECTED" ? "DRAFT" : "SUBMITTED"), st === "REJECTED" ? "Moved back to draft." : "Submitted for approval.")}>
                {st === "REJECTED" ? "Back to draft" : "Submit"}
              </button>
            ) : null}
            {st === "SUBMITTED" && canApprove ? (
              <>
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void run(() => api.setRequisitionStatus(pr.id, "APPROVED"), "Approved. Now add supplier quotations.")}>
                  Approve
                </button>
                <button type="button" className={BTN} disabled={busy} onClick={() => setReasonAsk({ kind: "status", status: "REJECTED" })}>
                  Reject
                </button>
              </>
            ) : null}
            {st === "CS_SELECTED" ? (
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void createPo()}>
                Create PO
              </button>
            ) : null}
            {pr.purchase_order_id ? (
              <Link className={BTN} to="/app/inventory/purchase-orders">
                Open purchase orders
              </Link>
            ) : null}
            {!["PO_CREATED", "CANCELLED"].includes(st) ? (
              <button type="button" className={BTN} disabled={busy} onClick={() => setReasonAsk({ kind: "status", status: "CANCELLED" })}>
                Cancel requisition
              </button>
            ) : null}
            <button type="button" className={BTN} onClick={() => navigate("/app/procurement/requisitions")}>
              Back
            </button>
          </div>
        }
      />

      {notice ? <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{notice}</div> : null}
      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <section className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Requested items</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-text-muted">
            <tr>
              <th className="py-1 pr-3">Item</th>
              <th className="py-1 pr-3 text-right">Quantity</th>
              <th className="py-1 pr-3 text-right">Est. price</th>
            </tr>
          </thead>
          <tbody>
            {pr.lines.map((ln) => (
              <tr key={ln.id} className="border-t border-border">
                <td className="py-1.5 pr-3">{itemLabel.get(ln.item_id) ?? `Item #${ln.item_id}`}</td>
                <td className="py-1.5 pr-3 text-right">{fmt(ln.quantity)}</td>
                <td className="py-1.5 pr-3 text-right">{ln.estimated_unit_price != null ? fmt(ln.estimated_unit_price) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {st === "APPROVED" ? (
        <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">Add a supplier quotation</h2>
          <div className="grid gap-2 md:grid-cols-5">
            <div className="flex gap-1 md:col-span-2">
              <RemoteSearchSelect
                value={qVendor}
                onChange={(next) => setQVendor(next)}
                fetchPage={fetchVendorPage}
                hydrateById={hydrateVendor}
                placeholder="Supplier…"
                aria-label="Supplier"
                className="flex-1"
              />
              <button type="button" className={BTN} onClick={() => setVendorCreateOpen(true)} title="New supplier">
                + New
              </button>
            </div>
            <input className={CTL} placeholder="Quote ref" value={qRef} onChange={(e) => setQRef(e.target.value)} />
            <input className={CTL} placeholder="Currency" value={qCurrency} maxLength={3} onChange={(e) => setQCurrency(e.target.value.toUpperCase())} />
            <input className={CTL} type="number" min="0" placeholder="Delivery days" value={qDays} onChange={(e) => setQDays(e.target.value)} />
          </div>
          <input className={CTL} placeholder="Payment terms (e.g. 90 days LC)" value={qTerms} onChange={(e) => setQTerms(e.target.value)} />
          <div className="grid gap-2 md:grid-cols-2">
            {pr.lines.map((ln) => (
              <label key={ln.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {itemLabel.get(ln.item_id) ?? `Item #${ln.item_id}`} × {fmt(ln.quantity)}
                </span>
                <input
                  className="w-32 rounded-lg border border-border-strong px-2 py-1.5 text-sm"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="Unit price"
                  value={qPrices[ln.id] ?? ""}
                  onChange={(e) => setQPrices((p) => ({ ...p, [ln.id]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void addQuotation()}>
              Add quotation
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Comparative Statement</h2>
          <p className="text-xs text-text-muted">Green = lowest price per line. Rank compares only suppliers that priced every line.</p>
        </div>
        {cs?.mixed_currency ? (
          <p className="mb-2 rounded border border-status-warning/30 bg-status-warning-subtle px-2 py-1 text-xs text-status-warning-foreground">
            Quotations are in different currencies — totals are not converted; compare carefully.
          </p>
        ) : null}
        {quoteCols.length === 0 ? (
          <p className="text-sm text-text-muted">{st === "APPROVED" ? "Add at least two quotations to compare." : "No quotations yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th className="py-1 pr-3">Item</th>
                  <th className="py-1 pr-3 text-right">Qty</th>
                  {quoteCols.map((q) => (
                    <th key={q.quotation_id} className={`py-1 pr-3 text-right ${cs?.selected_quotation_id === q.quotation_id ? "text-brand-primary" : ""}`}>
                      <div className="font-semibold text-text-primary">{q.vendor_name}</div>
                      <div>
                        {q.currency ?? ""} {q.delivery_days != null ? `· ${q.delivery_days} days` : ""} {q.payment_terms ? `· ${q.payment_terms}` : ""}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cs?.rows.map((row) => (
                  <tr key={row.line_id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{row.item_code ? `${row.item_code} - ` : ""}{row.item_name}</td>
                    <td className="py-1.5 pr-3 text-right">{fmt(row.quantity)}</td>
                    {quoteCols.map((q) => {
                      const cell = row.prices.find((p) => p.quotation_id === q.quotation_id);
                      return (
                        <td key={q.quotation_id} className={`py-1.5 pr-3 text-right ${cell?.is_lowest ? "bg-status-success-subtle font-semibold text-status-success-foreground" : ""}`}>
                          {cell ? (
                            <>
                              {fmt(cell.unit_price)}
                              <div className="text-xs font-normal text-text-muted">{fmt(cell.amount)}</div>
                            </>
                          ) : (
                            <span className="text-text-muted">not quoted</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-3" colSpan={2}>Total</td>
                  {quoteCols.map((q) => (
                    <td key={q.quotation_id} className="py-2 pr-3 text-right">
                      {fmt(q.total)}
                      <div className="text-xs font-normal text-text-muted">
                        {q.is_complete ? `Rank ${q.rank}${q.quotation_id === cs?.lowest_quotation_id ? " · lowest" : ""}` : `${q.lines_quoted}/${cs?.rows.length ?? 0} lines`}
                      </div>
                    </td>
                  ))}
                </tr>
                {(st === "APPROVED" || st === "CS_SELECTED") && canApprove ? (
                  <tr>
                    <td colSpan={2} />
                    {quoteCols.map((q) => (
                      <td key={q.quotation_id} className="space-y-1 py-2 pr-3 text-right">
                        <button
                          type="button"
                          className={cs?.selected_quotation_id === q.quotation_id ? BTN_PRIMARY : BTN}
                          disabled={busy || !q.is_complete}
                          title={q.is_complete ? "Select this supplier" : "This quotation does not price every line"}
                          onClick={() => setReasonAsk({ kind: "select", quotationId: q.quotation_id, vendorName: q.vendor_name, isLowest: q.quotation_id === cs?.lowest_quotation_id })}
                        >
                          {cs?.selected_quotation_id === q.quotation_id ? "Selected" : "Select"}
                        </button>
                        {st === "APPROVED" ? (
                          <button
                            type="button"
                            className="block w-full text-right text-xs text-status-danger-foreground hover:underline"
                            onClick={() => void run(() => api.deleteSupplierQuotation(q.quotation_id), "Quotation removed.")}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {cs?.selection_reason ? (
          <p className="mt-3 rounded border border-border bg-surface-subtle px-3 py-2 text-sm">
            <span className="font-medium">Selection reason:</span> {cs.selection_reason}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">History</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {pr.history.map((ev) => (
            <li key={ev.id} className="rounded border border-border px-2 py-1.5">
              <span className="font-medium">{ev.summary ?? ev.event}</span>
              <span className="text-xs text-text-muted"> · {ev.username ?? "system"} · {ev.at ? new Date(`${ev.at}Z`).toLocaleString() : ""}</span>
              {ev.reason ? <p className="text-xs text-text-secondary">Reason: {ev.reason}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <VoucherActionReasonModal
        open={reasonAsk != null}
        title={
          reasonAsk?.kind === "select"
            ? `Select ${reasonAsk.vendorName}`
            : reasonAsk?.status === "REJECTED"
              ? "Reject requisition"
              : "Cancel requisition"
        }
        description={
          reasonAsk?.kind === "select"
            ? reasonAsk.isLowest
              ? "This is the lowest complete quotation. Record why you chose it (kept for audit)."
              : "This is NOT the lowest quotation. Explain why (e.g. faster delivery, quality, payment terms)."
            : "The reason is kept in the requisition history."
        }
        confirmLabel={reasonAsk?.kind === "select" ? "Select supplier" : "Confirm"}
        onClose={() => setReasonAsk(null)}
        onConfirm={(reason) => {
          const ask = reasonAsk;
          setReasonAsk(null);
          if (!ask) return;
          if (ask.kind === "select") void run(() => api.selectQuotation(pr.id, ask.quotationId, reason), `${ask.vendorName} selected. You can now create the PO.`);
          else void run(() => api.setRequisitionStatus(pr.id, ask.status, reason), ask.status === "REJECTED" ? "Requisition rejected." : "Requisition cancelled.");
        }}
      />
      <VendorQuickCreateModal
        open={vendorCreateOpen}
        defaultCurrency={qCurrency}
        onClose={() => setVendorCreateOpen(false)}
        onCreated={(v) => {
          setQVendor(v.id);
        }}
      />
    </div>
  );
}
