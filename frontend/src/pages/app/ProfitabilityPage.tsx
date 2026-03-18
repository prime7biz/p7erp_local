import { useEffect, useMemo, useState } from "react";
import { api, type OrderResponse, type ProfitabilityResponse, type StyleResponse } from "@/api/client";

type Mode = "style" | "lc" | "variance";

export function ProfitabilityPage({ defaultMode = "style" }: { defaultMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [entityId, setEntityId] = useState("");
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProfitabilityResponse | null>(null);

  async function loadQuickOptions() {
    setOptionsLoading(true);
    try {
      if (mode === "style") {
        setStyles(await api.listStyles());
      } else {
        setOrders(await api.listOrders({ limit: 100 }));
      }
    } catch {
      // keep page usable even if options fail
    } finally {
      setOptionsLoading(false);
    }
  }

  useEffect(() => {
    void loadQuickOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function run() {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const id = Number(entityId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Enter a valid ID");
      if (mode === "style") setData(await api.getStyleProfitability(id));
      if (mode === "lc") setData(await api.getLcProfitability(id));
      if (mode === "variance") setData(await api.getCostingVariance(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "style" ? "Style Profitability" : mode === "lc" ? "LC Profitability" : "Costing Variance";
  const placeholder = mode === "style" ? "Style ID" : "Order ID";
  const quickOptions = useMemo(() => {
    if (mode === "style") {
      return styles.map((s) => ({
        id: s.id,
        label: `${s.style_code} - ${s.name}`,
      }));
    }
    return orders.map((o) => ({
      id: o.id,
      label: `${o.order_code}${o.style_ref ? ` - ${o.style_ref}` : ""}`,
    }));
  }, [mode, styles, orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Profitability & Variance</h1>
        <p className="mt-1 text-sm text-text-muted">Legacy finance analytics: style margin, order profitability, and costing variance.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <button className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "style" ? "bg-surface-inverse text-text-inverse" : ""}`} onClick={() => setMode("style")}>
            Style Profitability
          </button>
          <button className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "lc" ? "bg-surface-inverse text-text-inverse" : ""}`} onClick={() => setMode("lc")}>
            LC Profitability
          </button>
          <button className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "variance" ? "bg-surface-inverse text-text-inverse" : ""}`} onClick={() => setMode("variance")}>
            Costing Variance
          </button>
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          <select
            className="min-w-80 rounded border border-border-strong px-3 py-2 text-sm"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          >
            <option value="">{optionsLoading ? "Loading options..." : `Quick select ${placeholder}`}</option>
            {quickOptions.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="rounded border border-border-strong px-3 py-2 text-sm" onClick={() => void loadQuickOptions()}>
            Refresh Options
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className="w-60 rounded border border-border-strong px-3 py-2 text-sm"
            placeholder={placeholder}
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
          />
          <button className="rounded bg-brand-primary px-3 py-2 text-sm text-brand-primary-foreground" onClick={() => void run()}>
            {loading ? "Loading..." : `Run ${title}`}
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      {data ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-3 text-lg font-semibold">{title} Result</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(data).map(([k, v]) => (
              <div key={k} className="rounded border border-border p-3">
                <div className="text-xs uppercase text-text-muted">{k.replaceAll("_", " ")}</div>
                <div className="mt-1 text-lg font-semibold">{typeof v === "number" ? v.toLocaleString() : String(v)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
