import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { PortalPageSkeleton } from "@/components/external-access/PortalSkeletons";
import {
  fmtMoney,
  supplierApi,
  SUPPLIER_STATUS_LABEL,
  type SupplierDashboard,
  type SupplierPo,
  type SupplierPoDetail,
  type SupplierUpdateKind,
} from "./supplierApi";

const card = "rounded-xl border border-border bg-surface-raised p-4";
const today = () => new Date().toISOString().slice(0, 10);

function ResponseBadge({ po }: { po: SupplierPo }) {
  if (po.supplier_status === "CONFIRMED")
    return <span className="rounded-full bg-status-success-subtle px-2 py-0.5 text-xs font-semibold text-status-success-foreground">Confirmed</span>;
  if (po.supplier_status === "DECLINED")
    return <span className="rounded-full bg-status-danger-subtle px-2 py-0.5 text-xs font-semibold text-status-danger-foreground">Declined</span>;
  if (po.status === "APPROVED" || po.status === "PARTIALLY_RECEIVED")
    return <span className="rounded-full bg-status-warning-subtle px-2 py-0.5 text-xs font-semibold text-status-warning-foreground">Awaiting your reply</span>;
  return <span className="text-xs text-text-muted">—</span>;
}

function PoTable({ rows }: { rows: SupplierPo[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-text-muted">No purchase orders.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs uppercase text-text-muted">
          <tr>
            {["PO", "For", "Status", "Needed by", "Your ship date", "Amount", "Your reply"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((po) => (
            <tr key={po.id} className="border-t border-border-subtle">
              <td className="px-3 py-2">
                <Link to={`/portal/supplier/purchase-orders/${po.id}`} className="font-semibold text-brand-primary hover:underline">{po.po_code}</Link>
              </td>
              <td className="px-3 py-2 text-text-secondary">{po.vendor_name ?? "—"}</td>
              <td className="px-3 py-2 text-text-secondary">{po.status.replace(/_/g, " ").toLowerCase()}</td>
              <td className="px-3 py-2">{po.expected_date ?? "—"}</td>
              <td className="px-3 py-2">{po.promised_ship_date ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{fmtMoney(po.total_amount, po.currency)}</td>
              <td className="px-3 py-2"><ResponseBadge po={po} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SupplierDashboardPage() {
  const [data, setData] = useState<SupplierDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    supplierApi.dashboard().then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, []);
  useEffect(load, [load]);

  if (error) return <PortalErrorState message={error} onRetry={load} />;
  if (!data) return <PortalPageSkeleton />;
  const stats = [
    { label: "Open purchase orders", value: data.open_po_count },
    { label: "Awaiting your reply", value: data.awaiting_confirmation_count, warn: data.awaiting_confirmation_count > 0 },
    { label: "Needed in next 14 days", value: data.due_next_14_days },
    { label: "Past needed-by date", value: data.overdue_count, warn: data.overdue_count > 0 },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Welcome</h1>
        <p className="text-sm text-text-muted">Purchase orders for {data.vendor_names.join(", ") || "your company"}.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={card}>
            <p className="text-xs text-text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.warn ? "text-status-warning-foreground" : "text-text-primary"}`}>{s.value}</p>
          </div>
        ))}
      </div>
      <section className={card}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Latest purchase orders</h2>
          <Link to="/portal/supplier/purchase-orders" className="text-xs font-medium text-brand-primary hover:underline">See all</Link>
        </div>
        <PoTable rows={data.recent} />
      </section>
    </div>
  );
}

export function SupplierPurchaseOrdersPage() {
  const [scope, setScope] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<SupplierPo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    setRows(null);
    supplierApi.purchaseOrders(scope).then((r) => setRows(r.items)).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [scope]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-text-primary">Purchase orders</h1>
        <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["open", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1 font-medium ${scope === s ? "bg-brand-primary text-brand-primary-foreground" : "text-text-secondary"}`}
            >
              {s === "open" ? "Open" : "All"}
            </button>
          ))}
        </div>
      </div>
      {error ? <PortalErrorState message={error} onRetry={load} /> : rows ? <div className={card}><PoTable rows={rows} /></div> : <PortalPageSkeleton />}
    </div>
  );
}

export function SupplierPurchaseOrderDetailPage() {
  const { poId } = useParams<{ poId: string }>();
  const id = Number(poId);
  const [po, setPo] = useState<SupplierPoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SupplierUpdateKind>("CONFIRMED");
  const [shipDate, setShipDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [sent, setSent] = useState("");

  const load = useCallback(() => {
    setError(null);
    supplierApi.purchaseOrder(id).then(setPo).catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }, [id]);
  useEffect(load, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSent("");
    if (kind === "DECLINED" && !message.trim()) return setFormError("Please tell the buyer why you cannot accept this order.");
    if (kind === "SHIP_DATE" && !shipDate) return setFormError("Choose the date you expect to ship.");
    if (kind === "NOTE" && !message.trim()) return setFormError("Write a message.");
    setBusy(true);
    try {
      await supplierApi.postUpdate(id, { kind, expected_ship_date: shipDate || null, message: message.trim() || null });
      setSent("Sent to the buyer.");
      setMessage("");
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <PortalErrorState message={error} onRetry={load} />;
  if (!po) return <PortalPageSkeleton />;

  return (
    <div className="space-y-5">
      <p className="text-xs text-text-muted">
        <Link to="/portal/supplier/purchase-orders" className="hover:underline">Purchase orders</Link> › {po.po_code}
      </p>
      <div className={`${card} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{po.po_code}</h1>
          <p className="text-sm text-text-muted">
            {po.vendor_name ?? ""} · {po.status.replace(/_/g, " ").toLowerCase()} · ordered {po.order_date ?? "—"} · needed by {po.expected_date ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">Order value</p>
          <p className="text-lg font-bold text-text-primary">{fmtMoney(po.total_amount, po.currency)}</p>
          <ResponseBadge po={po} />
        </div>
      </div>

      <section className={card}>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Items</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-text-muted">
              <tr>{["Item", "Ordered", "Unit price", "Line total", "Received", "Still to deliver"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {po.lines.map((l, i) => (
                <tr key={i} className="border-t border-border-subtle tabular-nums">
                  <td className="px-3 py-2">{l.item_name ?? "—"}<div className="text-xs text-text-muted">{l.item_code}</div></td>
                  <td className="px-3 py-2">{Number(l.ordered_qty).toLocaleString()}</td>
                  <td className="px-3 py-2">{fmtMoney(l.unit_price)}</td>
                  <td className="px-3 py-2">{fmtMoney(l.line_total)}</td>
                  <td className="px-3 py-2">{Number(l.accepted_received_qty).toLocaleString()}</td>
                  <td className="px-3 py-2 font-semibold">{Number(l.pending_qty).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card} aria-labelledby="reply-title">
          <h2 id="reply-title" className="text-sm font-semibold text-text-primary">Reply to the buyer</h2>
          {po.can_respond ? (
            <form onSubmit={submit} className="mt-3 space-y-3">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Type of reply</legend>
                {(
                  [
                    ["CONFIRMED", "Confirm order"],
                    ["SHIP_DATE", "Update ship date"],
                    ["NOTE", "Send a note"],
                    ["DECLINED", "Cannot accept"],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium ${kind === k ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-border text-text-secondary"}`}>
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                    {label}
                  </label>
                ))}
              </fieldset>
              {kind !== "NOTE" && kind !== "DECLINED" ? (
                <div>
                  <label htmlFor="sp-ship" className="text-xs font-medium text-text-muted">Expected ship date {kind === "SHIP_DATE" ? "*" : "(optional)"}</label>
                  <input id="sp-ship" type="date" min={today()} value={shipDate} onChange={(e) => setShipDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm" />
                </div>
              ) : null}
              <div>
                <label htmlFor="sp-msg" className="text-xs font-medium text-text-muted">Message {kind === "NOTE" || kind === "DECLINED" ? "*" : "(optional)"}</label>
                <textarea id="sp-msg" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 w-full resize-none rounded-lg border border-border px-3 py-2 text-sm" />
              </div>
              {formError ? <p className="text-sm text-status-danger-foreground" role="alert">{formError}</p> : null}
              {sent ? <p className="text-sm text-status-success-foreground" role="status">{sent}</p> : null}
              <button type="submit" disabled={busy} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50">
                {busy ? "Sending…" : "Send"}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-text-muted">This purchase order is {po.status.toLowerCase()}; replies are closed.</p>
          )}
        </section>

        <section className={card}>
          <h2 className="text-sm font-semibold text-text-primary">History</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {po.updates.length === 0 ? <li className="text-text-muted">No replies yet.</li> : null}
            {po.updates.map((u) => (
              <li key={u.id} className="border-l-2 border-border pl-3">
                <p className="font-medium text-text-primary">
                  {SUPPLIER_STATUS_LABEL[u.kind] ?? u.kind}
                  {u.expected_ship_date ? ` · ship ${u.expected_ship_date}` : ""}
                </p>
                {u.message ? <p className="text-text-secondary">{u.message}</p> : null}
                <p className="text-xs text-text-muted">{new Date(u.created_at.endsWith("Z") ? u.created_at : `${u.created_at}Z`).toLocaleString()}</p>
              </li>
            ))}
          </ul>
          {po.receipts.length ? (
            <>
              <h3 className="mt-4 text-xs font-semibold uppercase text-text-muted">Goods received by the buyer</h3>
              <ul className="mt-1 text-sm text-text-secondary">
                {po.receipts.map((r) => <li key={r.grn_code}>{r.grn_code} · {r.received_date ?? "—"} · {r.status.toLowerCase()}</li>)}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
