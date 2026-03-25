import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type GoodsReceivingResponse,
  type InventoryItemResponse,
  type SettingsConfigResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { SecureImage } from "@/components/SecureImage";
import { logApiError } from "@/utils/logApiError";
import "@/styles/quotation-print.css";

export function GoodsReceivingPrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const generatedAt = useMemo(() => new Date(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [grn, setGrn] = useState<GoodsReceivingResponse | null>(null);
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);

  useEffect(() => {
    const grnId = Number(id);
    if (!Number.isFinite(grnId) || grnId <= 0) {
      setError("Invalid GRN id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [g, inv, cfg] = await Promise.all([
          api.getGoodsReceiving(grnId),
          api.listInventoryItems(),
          api.getSettingsConfig().catch((e) => {
            logApiError("GoodsReceivingPrintPage.getSettingsConfig", e);
            return null;
          }),
        ]);
        setGrn(g);
        setItems(inv);
        setSettings(cfg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load GRN print view.");
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

  if (error || !grn) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "GRN not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/inventory/goods-receiving")}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
        >
          Back to goods receiving
        </button>
      </div>
    );
  }

  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const st = (grn.status || "").toUpperCase();
  const watermarkText = st === "RECEIVED" ? "Received" : "Draft";
  const watermarkClass = st === "RECEIVED" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Goods receiving note</div>
        <div className="qp-toolbar-actions">
          <Link
            to="/app/inventory/goods-receiving"
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
                <SecureImage url={settings.logo} alt={`${tenantName} logo`} className="qp-logo" />
              ) : (
                <div className="qp-logo-fallback">{tenantName.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div>
              <h1 className="qp-tenant-name">{tenantName}</h1>
              <p className="qp-tenant-meta">Goods receiving</p>
            </div>
          </div>
          <div className="qp-header-right">
            <div className="qp-doc-title">{grn.grn_code}</div>
            <div className="qp-status">{grn.status}</div>
          </div>
        </header>

        <section className="qp-section">
          <h2 className="qp-section-title">Header</h2>
          <div className="qp-grid-2">
            <div>
              <div className="qp-label">PO</div>
              <div className="qp-value">{grn.purchase_order_id ? `#${grn.purchase_order_id}` : "—"}</div>
            </div>
            <div>
              <div className="qp-label">Received date</div>
              <div className="qp-value">
                {grn.received_date ? new Date(grn.received_date).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>
          {grn.notes ? (
            <div className="mt-3">
              <div className="qp-label">Notes</div>
              <p className="text-sm text-text-secondary">{grn.notes}</p>
            </div>
          ) : null}
        </section>

        <section className="qp-section">
          <h2 className="qp-section-title">Lines</h2>
          <table className="qp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Warehouse</th>
                <th className="text-right">Qty</th>
                <th>Lot</th>
              </tr>
            </thead>
            <tbody>
              {grn.items.map((ln) => (
                <tr key={ln.id}>
                  <td>{itemName.get(ln.item_id) || `#${ln.item_id}`}</td>
                  <td className="text-right">#{ln.warehouse_id}</td>
                  <td className="text-right">{ln.quantity}</td>
                  <td>{ln.lot_number || "—"}</td>
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
