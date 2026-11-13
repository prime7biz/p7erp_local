import type { FinanceBooking, FinanceConstrainedResponse } from "@/api/mfgAdvancedPlanning";
import { useMfgFinanceConstrained } from "@/hooks/useMfgAdvancedPlanning";

import { formatDate, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips } from "../IntelligenceUi";
import { EmptyState, NoticeBox } from "../phase2/Phase2Ui";
import { MoneyText, NotPostedBanner, ValueClassChip } from "../phase3/Phase3Ui";
import { bucketLabel, formatMinutes, noticeText } from "./phase5Logic";

/**
 * Finance-limited view: which tentative bookings the company can pay for, week by week. Money arrives as 4-decimal
 * strings and is only formatted here. Rendered only with mfg_financial_readiness_v1 AND the can_view_finance hint.
 */
export function FinanceConstrainedView({ horizonDays, factoryUnit }: { horizonDays: number; factoryUnit?: string }) {
  const res = useMfgFinanceConstrained({ horizon_days: horizonDays, factory_unit: factoryUnit });
  return (
    <PanelCard
      testId="mfg-forward-finance"
      title="Finance-limited plan"
      subtitle="Confirmed orders are never cut. Tentative bookings the cash cannot carry are cut, lowest confidence first."
      loading={res.loading}
      error={res.error}
    >
      {res.data ? <FinanceBody data={res.data} /> : null}
      {!res.loading && !res.error && !res.data ? <EmptyState>No finance view loaded yet.</EmptyState> : null}
    </PanelCard>
  );
}

function FinanceBody({ data }: { data: FinanceConstrainedResponse }) {
  const gap = data.confirmed_financing_gap;
  return (
    <div className="space-y-3 text-xs">
      <NotPostedBanner />
      <div className="flex flex-wrap items-center gap-2">
        <ValueClassChip cls={data.value_class} />
        <span className="text-text-muted">
          {formatDate(data.date_from)} – {formatDate(data.date_to)} · amounts in {data.base_currency}
          {data.factory_unit ? ` · unit ${data.factory_unit}` : ""}
        </span>
      </div>
      {gap ? (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-red-900" data-testid="mfg-finance-gap">
          Even confirmed work cannot be financed from the week of {formatDate(gap.week_start)}: short by <MoneyText value={gap.shortfall} strong />.
          Arrange financing (for example a facility or an LC) - confirmed orders are never cut.
        </div>
      ) : (
        <NoticeBox tone="good">Confirmed work can be financed in every week of the horizon.</NoticeBox>
      )}
      <div className="flex flex-wrap gap-4">
        <div>
          <div className="text-text-muted">Facility headroom (memo)</div>
          <MoneyText value={data.facility_headroom.amount ?? null} strong />
        </div>
        <div>
          <div className="text-text-muted">Confirmed material still to buy (estimate)</div>
          <MoneyText value={data.confirmed_material.total ?? null} strong />
        </div>
        <div>
          <div className="text-text-muted">Tentative not admitted by capacity</div>
          <span className="font-semibold text-text-primary">{data.tentative_not_admitted_by_capacity}</span>
        </div>
      </div>

      {data.weeks.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="mfg-finance-weeks">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-1 pr-2 font-medium">Week</th>
                <th className="py-1 pr-2 text-right font-medium">Cash forecast (Cost & cash)</th>
                <th className="py-1 pr-2 text-right font-medium">+ confirmed material</th>
                <th className="py-1 pr-2 text-right font-medium">+ kept tentative</th>
                <th className="py-1 pr-2 text-right font-medium">With facility headroom</th>
              </tr>
            </thead>
            <tbody>
              {data.weeks.map((w) => (
                <tr key={w.week_index} className={`border-b border-border/60 ${w.below_zero ? "bg-red-50" : ""}`}>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {bucketLabel(w.week_start, w.week_end)}
                    {w.below_zero ? (
                      <span className="ml-1">
                        <Chip tone="bad">Below zero</Chip>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <MoneyText value={w.phase3_closing} />
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <MoneyText value={w.after_confirmed_material} />
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <MoneyText value={w.after_kept_tentative} />
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <MoneyText value={w.position_with_headroom} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No weeks in this horizon.</EmptyState>
      )}

      <BookingList title={`Tentative bookings kept (${data.kept.length})`} rows={data.kept} testId="mfg-finance-kept" />
      <BookingList title={`Tentative bookings cut (${data.cut.length})`} rows={data.cut} testId="mfg-finance-cut" />
      {data.forecast_cut.length ? (
        <p className="text-text-muted">{data.forecast_cut.length} forecast item(s) are not funded: forecast demand never gets cash.</p>
      ) : null}
      <ReasonChips codes={data.reason_codes} />
      {data.notices.length ? (
        <ul className="list-disc pl-5 text-[11px] text-text-muted">
          {data.notices.map((n) => (
            <li key={n}>{noticeText(n)}</li>
          ))}
        </ul>
      ) : null}
      {data.assumptions.length ? (
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer text-text-secondary">Assumptions ({data.assumptions.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function BookingList({ title, rows, testId }: { title: string; rows: FinanceBooking[]; testId: string }) {
  return (
    <details data-testid={testId}>
      <summary className="cursor-pointer font-medium text-text-primary">{title}</summary>
      {rows.length ? (
        <div className="mt-1 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-1 pr-2 font-medium">Booking</th>
                <th className="py-1 pr-2 font-medium">Start</th>
                <th className="py-1 pr-2 text-right font-medium">Confidence</th>
                <th className="py-1 pr-2 text-right font-medium">Minutes</th>
                <th className="py-1 pr-2 text-right font-medium">Cash needed</th>
                <th className="py-1 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/60 align-top">
                  <td className="py-1 pr-2">
                    #{r.booking_id}
                    {r.quotation_id ? ` · quotation #${r.quotation_id}` : r.inquiry_id ? ` · inquiry #${r.inquiry_id}` : ""}
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">{formatDate(r.start_date)}</td>
                  <td className="py-1 pr-2 text-right">{formatPercent(r.confidence_pct)}</td>
                  <td className="py-1 pr-2 text-right">{formatMinutes(r.full_minutes)}</td>
                  <td className="py-1 pr-2 text-right">
                    <MoneyText value={r.cash_need} />
                  </td>
                  <td className="py-1">
                    <ReasonChips codes={r.reason_codes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-1 text-text-muted">None.</p>
      )}
    </details>
  );
}
