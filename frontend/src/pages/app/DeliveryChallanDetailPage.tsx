import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useMatch, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  ApiError,
  api,
  type DeliveryChallanCreate,
  type DeliveryChallanItemCreate,
  type DeliveryChallanResponse,
  type InventoryDocumentPrintPayload,
  type InventoryGlPostingDetail,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LinkedRecordsSection } from "@/components/app/LinkedRecordsSection";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { fetchInventoryItemPage, hydrateInventoryItem } from "@/lib/remoteSelectFetchers";
import { logApiError } from "@/utils/logApiError";
import { getWarehousesCached } from "@/lib/masterData";

const STATUSES = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED"];

function verifyUrlFromPath(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const o = typeof window !== "undefined" ? window.location.origin : "";
  return `${o}${path.startsWith("/") ? "" : "/"}${path}`;
}

function newIdempotencyKey(challanId: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `dc-${challanId}-${crypto.randomUUID()}`;
  }
  return `dc-${challanId}-${Date.now()}`;
}

export function DeliveryChallanDetailPage() {
  const navigate = useNavigate();
  const { challanId } = useParams<{ challanId: string }>();
  const isNew = Boolean(useMatch({ path: "/app/inventory/delivery-challans/new", end: true }));
  const idNum = challanId && challanId !== "new" ? Number(challanId) : NaN;

  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [itemLabels, setItemLabels] = useState<Record<number, string>>({});
  const [challan, setChallan] = useState<DeliveryChallanResponse | null>(null);
  const [postings, setPostings] = useState<InventoryGlPostingDetail[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [copyCount, setCopyCount] = useState(1);
  const [template, setTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const [saving, setSaving] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState<string | null>(null);
  const [priceReviewWarning, setPriceReviewWarning] = useState("");
  const [linkedPackingLists, setLinkedPackingLists] = useState<
    Array<{ id: number; packing_list_number: string; status: string; total_cartons: number }>
  >([]);

  const [form, setForm] = useState<DeliveryChallanCreate>({
    customer_name: "",
    delivery_date: null,
    notes: undefined,
    status: "DRAFT",
    items: [],
    order_ids: [],
  });
  const [line, setLine] = useState<DeliveryChallanItemCreate>({ item_id: 0, warehouse_id: 0, quantity: "1" });
  const [orderIdInput, setOrderIdInput] = useState("");

  const loadRefs = useCallback(async () => {
    const wh = await getWarehousesCached();
    setWarehouses(wh);
    setLine((p) => ({
      ...p,
      warehouse_id: p.warehouse_id || wh[0]?.id || 0,
    }));
  }, []);

  const loadDetail = useCallback(async () => {
    if (isNew || !Number.isFinite(idNum) || idNum <= 0) return;
    setLoading(true);
    setError("");
    try {
      const [c, po, packs] = await Promise.all([
        api.getDeliveryChallan(idNum),
        api.getDeliveryChallanGlPostings(idNum).catch((e) => {
          logApiError("DeliveryChallanDetailPage.gl", e);
          return [] as InventoryGlPostingDetail[];
        }),
        api.listPackingLists({ delivery_challan_id: idNum, limit: 20 }).catch((e) => {
          logApiError("DeliveryChallanDetailPage.packing", e);
          return [];
        }),
      ]);
      setChallan(c);
      setPostings(po);
      setLinkedPackingLists(packs);
      // Hydrate labels for existing lines without full catalog pull.
      const ids = Array.from(new Set((c.items ?? []).map((ln) => ln.item_id).filter(Boolean)));
      if (ids.length) {
        const pairs = await Promise.all(
          ids.map(async (id) => {
            const opt = await hydrateInventoryItem(id);
            return [id, opt?.label ?? `#${id}`] as const;
          }),
        );
        setItemLabels((prev) => {
          const next = { ...prev };
          for (const [id, label] of pairs) next[id] = label;
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load challan");
    } finally {
      setLoading(false);
    }
  }, [idNum, isNew]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  const [searchParams] = useSearchParams();
  const prefillOrderId = isNew ? Number(searchParams.get("order_id") || 0) || null : null;
  useEffect(() => {
    if (!prefillOrderId) return;
    let cancelled = false;
    void api
      .getOrder(prefillOrderId)
      .then((order) => {
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          customer_name: prev.customer_name || order.customer_name || "",
          order_ids: prev.order_ids?.includes(prefillOrderId) ? prev.order_ids : [...(prev.order_ids ?? []), prefillOrderId],
        }));
      })
      .catch((e) => logApiError("DeliveryChallanDetailPage.prefillOrder", e));
    return () => {
      cancelled = true;
    };
  }, [prefillOrderId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const itemMap = useMemo(() => new Map(Object.entries(itemLabels).map(([k, v]) => [Number(k), v])), [itemLabels]);

  async function openPrint() {
    if (!challan) return;
    try {
      const data = await api.getDeliveryChallanPrintData(challan.id);
      setPrintData(data);
      setPrintOpen(true);
    } catch (e) {
      logApiError("DeliveryChallanDetailPage.print", e);
      setError((e as Error).message);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_name.trim() || form.items.length === 0) {
      setError("Customer and at least one line are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.createDeliveryChallan(form);
      navigate(`/app/inventory/delivery-challans/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  if (isNew) {
    return (
      <div className="min-w-0 space-y-6">
        <AppPageHeader
          title="New delivery challan"
          description="Create dispatch document with lines and optional linked orders."
          actions={
            <Link
              to="/app/inventory/delivery-challans"
              className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Back to list
            </Link>
          }
        />
        {error ? (
          <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
            {error}
          </div>
        ) : null}
        <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-semibold text-text-secondary">
              Customer name *
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.customer_name}
                onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                required
              />
            </label>
            <label className="block text-xs font-semibold text-text-secondary">
              Delivery date
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                type="date"
                value={form.delivery_date ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, delivery_date: e.target.value || null }))}
              />
            </label>
            <label className="block text-xs font-semibold text-text-secondary">
              Status
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.status ?? "DRAFT"}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-text-secondary">
              Notes
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={form.notes ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value || undefined }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Link order ID"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
            />
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-subtle"
              onClick={() => {
                const n = Number(orderIdInput);
                if (!Number.isFinite(n) || n <= 0) return;
                setForm((p) => ({ ...p, order_ids: [...new Set([...(p.order_ids ?? []), n])] }));
                setOrderIdInput("");
              }}
            >
              Add order link
            </button>
          </div>
          {(form.order_ids?.length ?? 0) > 0 ? (
            <p className="text-xs text-text-muted">Linked orders: {(form.order_ids ?? []).join(", ")}</p>
          ) : null}

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Lines</p>
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[14rem] flex-1">
                <RemoteSearchSelect
                  className="w-full rounded border px-2 py-1 text-sm"
                  placeholder="Search item…"
                  value={line.item_id || ""}
                  onChange={(next, opt) => {
                    const id = typeof next === "number" && next > 0 ? next : 0;
                    setLine((p) => ({ ...p, item_id: id }));
                    if (id && opt?.label) {
                      setItemLabels((prev) => ({ ...prev, [id]: opt.label }));
                    }
                  }}
                  fetchPage={fetchInventoryItemPage}
                  hydrateById={hydrateInventoryItem}
                  allowClear
                />
              </div>
              <select
                className="rounded border px-2 py-1 text-sm"
                value={line.warehouse_id || ""}
                onChange={(e) => setLine((p) => ({ ...p, warehouse_id: Number(e.target.value) }))}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <input
                className="w-28 rounded border px-2 py-1 text-sm"
                value={line.quantity}
                onChange={(e) => setLine((p) => ({ ...p, quantity: e.target.value }))}
              />
              <button
                type="button"
                className="rounded border px-2 py-1 text-sm"
                onClick={() => {
                  if (!line.item_id) return;
                  setForm((p) => ({ ...p, items: [...p.items, { ...line }] }));
                }}
              >
                Add line
              </button>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-text-secondary">
              {form.items.map((ln, i) => (
                <li key={i}>
                  {itemMap.get(ln.item_id) ?? ln.item_id} · WH {ln.warehouse_id} · {ln.quantity}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Create challan"}
          </button>
        </form>
      </div>
    );
  }

  if (loading || !challan) {
    return (
      <div className="p-6 text-sm text-text-muted">
        {error || "Loading…"}
        {!loading && !challan && !error ? (
          <Link to="/app/inventory/delivery-challans" className="mt-2 block text-brand-primary">
            Back to list
          </Link>
        ) : null}
      </div>
    );
  }

  const vUrl = verifyUrlFromPath(
    challan.verification_id ? `/api/v1/inventory/documents/verify/${encodeURIComponent(challan.verification_id)}` : "",
  );

  const createInvoice = async (opts: { allowSplit?: boolean; key?: string }) => {
    if (!challan) return;
    setCreatingInvoice(true);
    setError("");
    setPriceReviewWarning("");
    const key = opts.key || newIdempotencyKey(challan.id);
    try {
      const result = await api.createCommercialInvoiceFromChallan(challan.id, {
        idempotency_key: key,
        exchange_rate_to_base: 1,
        allow_split: Boolean(opts.allowSplit),
      });
      setSplitModalOpen(false);
      setPendingIdempotencyKey(null);
      const invoices = result.invoices || [];
      const needsReview = invoices.some((inv) => inv.price_review_required);
      if (needsReview) {
        setPriceReviewWarning("Some items need price review before issuing. Open the invoice to fix prices.");
      }
      const first = invoices[0];
      if (first?.id) {
        navigate(`/app/commercial/invoices/${first.id}`);
      } else {
        setError("Invoice created but no id returned");
      }
    } catch (err) {
      logApiError("DeliveryChallanDetailPage.createInvoice", err);
      if (err instanceof ApiError && err.code === "split_required") {
        setPendingIdempotencyKey(key);
        setSplitModalOpen(true);
        setError("");
      } else {
        setError(err instanceof Error ? err.message : "Create invoice failed");
      }
    } finally {
      setCreatingInvoice(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <AppPageHeader
        title={challan.challan_code}
        description={`${challan.customer_name} · ${challan.status}`}
        belowTitle={
          <WorkflowSummaryStrip
            items={[
              { label: "Status", value: challan.status },
              ...(challan.customer_name
                ? [
                    {
                      label: "Customer",
                      value: challan.customer_name,
                      to: `/app/customers?q=${encodeURIComponent(challan.customer_name)}`,
                    },
                  ]
                : []),
              ...((challan.order_ids ?? []).slice(0, 3).map((oid, idx) => ({
                label: (challan.order_ids?.length ?? 0) > 1 ? `Order ${idx + 1}` : "Order",
                value: `#${oid}`,
                to: `/app/orders/${oid}`,
              })) ?? []),
              ...(linkedPackingLists.length
                ? [
                    {
                      label: "Packing",
                      value: linkedPackingLists.length,
                      to: `/app/logistics?tab=packing&delivery_challan_id=${challan.id}`,
                    },
                  ]
                : []),
            ]}
          />
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openPrint()}
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground"
            >
              Print
            </button>
            {(challan.status || "").toUpperCase() === "POSTED" ? (
              <button
                type="button"
                disabled={creatingInvoice || !(challan.order_ids?.length)}
                onClick={() => void createInvoice({})}
                className="rounded-lg border border-brand-primary/40 bg-brand-subtle px-3 py-2 text-sm font-semibold text-brand-primary disabled:opacity-50"
                title={
                  !(challan.order_ids?.length)
                    ? "Link at least one order before creating an invoice"
                    : "Create commercial invoice from this challan"
                }
              >
                {creatingInvoice ? "Creating…" : "Create Invoice"}
              </button>
            ) : null}
            {(challan.status || "").toUpperCase() === "POSTED" && linkedPackingLists.length === 0 ? (
              <button
                type="button"
                onClick={() => {
                  const orderId = challan.order_ids?.[0];
                  navigate(
                    `/app/logistics?tab=packing&delivery_challan_id=${challan.id}${
                      orderId ? `&order_id=${orderId}` : ""
                    }`,
                  );
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-subtle"
              >
                Create Packing List
              </button>
            ) : null}
            <Link
              to="/app/inventory/delivery-challans"
              className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Back
            </Link>
          </div>
        }
      />

      <LinkedRecordsSection
        title="Linked records"
        columns={[
          {
            title: "Orders",
            rows: (challan.order_ids ?? []).map((oid) => ({
              id: oid,
              label: `Order #${oid}`,
              to: `/app/orders/${oid}`,
            })),
          },
          {
            title: "Packing lists",
            rows: linkedPackingLists.map((p) => ({
              id: p.id,
              label: p.packing_list_number,
              sub: p.status,
              to: `/app/logistics/packing-lists/${p.id}`,
            })),
          },
        ]}
      />

      {priceReviewWarning ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
          {priceReviewWarning}
        </div>
      ) : null}

      {linkedPackingLists.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm">
          <p className="font-semibold text-text-primary">Linked packing lists</p>
          <ul className="mt-2 space-y-1">
            {linkedPackingLists.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-text-secondary">
                <Link
                  to={`/app/logistics/packing-lists/${p.id}`}
                  className="font-medium text-accent-secondary hover:underline"
                >
                  {p.packing_list_number}
                </Link>
                <span>· {p.status}</span>
                <span>· {p.total_cartons} cartons</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {splitModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
            <h2 className="text-base font-semibold text-text-primary">Create separate invoices?</h2>
            <p className="mt-2 text-sm text-text-secondary">
              This challan has orders with different customers or currencies. Create a separate draft commercial
              invoice for each customer/currency group?
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={creatingInvoice}
                onClick={() => {
                  setSplitModalOpen(false);
                  setPendingIdempotencyKey(null);
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingInvoice}
                onClick={() =>
                  void createInvoice({
                    allowSplit: true,
                    key: pendingIdempotencyKey || undefined,
                  })
                }
                className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creatingInvoice ? "Creating…" : "Create separate invoices"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {challan.verification_id && vUrl ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-gradient-to-br from-surface-raised to-surface-subtle/40 p-4">
          <QRCodeSVG value={vUrl} size={96} level="M" />
          <div>
            <p className="text-sm font-semibold text-text-primary">Verified document</p>
            <p className="text-xs text-text-muted">Scan to verify · {challan.verification_id}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm">{error}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
          <p className="text-text-muted">Delivery date</p>
          <p className="font-medium">{challan.delivery_date ?? "—"}</p>
          <p className="mt-2 text-text-muted">Notes</p>
          <p>{challan.notes ?? "—"}</p>
          <p className="mt-2 text-text-muted">Linked orders</p>
          <p>{(challan.order_ids ?? []).length ? (challan.order_ids ?? []).join(", ") : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="mb-2 text-sm font-semibold">Workflow</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={(challan.status || "").toUpperCase() === s}
                className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-subtle disabled:opacity-40"
                onClick={async () => {
                  try {
                    const u = await api.updateDeliveryChallanStatus(challan.id, s);
                    setChallan(u);
                    setPostings(await api.getDeliveryChallanGlPostings(challan.id));
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h3 className="mb-2 text-sm font-semibold">Lines</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-text-muted">
              <th className="py-2">Item</th>
              <th>Warehouse</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {challan.items.map((ln) => (
              <tr key={ln.id} className="border-t border-border">
                <td className="py-2">{itemMap.get(ln.item_id) ?? ln.item_id}</td>
                <td>{ln.warehouse_id}</td>
                <td>{ln.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GlPostingsPanel postings={postings} />

      {printOpen && printData ? (
        <PrintPreviewModal
          open={printOpen}
          title={`Print — ${challan.challan_code}`}
          onClose={() => {
            setPrintOpen(false);
            setPrintData(null);
          }}
          copyCount={copyCount}
          onCopyCountChange={setCopyCount}
          template={template}
          onTemplateChange={setTemplate}
        >
          <InventoryDocumentPrintSheets data={printData} copyCount={copyCount} template={template} />
        </PrintPreviewModal>
      ) : null}
    </div>
  );
}
