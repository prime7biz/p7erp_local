import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchMaterialStyles,
  fetchStyleControlSheet,
  type StyleControlSheet,
  type StyleListRow,
} from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import { logApiError } from "@/utils/logApiError";

export function StyleControlSheetPage() {
  const embedded = useEmbeddedPage();
  const [styles, setStyles] = useState<StyleListRow[]>([]);
  const [styleId, setStyleId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<StyleControlSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMaterialStyles({ limit: 100 })
      .then((res) => {
        if (cancelled) return;
        setStyles(res.items ?? []);
        if (!styleId && res.items?.[0]) setStyleId(res.items[0].style_id);
      })
      .catch((e) => {
        logApiError("StyleControlSheetPage.styles", e);
        if (!cancelled) setError("Could not load styles.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load styles once on mount
  }, []);

  useEffect(() => {
    if (styleId == null) {
      setSheet(null);
      return;
    }
    let cancelled = false;
    fetchStyleControlSheet(styleId)
      .then((res) => {
        if (!cancelled) {
          setSheet(res);
          setError(null);
        }
      })
      .catch((e) => {
        logApiError("StyleControlSheetPage.sheet", e);
        if (!cancelled) setError("Could not load style control sheet.");
      });
    return () => {
      cancelled = true;
    };
  }, [styleId]);

  const options = styles.map((s) => ({
    value: String(s.style_id),
    label: `${s.style_code}${s.style_name ? ` — ${s.style_name}` : ""} (${s.order_count} orders)`,
  }));

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader title="Style control sheet" description="Orders, POs, GRNs and issues for one style" />
      ) : null}
      <div className="max-w-md">
        <label className="mb-1 block text-xs font-medium text-text-secondary">Style</label>
        <LocalSearchSelect
          options={options}
          value={styleId != null ? String(styleId) : ""}
          onChange={(v) => setStyleId(v ? Number(v) : null)}
          placeholder={loading ? "Loading styles…" : "Search style"}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {sheet ? (
        <>
          {sheet.chain_health ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs">
              <span className="font-semibold text-text-secondary">Chain health</span>
              {(
                [
                  ["Inquiry", sheet.chain_health.inquiries, (id: number) => `/app/inquiries/${id}`],
                  ["Quotation", sheet.chain_health.quotations, (id: number) => `/app/quotations/${id}`],
                  ["Order", sheet.chain_health.orders, (id: number) => `/app/orders/${id}`],
                  ["BOM", sheet.chain_health.boms, (id: number) => `/app/bom?highlight=${id}`],
                  [
                    "PI",
                    sheet.chain_health.proforma_invoices,
                    (id: number) => `/app/commercial/proforma-invoices/${id}/edit`,
                  ],
                  [
                    "MSC",
                    sheet.chain_health.master_contracts,
                    (id: number) => `/app/commercial/master-contracts?highlight=${id}`,
                  ],
                  ["BTB", sheet.chain_health.btb_lcs, (id: number) => `/app/commercial/btb-lcs?highlight=${id}`],
                ] as const
              ).map(([label, node, href]) => {
                const linked = node.latest_id != null;
                const pill = (
                  <span
                    className={`rounded-full border px-2.5 py-1 ${
                      node.count > 0
                        ? "border-status-success/40 bg-status-success-subtle text-status-success-foreground"
                        : "border-border bg-surface-raised text-text-muted"
                    }`}
                  >
                    {label} · {node.count}
                    {node.latest_code ? ` · ${node.latest_code}` : ""}
                  </span>
                );
                return linked ? (
                  <Link key={label} to={href(node.latest_id!)} className="hover:opacity-90">
                    {pill}
                  </Link>
                ) : (
                  <span key={label}>{pill}</span>
                );
              })}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Orders", sheet.counts.orders],
                ["Open POs", sheet.counts.open_pos],
                ["Received GRNs", sheet.counts.received_grns],
                ["Unbilled GRNs", sheet.counts.unbilled_grns],
                ["PMI issued", sheet.counts.pmi_issued],
                ["PMI draft", sheet.counts.pmi_draft],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
                <div className="text-xs text-text-muted">{label}</div>
                <div className="text-lg font-semibold text-text-primary">{value}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-subtle text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Delivery</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {sheet.orders.map((o) => (
                  <tr key={o.order_id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link className="text-brand-primary hover:underline" to={`/app/orders/${o.order_id}`}>
                        {o.order_code}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{o.status ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{o.delivery_date ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{o.quantity ?? "—"}</td>
                  </tr>
                ))}
                {sheet.orders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-text-muted">
                      No orders linked to this style yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
