import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { logApiError } from "@/utils/logApiError";
import {
  api,
  type StyleResponse,
  type StyleSummaryResponse,
  type StyleTimelineEvent,
  type StyleComponentResponse,
  type StyleColorwayResponse,
  type StyleSizeScaleResponse,
  type StyleUpdate,
  type BomResponse,
} from "@/api/client";

export function StyleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const styleId = Number(id);
  const [style, setStyle] = useState<StyleResponse | null>(null);
  const [components, setComponents] = useState<StyleComponentResponse[]>([]);
  const [colorways, setColorways] = useState<StyleColorwayResponse[]>([]);
  const [scales, setScales] = useState<StyleSizeScaleResponse[]>([]);
  const [summary, setSummary] = useState<StyleSummaryResponse | null>(null);
  const [timeline, setTimeline] = useState<StyleTimelineEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState<"master" | "production" | "followup" | "shipment" | "bom">("master");
  const [savingMaster, setSavingMaster] = useState(false);
  const [masterForm, setMasterForm] = useState<StyleUpdate>({});
  const [boms, setBoms] = useState<BomResponse[]>([]);

  const [componentName, setComponentName] = useState("");
  const [colorName, setColorName] = useState("");
  const [scaleName, setScaleName] = useState("");
  const [sizesCsv, setSizesCsv] = useState("");

  const load = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    setError("");
    try {
      const [s, comps, cols, sz, summaryRes, timelineRes, bomRows] = await Promise.all([
        api.getStyle(styleId),
        api.listStyleComponents(styleId),
        api.listStyleColorways(styleId),
        api.listStyleSizeScales(styleId),
        api.getStyleSummary(styleId),
        api.listStyleTimeline(styleId, { limit: 50 }),
        api.listBoms({ style_id: styleId }),
      ]);
      setStyle(s);
      setMasterForm({
        name: s.name,
        buyer_customer_id: s.buyer_customer_id,
        season: s.season,
        department: s.department,
        product_type: s.product_type,
        fabric_type: s.fabric_type,
        gsm: s.gsm,
        fit_type: s.fit_type,
        wash_type: s.wash_type,
        brand: s.brand,
        buyer_style_ref: s.buyer_style_ref,
        hs_code: s.hs_code,
        uom: s.uom,
        target_fob: s.target_fob,
        currency: s.currency,
        sample_lead_days: s.sample_lead_days,
        production_lead_days: s.production_lead_days,
        lifecycle_stage: s.lifecycle_stage,
        priority: s.priority,
        risk_level: s.risk_level,
        is_active_for_new_orders: s.is_active_for_new_orders,
        status: s.status,
        notes: s.notes,
      });
      setComponents(comps);
      setColorways(cols);
      setScales(sz);
      setSummary(summaryRes);
      setTimeline(timelineRes);
      setBoms(bomRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load style details");
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStyleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !styleId) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setError("Unsupported image type. Please upload PNG, JPG, GIF, or WEBP.");
      event.target.value = "";
      return;
    }
    setUploadingImage(true);
    setError("");
    try {
      await api.uploadStyleImage(styleId, file);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload style image");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const submitMasterData = async () => {
    if (!styleId) return;
    setSavingMaster(true);
    setError("");
    try {
      await api.updateStyle(styleId, masterForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update style");
    } finally {
      setSavingMaster(false);
    }
  };

  const styleHealth = useMemo(() => {
    if (!summary) return "No data";
    if (summary.overdue_followup_actions > 0 || Number(summary.due_amount) > 0) return "Needs attention";
    if (summary.open_followup_actions > 0) return "In progress";
    return "Healthy";
  }, [summary]);

  if (loading) return <div className="p-6 text-text-muted">Loading style…</div>;
  if (!style) return <div className="p-6 text-status-danger text-sm">{error || "Style not found"}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{style.style_code} · {style.name}</h1>
          <p className="text-sm text-text-muted mt-0.5">{style.lifecycle_stage} · {style.status} · {style.department ?? "No department"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.open(`/app/merchandising/styles/${styleId}/print`, "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Print / Save PDF
          </button>
          <label className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle cursor-pointer">
            {uploadingImage ? "Uploading..." : "Upload style image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              onChange={handleStyleImageUpload}
              disabled={uploadingImage}
              className="hidden"
            />
          </label>
          <button onClick={() => navigate("/app/merchandising/styles")} className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
            Back
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}

      {summary && (
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Inquiry / Quotation / Order</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">{summary.inquiry_count} / {summary.quotation_count} / {summary.order_count}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Open follow-up</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">{summary.open_followup_actions}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Shipped / Pending qty</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">{summary.shipped_order_qty} / {summary.pending_order_qty}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Payment due</div>
            <div className="mt-1 text-lg font-semibold text-status-danger">{summary.due_amount}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Style health</div>
            <div className="mt-1 text-lg font-semibold text-text-primary">{styleHealth}</div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Style Picture</h2>
        {style.style_image_url ? (
          <img
            src={style.style_image_url}
            alt={style.name}
            className="h-36 w-36 rounded object-cover border border-border"
          />
        ) : (
          <div className="h-36 w-36 rounded bg-surface-subtle border border-border text-xs text-text-muted flex items-center justify-center">
            No style image
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => setActiveTab("master")} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === "master" ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary"}`}>Master Data</button>
        <button type="button" onClick={() => setActiveTab("production")} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === "production" ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary"}`}>Production</button>
        <button type="button" onClick={() => setActiveTab("bom")} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === "bom" ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary"}`}>BOM</button>
        <button type="button" onClick={() => setActiveTab("followup")} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === "followup" ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary"}`}>Follow-up</button>
        <button type="button" onClick={() => setActiveTab("shipment")} className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === "shipment" ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary"}`}>Shipment & Payment</button>
      </div>

      {activeTab === "master" && (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Master data editor</h2>
            <p className="mt-1 text-xs text-text-muted">Recommended order: Basic info → Fabric/spec → Commercial/stage. Save after finishing one section.</p>
          </div>
          <div className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Step 1: Basic info</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input value={masterForm.name ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, name: e.target.value }))} placeholder="Style name" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.product_type ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, product_type: e.target.value || null }))} placeholder="Product type" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.buyer_style_ref ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, buyer_style_ref: e.target.value || null }))} placeholder="Buyer style ref" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.season ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, season: e.target.value || null }))} placeholder="Season" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.department ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, department: e.target.value || null }))} placeholder="Department" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.brand ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, brand: e.target.value || null }))} placeholder="Brand" className="rounded border border-border-strong px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Step 2: Fabric and spec</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input value={masterForm.fabric_type ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, fabric_type: e.target.value || null }))} placeholder="Fabric type" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.gsm ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, gsm: e.target.value || null }))} placeholder="GSM" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.fit_type ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, fit_type: e.target.value || null }))} placeholder="Fit type" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.wash_type ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, wash_type: e.target.value || null }))} placeholder="Wash type" className="rounded border border-border-strong px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Step 3: Commercial and tracking</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input value={masterForm.target_fob ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, target_fob: e.target.value || null }))} placeholder="Target FOB" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <input value={masterForm.currency ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, currency: e.target.value || null }))} placeholder="Currency" className="rounded border border-border-strong px-3 py-2 text-sm" />
              <select value={masterForm.lifecycle_stage ?? "INQUIRY"} onChange={(e) => setMasterForm((f) => ({ ...f, lifecycle_stage: e.target.value }))} className="rounded border border-border-strong px-3 py-2 text-sm">
                {["INQUIRY", "DEVELOPMENT", "QUOTED", "ORDERED", "IN_PRODUCTION", "SHIPPED", "PAID", "CLOSED"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={masterForm.priority ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, priority: e.target.value || null }))} className="rounded border border-border-strong px-3 py-2 text-sm">
                <option value="">Priority</option><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option>
              </select>
              <select value={masterForm.risk_level ?? ""} onChange={(e) => setMasterForm((f) => ({ ...f, risk_level: e.target.value || null }))} className="rounded border border-border-strong px-3 py-2 text-sm">
                <option value="">Risk level</option><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-3 flex gap-2">
            <button type="button" onClick={() => void submitMasterData()} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">{savingMaster ? "Saving..." : "Save master data"}</button>
            <button type="button" onClick={() => setMasterForm({ ...masterForm, status: "INACTIVE", is_active_for_new_orders: false })} className="rounded border border-border-strong px-4 py-2 text-sm text-status-danger">Set archive flags</button>
          </div>
        </div>
      )}

      {activeTab === "production" && (
        <div className="overflow-x-auto">
          <div className="grid gap-4 md:grid-cols-3 min-w-[640px]">
            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-primary">Components</h2>
              <div className="flex gap-2">
                <input value={componentName} onChange={(e) => setComponentName(e.target.value)} placeholder="Component name" className="flex-1 rounded border border-border-strong px-2 py-1 text-sm" />
                <button onClick={async () => { if (!componentName.trim()) return; await api.createStyleComponent(styleId, { component_name: componentName.trim() }); setComponentName(""); await load(); }} className="rounded border border-border-strong px-2 py-1 text-xs">Add</button>
              </div>
              <div className="space-y-1">
                {components.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm">
                    <span>{c.component_name}</span>
                    <button onClick={async () => { try { await api.deleteStyleComponent(styleId, c.id); await load(); } catch (err) { logApiError("StyleDetail.deleteComponent", err); setError(err instanceof Error ? err.message : "Failed to delete component"); } }} className="text-xs text-status-danger">Delete</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-primary">Colorways</h2>
              <div className="flex gap-2">
                <input value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="Color name" className="flex-1 rounded border border-border-strong px-2 py-1 text-sm" />
                <button onClick={async () => { if (!colorName.trim()) return; try { await api.createStyleColorway(styleId, { color_name: colorName.trim() }); setColorName(""); await load(); } catch (err) { logApiError("StyleDetail.createColorway", err); setError(err instanceof Error ? err.message : "Failed to add colorway"); } }} className="rounded border border-border-strong px-2 py-1 text-xs">Add</button>
              </div>
              <div className="space-y-1">
                {colorways.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm">
                    <span>{c.color_name}</span>
                    <button onClick={async () => { try { await api.deleteStyleColorway(styleId, c.id); await load(); } catch (err) { logApiError("StyleDetail.deleteColorway", err); setError(err instanceof Error ? err.message : "Failed to delete colorway"); } }} className="text-xs text-status-danger">Delete</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
              <h2 className="text-sm font-semibold text-text-primary">Size Scales</h2>
              <input value={scaleName} onChange={(e) => setScaleName(e.target.value)} placeholder="Scale name" className="w-full rounded border border-border-strong px-2 py-1 text-sm" />
              <input value={sizesCsv} onChange={(e) => setSizesCsv(e.target.value)} placeholder="Sizes CSV (S,M,L,XL)" className="w-full rounded border border-border-strong px-2 py-1 text-sm" />
              <button onClick={async () => { if (!scaleName.trim()) return; try { await api.createStyleSizeScale(styleId, { scale_name: scaleName.trim(), sizes_csv: sizesCsv || null }); setScaleName(""); setSizesCsv(""); await load(); } catch (err) { logApiError("StyleDetail.createSizeScale", err); setError(err instanceof Error ? err.message : "Failed to add size scale"); } }} className="rounded border border-border-strong px-2 py-1 text-xs">Add</button>
              <div className="space-y-1">
                {scales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded border border-border px-2 py-1 text-sm">
                    <span>{s.scale_name} ({s.sizes_csv ?? "—"})</span>
                    <button onClick={async () => { try { await api.deleteStyleSizeScale(styleId, s.id); await load(); } catch (err) { logApiError("StyleDetail.deleteSizeScale", err); setError(err instanceof Error ? err.message : "Failed to delete size scale"); } }} className="text-xs text-status-danger">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "bom" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Bill of materials</h2>
                <p className="mt-1 text-xs text-text-muted">Manage BOM versions for this style and open the command center.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/app/bom?styleId=${styleId}`}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
                >
                  Open BOM command center
                </Link>
                <Link
                  to={`/app/bom?styleId=${styleId}`}
                  className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground"
                >
                  Create / manage BOM
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">Style BOM versions</div>
            {boms.length === 0 ? (
              <div className="px-4 py-6 text-sm text-text-muted">No BOM version found for this style yet.</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {boms.map((bom) => (
                  <div key={bom.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="text-sm text-text-primary">
                      BOM #{bom.id} · V{bom.version_no} · <span className="text-text-muted">{(bom.status || "DRAFT").toUpperCase()}</span>
                    </div>
                    <Link
                      to={`/app/bom?styleId=${styleId}&bomId=${bom.id}`}
                      className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "followup" && (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Follow-up timeline</h2>
          <div className="space-y-2">
            {timeline.filter((t) => t.event_type === "FOLLOWUP" || t.event_type === "ORDER" || t.event_type === "INQUIRY" || t.event_type === "QUOTATION").map((event, idx) => (
              <div key={`${event.reference}-${idx}`} className="rounded border border-border px-3 py-2">
                <div className="text-xs text-text-muted">{event.event_type} · {new Date(event.event_at).toLocaleString()}</div>
                <div className="text-sm font-medium text-text-primary">{event.reference}</div>
                <div className="text-xs text-text-secondary">{event.status ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "shipment" && (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Shipment & Payment</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded border border-border p-3">
              <div className="text-xs text-text-muted">Invoice amount</div>
              <div className="text-lg font-semibold">{summary?.invoice_amount ?? "0.00"}</div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-xs text-text-muted">Received amount</div>
              <div className="text-lg font-semibold">{summary?.received_amount ?? "0.00"}</div>
            </div>
            <div className="rounded border border-border p-3">
              <div className="text-xs text-text-muted">Due amount</div>
              <div className="text-lg font-semibold text-status-danger">{summary?.due_amount ?? "0.00"}</div>
            </div>
          </div>
          <div className="space-y-2">
            {timeline.filter((t) => t.event_type === "SHIPMENT" || t.event_type === "INVOICE" || t.event_type === "PAYMENT_RECEIPT").map((event, idx) => (
              <div key={`${event.reference}-${idx}`} className="rounded border border-border px-3 py-2">
                <div className="text-xs text-text-muted">{event.event_type} · {new Date(event.event_at).toLocaleString()}</div>
                <div className="text-sm font-medium text-text-primary">{event.reference}</div>
                <div className="text-xs text-text-secondary">{event.status ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
