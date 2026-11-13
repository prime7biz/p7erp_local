import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { mfgCostCashApi, type MoneyValue, type OrderCost, type OrderCostDetail } from "@/api/mfgCostCash";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";

import { formatDate, formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, ReasonChips } from "../IntelligenceUi";
import { reasonLabel, reasonLabels } from "../reasonLabels";
import { ErrorBox } from "../phase2/Phase2Ui";
import { DetailDrawer, KeyValues, MoneyText, NotPostedBanner, ValueClassChip } from "./Phase3Ui";
import {
  COST_STATUS_LABEL,
  costStatusTone,
  GL_ACTUAL_LABEL,
  money,
  moneyLoadError,
  PROGRESS_SOURCE_LABEL,
  ratioToPercentText,
} from "./phase3Logic";

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

function sourceText(v: MoneyValue | null | undefined): string {
  if (!v) return "";
  const parts: string[] = [];
  if (v.source) parts.push(reasonLabel(v.source));
  if (v.currency && v.source_amount) parts.push(`${formatDecimal(v.source_amount, 2)} ${v.currency}`);
  if (v.rate) parts.push(`rate ${v.rate}${v.rate_source ? ` (${reasonLabel(v.rate_source)})` : ""}`);
  return parts.join(" · ");
}

function MoneyRow({ label, value }: { label: string; value: MoneyValue | null | undefined }) {
  return (
    <tr className="border-b border-border/60 align-top">
      <td className="px-2 py-1 text-text-secondary">{label}</td>
      <td className="px-2 py-1 text-right">
        <MoneyText value={value?.amount} />
      </td>
      <td className="px-2 py-1">{value ? <ValueClassChip cls={value.value_class} /> : null}</td>
      <td className="px-2 py-1 text-[11px] text-text-muted">
        {sourceText(value)}
        {value?.reason_codes.length ? (
          <div className="mt-0.5">
            <ReasonChips codes={value.reason_codes} tone="warn" />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/** Drawer with the single-order breakdown (GET /orders/{id}/cost-at-completion). */
export function OrderCostDrawer({ order, onClose }: { order: OrderCost | null; onClose: () => void }) {
  const orderId = order?.order_id ?? null;
  const detail = useMfgResource<OrderCostDetail>(
    "OrderCostDrawer.detail",
    String(orderId ?? ""),
    orderId != null ? () => mfgCostCashApi.getOrderCostAtCompletion(orderId) : null,
  );
  const d = detail.data && detail.data.order_id === orderId ? detail.data : null;
  const base = d?.base_currency ?? order?.base_currency ?? "";

  return (
    <DetailDrawer
      open={order != null}
      title={order ? `Cost at completion · ${order.order_code}` : "Cost at completion"}
      description={`All amounts in ${base || "the base currency"}.`}
      onClose={onClose}
    >
      <NotPostedBanner />
      {detail.loading ? (
        <p className="text-xs text-text-muted" role="status">
          Loading…
        </p>
      ) : null}
      <ErrorBox message={detail.error ? moneyLoadError(detail.errorStatus, detail.error, "Cost at completion") : ""} />
      {d ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <Chip tone={costStatusTone(d.status)}>{COST_STATUS_LABEL[d.status] ?? d.status}</Chip>
            <span>
              {d.order_status} · qty {formatDecimal(d.order_qty)} · ex-factory {formatDate(d.delivery_date)}
            </span>
          </div>

          <Section title="Revenue">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Revenue">
                <tbody>
                  <MoneyRow label="Gross (contract value)" value={d.revenue.gross} />
                  <MoneyRow label="Buying commission" value={d.revenue.commission} />
                  <MoneyRow label="Net revenue" value={d.revenue.net} />
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Budget vs cost at completion" testId="mfg-cost-buckets">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Budget vs cost at completion">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-1 font-medium">Cost bucket</th>
                    <th className="px-2 py-1 text-right font-medium">Budget</th>
                    <th className="px-2 py-1 text-right font-medium">At completion</th>
                    <th className="px-2 py-1 font-medium">Class</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/60">
                    <td className="px-2 py-1">Material</td>
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.material.budget.amount} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.material.eac.amount} />
                    </td>
                    <td className="px-2 py-1">
                      <ValueClassChip cls={d.material.eac.value_class} />
                    </td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-2 py-1">Conversion (CM)</td>
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.conversion.budget_cm} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.conversion.eac.amount} />
                    </td>
                    <td className="px-2 py-1">
                      <ValueClassChip cls={d.conversion.eac.value_class} />
                    </td>
                  </tr>
                  <tr className="border-b border-border/60">
                    <td className="px-2 py-1">Other cost</td>
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.budget.scaled.other} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.other.amount} />
                    </td>
                    <td className="px-2 py-1">
                      <ValueClassChip cls={d.other.value_class} />
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="px-2 py-1">Total cost at completion</td>
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1 text-right">
                      <MoneyText value={d.eac.amount} />
                    </td>
                    <td className="px-2 py-1">
                      <ValueClassChip cls={d.eac.value_class} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <KeyValues
              rows={[
                {
                  label: "Margin",
                  value: (
                    <span>
                      <MoneyText value={d.margin.amount} /> ({formatPercent(d.margin.margin_pct)})
                    </span>
                  ),
                },
                { label: "Conversion vs budget CM", value: money(d.conversion.variance_vs_budget_cm), hint: "Budget CM minus conversion at completion" },
                { label: "Budget source", value: reasonLabel(d.budget.source) },
                { label: "Budget scale factor", value: d.budget.scale_factor ?? "—" },
              ]}
            />
            {d.budget.reason_codes.length ? <ReasonChips codes={d.budget.reason_codes} tone="neutral" /> : null}
          </Section>

          <Section title="Material">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Material">
                <tbody>
                  <MoneyRow label="Bought on purchase orders" value={d.material.procured} />
                  <MoneyRow label="Budget not yet bought" value={d.material.remaining} />
                  <MoneyRow label="Material at completion" value={d.material.eac} />
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-text-muted">
              {d.material.po_lines} purchase-order line(s)
              {d.material.po_lines_unknown_fx ? `, ${d.material.po_lines_unknown_fx} without an exchange rate (left out)` : ""}.
            </p>
          </Section>

          <Section title="Conversion and progress">
            <KeyValues
              rows={[
                { label: "SMV per piece", value: d.conversion.smv ?? "—" },
                { label: "Order standard minutes (SAH)", value: formatDecimal(d.conversion.sah_minutes) },
                { label: "Cost per minute (CPM)", value: d.conversion.cpm != null ? formatDecimal(d.conversion.cpm, 4) : "Unknown" },
                {
                  label: "Progress",
                  value: (() => {
                    const pct = ratioToPercentText(d.progress.p);
                    return pct != null ? formatPercent(pct, 0) : "Unknown";
                  })(),
                },
                { label: "Progress from", value: PROGRESS_SOURCE_LABEL[d.progress.source] ?? d.progress.source },
                { label: "Sewing good pieces", value: formatDecimal(d.progress.sewing_good_qty) },
                { label: "Plan completed pieces", value: formatDecimal(d.progress.plan_completed_qty) },
                { label: "Conversion earned so far", value: money(d.progress.earned_conversion) },
                { label: "Conversion still to come", value: money(d.progress.remaining_conversion) },
              ]}
            />
          </Section>

          <Section title="Cost per minute (CPM) detail" testId="mfg-cpm-detail">
            <KeyValues
              rows={[
                { label: "CPM", value: d.cpm_detail.value != null ? formatDecimal(d.cpm_detail.value, 4) : "Unknown" },
                { label: "Source", value: d.cpm_detail.source ? reasonLabel(d.cpm_detail.source) : "—" },
                { label: "Months used", value: d.cpm_detail.period_start ? `${formatDate(d.cpm_detail.period_start)} – ${formatDate(d.cpm_detail.period_end)}` : "—" },
                { label: "Factory cost posted", value: money(d.cpm_detail.cm_total) },
                { label: "Sewing minutes earned", value: formatDecimal(d.cpm_detail.earned_minutes) },
              ]}
            />
            <ReasonChips codes={d.cpm_detail.reason_codes} tone="warn" />
            {d.cpm_detail.warnings.length ? (
              <ul className="list-disc pl-5 text-[11px] text-amber-900">
                {d.cpm_detail.warnings.map((w, i) => {
                  const code = typeof w.code === "string" ? w.code : "";
                  const extra = typeof w.amount === "string" ? ` (${money(w.amount)})` : typeof w.count === "number" ? ` (${w.count})` : "";
                  return <li key={`${code}-${i}`}>{code ? `${reasonLabel(code)}${extra}` : JSON.stringify(w)}</li>;
                })}
              </ul>
            ) : null}
          </Section>

          {d.gl_actual ? (
            <Section title={GL_ACTUAL_LABEL} testId="mfg-gl-actual">
              <p className="text-[11px] text-text-muted">{d.gl_actual.note}</p>
              <KeyValues
                rows={[
                  { label: "Revenue", value: money(d.gl_actual.revenue) },
                  { label: "Material", value: money(d.gl_actual.material) },
                  { label: "CM", value: money(d.gl_actual.cm) },
                  { label: "Other", value: money(d.gl_actual.other) },
                  { label: "Overhead", value: money(d.gl_actual.overhead) },
                  { label: "Finance cost", value: money(d.gl_actual.finance_cost) },
                  { label: "Voucher lines linked to the order", value: d.gl_actual.direct_voucher_lines },
                ]}
              />
              <div className="flex flex-wrap items-center gap-1">
                <ValueClassChip cls={d.gl_actual.value_class} />
                <ReasonChips codes={d.gl_actual.reason_codes} tone="warn" />
              </div>
            </Section>
          ) : null}

          {d.missing_inputs.length || d.reason_codes.length || Object.keys(d.unknown_by_currency).length ? (
            <Section title="Missing or uncertain inputs" testId="mfg-cost-missing">
              {d.missing_inputs.length ? (
                <ul className="list-disc pl-5 text-xs text-amber-900">
                  {reasonLabels(d.missing_inputs).map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              ) : null}
              <ReasonChips codes={d.reason_codes} tone="warn" />
              {Object.keys(d.unknown_by_currency).length ? (
                <p className="text-[11px] text-amber-900">
                  Left out (no exchange rate):{" "}
                  {Object.entries(d.unknown_by_currency)
                    .map(([ccy, amt]) => `${money(amt)} ${ccy}`)
                    .join(", ")}
                </p>
              ) : null}
            </Section>
          ) : null}

          {d.finance_link && d.finance_link.startsWith("/app/") ? (
            <Link to={d.finance_link} className="inline-block text-xs font-medium text-brand-primary hover:underline">
              Open order profitability in Finance
            </Link>
          ) : null}

          {d.assumptions.length ? (
            <details className="text-[11px] text-text-muted">
              <summary className="cursor-pointer">How these figures are worked out</summary>
              <ul className="mt-1 list-disc pl-5">
                {d.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </DetailDrawer>
  );
}
