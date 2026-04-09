import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type ProfitabilityResponse,
  type StyleResponse,
  type TradeCaseMarginResponse,
  type TradeCaseRow,
} from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type Mode = "style" | "lc" | "variance" | "trade_case";

export function ProfitabilityPage({ defaultMode = "style" }: { defaultMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [entityId, setEntityId] = useState("");
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [tradeCases, setTradeCases] = useState<TradeCaseRow[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProfitabilityResponse | null>(null);
  const [tradeMargin, setTradeMargin] = useState<TradeCaseMarginResponse | null>(null);

  async function loadQuickOptions() {
    setOptionsLoading(true);
    try {
      if (mode === "style") {
        setStyles(await api.listStyles());
      } else if (mode === "trade_case") {
        setTradeCases(await api.listTradeCases({ limit: 200 }));
      } else {
        setOrders(await api.listOrders({ limit: 100 }));
      }
    } catch (e) {
      logApiError("ProfitabilityPage.loadQuickOptions", e);
    } finally {
      setOptionsLoading(false);
    }
  }

  useEffect(() => {
    setData(null);
    setTradeMargin(null);
    void loadQuickOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function run() {
    setLoading(true);
    setError("");
    setData(null);
    setTradeMargin(null);
    try {
      const id = Number(entityId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Enter a valid ID");
      if (mode === "style") setData(await api.getStyleProfitability(id));
      if (mode === "lc") setData(await api.getLcProfitability(id));
      if (mode === "variance") setData(await api.getCostingVariance(id));
      if (mode === "trade_case") setTradeMargin(await api.getTradeCaseMargin(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "style"
      ? "Style Profitability"
      : mode === "lc"
        ? "LC Profitability"
        : mode === "trade_case"
          ? "Trade Case Profitability"
          : "Costing Variance";
  const placeholder =
    mode === "style" ? "Style ID" : mode === "trade_case" ? "Trade case ID" : "Order ID";
  const quickOptions = useMemo(() => {
    if (mode === "style") {
      return styles.map((s) => ({
        id: s.id,
        label: `${s.style_code} - ${s.name}`,
      }));
    }
    if (mode === "trade_case") {
      return tradeCases.map((t) => ({
        id: t.id,
        label: `${t.reference || `Trade case #${t.id}`} · ${t.status}`,
      }));
    }
    return orders.map((o) => ({
      id: o.id,
      label: `${o.order_code}${o.style_ref ? ` - ${o.style_ref}` : ""}`,
    }));
  }, [mode, styles, orders, tradeCases]);

  const kpiEntries =
    mode === "trade_case" && tradeMargin
      ? [
          ["Margin amount", tradeMargin.margin_amount],
          ["Margin %", tradeMargin.margin_pct],
          ["Estimated cost", tradeMargin.estimated_cost],
          ["Amount", tradeMargin.amount],
          ["Currency", tradeMargin.currency],
        ]
      : data
        ? Object.entries(data)
        : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Profitability & Variance</h1>
        <p className="mt-1 text-sm text-text-muted">Style, order/LC, trade case margin, and costing variance.</p>
        <p className="mt-2 text-xs text-text-muted">
          <strong>Order costing variance</strong> compares quotation vs BOM vs actuals. For inventory-issued quantities tied to BOM lines (PMI / consumption), also see{" "}
          <Link className="text-status-info hover:underline" to="/app/inventory/consumption-control">
            Consumption control
          </Link>{" "}
          (material variance API) and ledger movements with <code className="rounded bg-surface-subtle px-1">movement_kind</code>.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "style" ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "text-text-secondary"}`}
            onClick={() => setMode("style")}
          >
            Style Profitability
          </button>
          <button
            type="button"
            className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "lc" ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "text-text-secondary"}`}
            onClick={() => setMode("lc")}
          >
            LC Profitability
          </button>
          <button
            type="button"
            className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "trade_case" ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "text-text-secondary"}`}
            onClick={() => setMode("trade_case")}
          >
            Trade Case Profitability
          </button>
          <button
            type="button"
            className={`rounded border border-border-strong px-3 py-1 text-sm ${mode === "variance" ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "text-text-secondary"}`}
            onClick={() => setMode("variance")}
          >
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
        <div className="flex flex-wrap gap-2">
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

      {mode === "trade_case" && tradeMargin ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Trade case margin</h2>
            <Link className="text-sm font-medium text-brand-primary hover:underline" to={`/app/trade/cases/${tradeMargin.trade_case_id}`}>
              Open trade case
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {kpiEntries.map(([k, v]) => (
              <div key={String(k)} className="rounded border border-border p-3">
                <div className="text-xs uppercase text-text-muted">{String(k).replaceAll("_", " ")}</div>
                <div className="mt-1 text-lg font-semibold">
                  {typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v != null ? String(v) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : data ? (
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
          {mode === "style" && entityId ? (
            <p className="mt-3 text-xs text-text-muted">
              <Link className="text-brand-primary hover:underline" to={`/app/merchandising/styles/${entityId}`}>
                Open style record
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
