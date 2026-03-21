import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type InventoryItemResponse,
  type PurchaseOrderResponse,
  type SettingsConfigResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";
import "@/styles/quotation-print.css";

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function PurchaseOrderPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const generatedAt = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [po, setPo] = useState<PurchaseOrderResponse | null>(null);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);

  useEffect(() => {
    const poId = Number(id);
    if (!Number.isFinite(poId) || poId <= 0) {
      setError("Invalid purchase order id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [p, inv, cfg] = await Promise.all([
          api.getPurchaseOrder(poId),
          api.listInventoryItems(),
          api.getSettingsConfig().catch((e) => {
            logApiError("PurchaseOrderPrintPage.getSettingsConfig", e);
            return null;
          }),
        ]);
        setPo(p);
        setItems(inv);
        setSettings(cfg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load purchase order print view.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  const itemName = useMemo(() => {
    const m = new Map<number, string>();
    for (const it of items) {
      m.set(it.id, `${it.item_code} — ${it.name}`);
    }
    return m;
  }, [items]);

  if (loading) {
    return <div className="min-h-[40vh] p-6 text-sm text-text-muted">Preparing print template...</div>;
  }

  if (error || !po) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "Purchase order not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/inventory/purchase-orders")}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
        >
          Back to purchase orders
        </button>
      </div>
    );
  }

  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const st = (po.status || "").toUpperCase();
  const watermarkText = st === "CANCELLED" ? "Cancelled" : st === "CLOSED" ? "Closed" : "Open";
  const watermarkClass = st === "CANCELLED" ? "qp-watermark-draft" : "qp-watermark-final";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Purchase order</div>
        <div className="qp-toolbar-actions">
          <Link
            to="/app/inventory/purchase-orders"
            className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Back to list
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-primary/90"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <article className="qp-sheet">
        <div className={`qp-watermark ${watermarkClass}`}>{watermarkText}</div>
        <header className="qp-header">
          <div className="qp-header-left">
            <div className="qp-logo-wrap">
              {settings?.logo ? (
                <img src={resolveAssetUrl(settings.logo)} alt={`${tenantName} logo`} className="qp-logo" />
              ) : (
                <div className="qp-logo-fallback">{tenantName.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div>
              <h1 className="qp-tenant-name">{tenantName}</h1>
              <p className="qp-tenant-meta">Purchase order</p>
            </div>
          </div>
          <div className="qp-header-right">
            <div className="qp-doc-title">{po.po_code}</div>
            <div className="qp-status">{po.status}</div>
          </div>
        </header>

        <section className="qp-section">
          <h2 className="qp-section-title">Header</h2>
          <div className="qp-grid-2">
            <div>
              <div className="qp-label">Supplier</div>
              <div className="qp-value">{po.supplier_name}</div>
            </div>
            <div>
              <div className="qp-label">Order date</div>
              <div className="qp-value">{po.order_date ? new Date(po.order_date).toLocaleDateString() : "—"}</div>
            </div>
            <div>
              <div className="qp-label">Expected</div>
              <div className="qp-value">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : "—"}</div>
            </div>
            <div>
              <div className="qp-label">Currency</div>
              <div className="qp-value">{po.currency || "—"}</div>
            </div>
          </div>
          {po.notes ? (
            <div className="mt-3">
              <div className="qp-label">Notes</div>
              <p className="text-sm text-text-secondary">{po.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="qp-section">
          <h2 className="qp-section-title">Lines</h2>
          <table className="qp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((ln) => (
                <tr key={ln.id}>
                  <td>{itemName.get(ln.item_id) || `#${ln.item_id}`}</td>
                  <td className="text-right">{ln.quantity}</td>
                  <td className="text-right">{ln.unit_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="qp-footer">
          <p className="text-xs text-text-muted">
            Generated {generatedAt.toLocaleString()} — For internal use.
          </p>
        </footer>
      </article>
    </div>
  );
}
