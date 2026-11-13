import type { ControlTowerOrderRow } from "@/api/models";
import type { ReadinessResponse } from "@/api/manufacturingIntelligence";

import { formatDate, formatDecimal } from "./formatDecimal";
import { Chip, PanelCard, ReasonChips } from "./IntelligenceUi";
import { dimensionTone } from "./panelLogic";
import { DIMENSION_STATUS_LABEL, MATERIAL_AUTHORITY_LABEL, reasonLabel } from "./reasonLabels";

type PickerProps = {
  orders: ControlTowerOrderRow[];
  orderId: number | null;
  onChange: (id: number | null) => void;
};

/** Order picker: choose from orders in the Control Tower window, or type an order id. */
export function OrderPicker({ orders, orderId, onChange }: PickerProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="mfg-order-select" className="block text-xs font-medium text-text-secondary">
          Order
        </label>
        <select
          id="mfg-order-select"
          className="mt-1 min-w-[12rem] rounded border border-border px-2 py-1 text-sm"
          value={orderId != null && orders.some((o) => o.order_id === orderId) ? String(orderId) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select an order…</option>
          {orders.map((o) => (
            <option key={o.order_id} value={o.order_id}>
              {o.order_code}
              {o.customer_name ? ` · ${o.customer_name}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="mfg-order-id" className="block text-xs font-medium text-text-secondary">
          or Order ID
        </label>
        <input
          id="mfg-order-id"
          type="number"
          min={1}
          className="mt-1 w-28 rounded border border-border px-2 py-1 text-sm"
          value={orderId ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value && Number.isInteger(n) && n > 0 ? n : null);
          }}
        />
      </div>
    </div>
  );
}

type Props = {
  readiness: ReadinessResponse | null;
  hasOrder: boolean;
  loading?: boolean;
  error?: string;
};

/** Panels B/D: order readiness, six dimensions, blockers vs information, material lines. */
export function ReadinessPanel({ readiness, hasOrder, loading, error }: Props) {
  // Lines carry held_qty only while material allocation (Phase 2) is on for the tenant.
  const allocated = readiness?.material_lines.some((m) => m.held_qty !== undefined) ?? false;
  return (
    <PanelCard
      testId="mfg-readiness-panel"
      title="Order readiness"
      subtitle="Which checks are ready for this order, and what blocks it."
      loading={loading}
      error={error}
    >
      {!hasOrder ? <p className="text-xs text-text-muted">Pick an order to see its readiness.</p> : null}
      {readiness ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-text-primary">{readiness.order_code}</span>
            <Chip>{readiness.order_status}</Chip>
            <Chip tone={readiness.material_authority === "ORDER_BOM" ? "good" : "warn"} title={`Mode ${readiness.mode}`}>
              Material basis: {MATERIAL_AUTHORITY_LABEL[readiness.material_authority] ?? readiness.material_authority}
            </Chip>
            <Chip tone="info">{readiness.mode === "ORDER_BOM_V2" ? "Mode: order BOM" : "Mode: legacy"}</Chip>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Readiness checks">
            {readiness.dimensions.map((d) => (
              <li key={d.key} className="rounded-lg border border-border bg-surface-subtle p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-text-primary">{d.label}</span>
                  <Chip tone={dimensionTone(d.status)}>{DIMENSION_STATUS_LABEL[d.status] ?? d.status}</Chip>
                </div>
                {d.informational ? <div className="mt-1 text-[11px] text-text-muted">For information only</div> : null}
                {d.detail ? <div className="mt-1 text-[11px] text-text-muted">{d.detail}</div> : null}
                {d.reason_codes.length > 0 ? (
                  <div className="mt-1">
                    <ReasonChips codes={d.reason_codes} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="grid gap-3 md:grid-cols-2">
            <div data-testid="mfg-blockers">
              <h4 className="text-xs font-semibold text-red-900">Blockers ({readiness.blockers.length})</h4>
              {readiness.blockers.length === 0 ? (
                <p className="text-xs text-text-muted">No blockers found.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {readiness.blockers.map((b, i) => (
                    <li key={`${b.dimension}-${b.reason}-${i}`} className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-950">
                      <span className="font-medium">{b.department}</span>: {reasonLabel(b.reason)}
                      {b.detail ? <div className="text-[11px] text-red-900/80">{b.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div data-testid="mfg-info">
              <h4 className="text-xs font-semibold text-text-primary">Information ({readiness.info.length})</h4>
              {readiness.info.length === 0 ? (
                <p className="text-xs text-text-muted">Nothing to note.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {readiness.info.map((n, i) => (
                    <li key={`${n.dimension}-${n.reason}-${i}`} className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-950">
                      {reasonLabel(n.reason)}
                      {n.detail ? <div className="text-[11px] text-blue-900/80">{n.detail}</div> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {readiness.material_lines.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-text-primary">Material lines</h4>
              {allocated ? (
                <p className="text-[11px] text-text-muted" role="note">
                  {reasonLabel("READY_MEANS_ISSUED_PLUS_OWN_HARD_HOLDS")}. Open purchase orders only give an expected date.
                </p>
              ) : (
                <p className="text-[11px] text-text-muted" role="note">
                  {reasonLabel("SHARED_SUPPLY_NOT_ALLOCATED")}: available stock is counted for every order that needs it, so two orders
                  can both look covered by the same stock.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      <th className="px-2 py-1 font-medium">Item</th>
                      <th className="px-2 py-1 font-medium">UoM</th>
                      <th className="px-2 py-1 font-medium text-right">Required</th>
                      {allocated ? (
                        <>
                          <th className="px-2 py-1 font-medium text-right">Issued</th>
                          <th className="px-2 py-1 font-medium text-right">Held</th>
                          <th className="px-2 py-1 font-medium text-right">Linked to PO</th>
                        </>
                      ) : (
                        <th className="px-2 py-1 font-medium text-right">Available</th>
                      )}
                      <th className="px-2 py-1 font-medium text-right">Short</th>
                      {allocated ? <th className="px-2 py-1 font-medium">Expected</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {readiness.material_lines.map((m) => (
                      <tr key={m.bom_item_id} className="border-b border-border/60 align-top">
                        <td className="px-2 py-1">
                          {m.item_name ?? `Item ${m.item_id}`}
                          {m.category ? <span className="ml-1 text-[11px] text-text-muted">({m.category})</span> : null}
                          {allocated && m.reason_codes && m.reason_codes.length > 0 ? (
                            <div className="mt-0.5">
                              <ReasonChips codes={m.reason_codes} />
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-1">{m.uom ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{formatDecimal(m.required_qty, 2)}</td>
                        {allocated ? (
                          <>
                            <td className="px-2 py-1 text-right">{formatDecimal(m.issued_qty, 2)}</td>
                            <td className="px-2 py-1 text-right">
                              {formatDecimal(m.held_qty, 2)}
                              {m.tentative_held_qty && Number(m.tentative_held_qty) > 0 ? (
                                <div className="text-[11px] text-text-muted">+{formatDecimal(m.tentative_held_qty, 2)} tentative</div>
                              ) : null}
                            </td>
                            <td className="px-2 py-1 text-right">{formatDecimal(m.pegged_qty, 2)}</td>
                          </>
                        ) : (
                          <td className="px-2 py-1 text-right">{formatDecimal(m.available_qty, 2)}</td>
                        )}
                        <td className={`px-2 py-1 text-right ${m.ready === false ? "font-semibold text-red-700" : ""}`}>
                          {formatDecimal(m.short_qty, 2)}
                        </td>
                        {allocated ? <td className="px-2 py-1">{formatDate(m.expected_material_date)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {readiness.material_lines_truncated ? <p className="text-[11px] text-amber-900">Only the first lines are shown.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </PanelCard>
  );
}
