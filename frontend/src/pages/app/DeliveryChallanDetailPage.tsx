import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useMatch } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  api,
  type DeliveryChallanCreate,
  type DeliveryChallanItemCreate,
  type DeliveryChallanResponse,
  type InventoryDocumentPrintPayload,
  type InventoryGlPostingDetail,
  type InventoryItemResponse,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { GlPostingsPanel } from "@/components/inventory/GlPostingsPanel";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { logApiError } from "@/utils/logApiError";

const STATUSES = ["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED"];

function verifyUrlFromPath(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const o = typeof window !== "undefined" ? window.location.origin : "";
  return `${o}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function DeliveryChallanDetailPage() {
  const navigate = useNavigate();
  const { challanId } = useParams<{ challanId: string }>();
  const isNew = Boolean(useMatch({ path: "/app/inventory/delivery-challans/new", end: true }));
  const idNum = challanId && challanId !== "new" ? Number(challanId) : NaN;

  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [challan, setChallan] = useState<DeliveryChallanResponse | null>(null);
  const [postings, setPostings] = useState<InventoryGlPostingDetail[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [copyCount, setCopyCount] = useState(1);
  const [template, setTemplate] = useState<"standard" | "compact" | "audit">("standard");
  const [saving, setSaving] = useState(false);

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
    const [itm, wh] = await Promise.all([api.listInventoryItems(), api.listWarehouses()]);
    setItems(itm);
    setWarehouses(wh);
    setLine((p) => ({
      ...p,
      item_id: p.item_id || itm[0]?.id || 0,
      warehouse_id: p.warehouse_id || wh[0]?.id || 0,
    }));
  }, []);

  const loadDetail = useCallback(async () => {
    if (isNew || !Number.isFinite(idNum) || idNum <= 0) return;
    setLoading(true);
    setError("");
    try {
      const [c, po] = await Promise.all([
        api.getDeliveryChallan(idNum),
        api.getDeliveryChallanGlPostings(idNum).catch((e) => {
          logApiError("DeliveryChallanDetailPage.gl", e);
          return [] as InventoryGlPostingDetail[];
        }),
      ]);
      setChallan(c);
      setPostings(po);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load challan");
    } finally {
      setLoading(false);
    }
  }, [idNum, isNew]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, `${i.item_code} — ${i.name}`])), [items]);

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
              <select
                className="rounded border px-2 py-1 text-sm"
                value={line.item_id || ""}
                onChange={(e) => setLine((p) => ({ ...p, item_id: Number(e.target.value) }))}
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.item_code}
                  </option>
                ))}
              </select>
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
                onClick={() => setForm((p) => ({ ...p, items: [...p.items, { ...line }] }))}
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

  return (
    <div className="min-w-0 space-y-6">
      <AppPageHeader
        title={challan.challan_code}
        description={`${challan.customer_name} · ${challan.status}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void openPrint()}
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground"
            >
              Print
            </button>
            <Link
              to="/app/inventory/delivery-challans"
              className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
            >
              Back
            </Link>
          </div>
        }
      />

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
