import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type StyleResponse,
  type StyleComponentResponse,
  type StyleColorwayResponse,
  type StyleSizeScaleResponse,
  type SettingsConfigResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/quotation-print.css";

function resolveAssetUrl(pathOrUrl: string | null | undefined): string {
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

export function StylePrintPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [style, setStyle] = useState<StyleResponse | null>(null);
  const [components, setComponents] = useState<StyleComponentResponse[]>([]);
  const [colorways, setColorways] = useState<StyleColorwayResponse[]>([]);
  const [scales, setScales] = useState<StyleSizeScaleResponse[]>([]);
  const [settings, setSettings] = useState<SettingsConfigResponse | null>(null);

  useEffect(() => {
    const styleId = Number(id);
    if (!Number.isFinite(styleId) || styleId <= 0) {
      setError("Invalid style id.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [s, comps, cols, sz, cfg] = await Promise.all([
          api.getStyle(styleId),
          api.listStyleComponents(styleId),
          api.listStyleColorways(styleId),
          api.listStyleSizeScales(styleId),
          api.getSettingsConfig().catch(() => null),
        ]);
        setStyle(s);
        setComponents(comps);
        setColorways(cols);
        setScales(sz);
        setSettings(cfg);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load style print view.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[40vh] p-6 text-sm text-slate-600">
        Preparing print template...
      </div>
    );
  }

  if (error || !style) {
    return (
      <div className="min-h-[40vh] space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Style not found."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/merchandising/styles")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Back to styles
        </button>
      </div>
    );
  }

  const tenantName = settings?.company_name || me?.tenant_name || "Tenant";
  const watermarkText = (style.status || "").toUpperCase() === "ACTIVE" ? "Active" : "Inactive";
  const watermarkClass = watermarkText === "Active" ? "qp-watermark-final" : "qp-watermark-draft";

  return (
    <div className="qp-root">
      <div className="qp-toolbar no-print">
        <div className="qp-toolbar-left">Printable style summary</div>
        <div className="qp-toolbar-actions">
          <Link
            to={`/app/merchandising/styles/${style.id}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to style
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <article className="qp-sheet">
        <div className={`qp-watermark ${watermarkClass}`}>{watermarkText}</div>
        <header className="qp-header">
          <div className="qp-header-left">
            <div>
              <h1 className="qp-tenant-name">{tenantName}</h1>
              <p className="qp-tenant-meta">Garment Style</p>
            </div>
          </div>
          <div className="qp-header-right">
            <div className="qp-doc-title">STYLE</div>
            <div className="qp-status">{style.status}</div>
          </div>
        </header>

        <section className="qp-meta-grid">
          <div>
            <span>Style code</span>
            <strong>{style.style_code}</strong>
          </div>
          <div>
            <span>Name</span>
            <strong>{style.name}</strong>
          </div>
          <div>
            <span>Department</span>
            <strong>{style.department ?? "—"}</strong>
          </div>
          <div>
            <span>Season</span>
            <strong>{style.season ?? "—"}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{formatDateTime(style.created_at)}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{formatDateTime(style.updated_at)}</strong>
          </div>
        </section>

        <section className="qp-section">
          <h2>Style picture</h2>
          <div style={{ marginTop: 8 }}>
            {style.style_image_url ? (
              <img
                src={resolveAssetUrl(style.style_image_url)}
                alt={style.name}
                style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "#64748b",
                }}
              >
                No image
              </div>
            )}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 16 }}>
          <section className="qp-section">
            <h2>Components</h2>
            {components.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {components.map((c) => (
                  <li key={c.id}>{c.component_name}</li>
                ))}
              </ul>
            ) : (
              <p className="qp-tenant-meta" style={{ margin: 0 }}>—</p>
            )}
          </section>
          <section className="qp-section">
            <h2>Colorways</h2>
            {colorways.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {colorways.map((c) => (
                  <li key={c.id}>{c.color_name}{c.color_code ? ` (${c.color_code})` : ""}</li>
                ))}
              </ul>
            ) : (
              <p className="qp-tenant-meta" style={{ margin: 0 }}>—</p>
            )}
          </section>
          <section className="qp-section">
            <h2>Size scales</h2>
            {scales.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {scales.map((s) => (
                  <li key={s.id}>{s.scale_name}: {s.sizes_csv ?? "—"}</li>
                ))}
              </ul>
            ) : (
              <p className="qp-tenant-meta" style={{ margin: 0 }}>—</p>
            )}
          </section>
        </div>

        {style.notes && (
          <section className="qp-section" style={{ marginTop: 16 }}>
            <h2>Notes</h2>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{style.notes}</p>
          </section>
        )}
      </article>
    </div>
  );
}
