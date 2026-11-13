import { useState } from "react";

import { mfgCostCashApi, type CostListResponse, type CostOrderStatusFilter, type OrderCost } from "@/api/mfgCostCash";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";

import { formatDate, formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips, Stat } from "../IntelligenceUi";
import { EmptyState, SelectField, secondaryBtn } from "../phase2/Phase2Ui";
import { OrderCostDrawer } from "./OrderCostDrawer";
import { MoneyCell, MoneyText, ValueClassChip } from "./Phase3Ui";
import {
  COST_STATUS_LABEL,
  costStatusTone,
  isNegativeText,
  moneyLoadError,
  PROGRESS_SOURCE_LABEL,
  ratioToPercentText,
} from "./phase3Logic";

const PAGE_SIZE = 50;

/** Order cost at completion: one row per confirmed order (estimate, never posted). */
export function CostAtCompletionCard() {
  const [status, setStatus] = useState<CostOrderStatusFilter | "">("");
  const [offset, setOffset] = useState(0);
  const [openActions, setOpenActions] = useState<string | number | null>(null);
  const [detailOrder, setDetailOrder] = useState<OrderCost | null>(null);

  const list = useMfgResource<CostListResponse>("CostAtCompletionCard.list", `${status}|${offset}`, () =>
    mfgCostCashApi.listCostAtCompletion({ status: status || undefined, limit: PAGE_SIZE, offset }),
  );
  const data = list.data;
  const error = list.error ? moneyLoadError(list.errorStatus, list.error, "Cost at completion") : "";
  const base = data?.base_currency ?? "";
  const from = data && data.total > 0 ? data.offset + 1 : 0;
  const to = data ? data.offset + data.items.length : 0;

  return (
    <PanelCard
      testId="mfg-cost-at-completion"
      title="Order cost at completion"
      subtitle="What each confirmed order will cost when finished, and the margin left. Figures are in the base currency."
      loading={list.loading}
      error={error}
    >
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          id="mfg-cost-status"
          label="Order status"
          value={status}
          placeholder="All confirmed orders"
          onChange={(v) => {
            setStatus(v as CostOrderStatusFilter | "");
            setOffset(0);
          }}
          options={[
            { value: "NEW", label: "New" },
            { value: "CONFIRMED", label: "Confirmed" },
            { value: "IN_PROGRESS", label: "In progress" },
          ]}
        />
        <button type="button" className={secondaryBtn} onClick={list.reload}>
          Reload
        </button>
      </div>

      {data ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="mfg-cost-totals">
          <Stat label={`Net revenue (${base})`} value={<MoneyText value={data.totals.revenue_net} />} />
          <Stat label={`Cost at completion (${base})`} value={<MoneyText value={data.totals.eac} />} />
          <Stat
            label="Margin"
            value={
              <span>
                <MoneyText value={data.totals.margin} /> <span className="text-sm text-text-muted">({formatPercent(data.totals.margin_pct)})</span>
              </span>
            }
          />
          <Stat
            label="Orders counted"
            value={data.totals.orders_counted}
            hint="Orders with unknown revenue or cost are left out of these totals."
          />
        </div>
      ) : null}
      {data && data.totals.orders_excluded > 0 ? (
        <p className="text-[11px] text-amber-900">
          {data.totals.orders_excluded} order(s) on this page are left out of the totals because their revenue or cost is unknown.
        </p>
      ) : null}
      {data?.cpm ? (
        <p className="text-[11px] text-text-muted">
          Factory cost per minute (CPM): {data.cpm.value != null ? `${formatDecimal(data.cpm.value, 4)} ${base}` : "unknown"}
          {data.cpm.period_start ? ` · months ${formatDate(data.cpm.period_start)} – ${formatDate(data.cpm.period_end)}` : ""}{" "}
          <ReasonChips codes={data.cpm.reason_codes} tone="warn" />
        </p>
      ) : null}

      {data && data.items.length === 0 ? <EmptyState>No confirmed orders match this filter.</EmptyState> : null}
      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Order cost at completion">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Order</th>
                <th className="px-2 py-1 font-medium">Data</th>
                <th className="px-2 py-1 text-right font-medium">Net revenue</th>
                <th className="px-2 py-1 text-right font-medium">Cost at completion</th>
                <th className="px-2 py-1 text-right font-medium">Margin</th>
                <th className="px-2 py-1 text-right font-medium">Progress</th>
                <th className="px-2 py-1 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => {
                const pct = ratioToPercentText(o.progress.p);
                return (
                  <tr key={o.order_id} className="border-b border-border/60 align-top">
                    <td className="px-2 py-1">
                      <div className="font-medium text-text-primary">{o.order_code}</div>
                      <div className="text-[11px] text-text-muted">
                        {o.order_status} · ex-factory {formatDate(o.delivery_date)} · qty {formatDecimal(o.order_qty)}
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <Chip tone={costStatusTone(o.status)}>{COST_STATUS_LABEL[o.status] ?? o.status}</Chip>
                      {o.missing_inputs.length ? (
                        <div className="mt-0.5 text-[11px] text-amber-900">{o.missing_inputs.length} input(s) missing</div>
                      ) : null}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <MoneyCell value={o.revenue.net} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <MoneyCell value={o.eac} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <MoneyText value={o.margin.amount} />
                        <span className={`text-[11px] ${isNegativeText(o.margin.margin_pct) ? "text-red-700" : "text-text-muted"}`}>
                          {formatPercent(o.margin.margin_pct)}
                        </span>
                        <ValueClassChip cls={o.margin.value_class} />
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div>{pct != null ? formatPercent(pct, 0) : "—"}</div>
                      <div className="text-[11px] text-text-muted">{PROGRESS_SOURCE_LABEL[o.progress.source] ?? o.progress.source}</div>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <RowActionsMenu
                        rowId={`cost-${o.order_id}`}
                        openId={openActions}
                        onOpenChange={setOpenActions}
                        items={[{ key: "view", label: "View details", onClick: () => setDetailOrder(o) }]}
                        menuPortal
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold" data-testid="mfg-cost-totals-row">
                <td className="px-2 py-1" colSpan={2}>
                  Total ({data.totals.orders_counted} counted)
                </td>
                <td className="px-2 py-1 text-right">
                  <MoneyText value={data.totals.revenue_net} />
                </td>
                <td className="px-2 py-1 text-right">
                  <MoneyText value={data.totals.eac} />
                </td>
                <td className="px-2 py-1 text-right">
                  <MoneyText value={data.totals.margin} /> <span className="text-[11px] font-normal text-text-muted">{formatPercent(data.totals.margin_pct)}</span>
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {data && data.total > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>
            Showing {from}–{to} of {data.total}
          </span>
          <button type="button" className={secondaryBtn} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            Previous
          </button>
          <button type="button" className={secondaryBtn} disabled={to >= data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Next
          </button>
        </div>
      ) : null}

      {data?.assumptions.length ? (
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer">How these figures are worked out</summary>
          <ul className="mt-1 list-disc pl-5">
            {data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <OrderCostDrawer order={detailOrder} onClose={() => setDetailOrder(null)} />
    </PanelCard>
  );
}
