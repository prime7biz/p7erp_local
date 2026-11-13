import { Fragment, useState, type FormEvent } from "react";

import {
  CASH_DEFAULT_HORIZON_DAYS,
  CASH_MAX_HORIZON_DAYS,
  mfgCostCashApi,
  type CashRequirementResponse,
  type CashRow,
} from "@/api/mfgCostCash";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";
import { todayLocalISO } from "@/lib/dates";

import { formatDate, formatDecimal } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips, Stat } from "../IntelligenceUi";
import { reasonLabel } from "../reasonLabels";
import { EmptyState, ErrorList, NoticeBox, secondaryBtn, TextField } from "../phase2/Phase2Ui";
import { KeyValues, MoneyText } from "./Phase3Ui";
import { cashCategoryLabel, CONFIDENCE_LABEL, confidenceTone, horizonError, money, moneyLoadError, splitNote } from "./phase3Logic";

const ROWS_STEP = 100;

/** Factory cash requirement: weekly forecast of cash in / out from dated source documents. Never posted. */
export function CashRequirementCard() {
  const [dateFrom, setDateFrom] = useState(() => todayLocalISO());
  const [horizon, setHorizon] = useState(String(CASH_DEFAULT_HORIZON_DAYS));
  const [applied, setApplied] = useState<{ date_from: string; horizon_days: number }>(() => ({
    date_from: todayLocalISO(),
    horizon_days: CASH_DEFAULT_HORIZON_DAYS,
  }));
  const [inputErrors, setInputErrors] = useState<string[]>([]);
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(() => new Set());
  const [rowLimit, setRowLimit] = useState(ROWS_STEP);

  const cash = useMfgResource<CashRequirementResponse>(
    "CashRequirementCard.cash",
    `${applied.date_from}|${applied.horizon_days}`,
    () => mfgCostCashApi.getCashRequirement(applied),
  );
  const data = cash.data;
  const error = cash.error ? moneyLoadError(cash.errorStatus, cash.error, "Cash requirement") : "";
  const base = data?.base_currency ?? "";

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!dateFrom) errs.push("Choose a start date.");
    const hErr = horizonError(horizon, CASH_MAX_HORIZON_DAYS);
    if (hErr) errs.push(hErr);
    setInputErrors(errs);
    if (errs.length) return;
    setOpenWeeks(new Set());
    setRowLimit(ROWS_STEP);
    const next = { date_from: dateFrom, horizon_days: Number(horizon.trim()) };
    if (next.date_from === applied.date_from && next.horizon_days === applied.horizon_days) cash.reload();
    else setApplied(next);
  };

  const toggleWeek = (i: number) =>
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <PanelCard
      testId="mfg-cash-requirement"
      title="Cash requirement"
      subtitle="How much cash the factory will need week by week: supplier, BTB, loan and payroll payments out; export receipts in."
      loading={cash.loading}
      error={error}
    >
      <form className="flex flex-wrap items-end gap-3" onSubmit={apply}>
        <TextField id="mfg-cash-from" label="Week 1 starts on" type="date" value={dateFrom} onChange={setDateFrom} />
        <TextField
          id="mfg-cash-horizon"
          label="Horizon (days)"
          inputMode="numeric"
          value={horizon}
          onChange={setHorizon}
          hint={`1-${CASH_MAX_HORIZON_DAYS}`}
        />
        <button type="submit" className={secondaryBtn}>
          Show forecast
        </button>
      </form>
      <ErrorList errors={inputErrors} />

      {data ? (
        <>
          <p className="text-[11px] text-text-muted">
            {formatDate(data.date_from)} – {formatDate(data.date_to)} ({data.horizon_days} days, {data.weeks.length} weeks), amounts in {base}.
            Export receipts: document days {data.settings.export_document_days} + usance {data.settings.export_usance_days}; BTB usance when no
            maturity is stored: {data.settings.btb_usance_days} days.
          </p>

          {data.forecast_complete === false ? (
            <NoticeBox tone="warn">
              <span data-testid="mfg-cash-incomplete">
                <strong>Forecast incomplete:</strong> some records were left out because there are too many to read at once (
                {data.reason_codes.filter((c) => c.startsWith("SOURCE_TRUNCATED:")).map(reasonLabel).join(", ")}). Treat the totals as a
                minimum and use a shorter horizon or check the source lists.
              </span>
            </NoticeBox>
          ) : null}
          {data.financing_gap ? (
            <div role="alert" data-testid="mfg-financing-gap" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <strong>Financing gap:</strong> cash runs short in week {data.financing_gap.week_index + 1} (starting{" "}
              {formatDate(data.financing_gap.week_start)}). Shortfall: <strong>{money(data.financing_gap.shortfall)} {base}</strong>. Arrange
              financing or move payments before then.
            </div>
          ) : (
            <NoticeBox tone="good">No financing gap: net cash stays at or above zero in every week of this horizon.</NoticeBox>
          )}

          <div className="space-y-2" data-testid="mfg-cash-opening">
            <h4 className="text-xs font-semibold text-text-primary">Opening cash on {formatDate(data.date_from)}</h4>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat
                label="Net cash (after drawn overdraft)"
                value={<MoneyText value={data.opening.including_overdraft} />}
                hint="Cash in hand + bank - drawn bank overdraft. Week 1 starts with this figure."
              />
              <Stat label="Cash in" value={<MoneyText value={data.totals.inflow} />} />
              <Stat label="Cash out" value={<MoneyText value={data.totals.outflow} />} />
              <Stat label="Closing net cash" value={<MoneyText value={data.totals.closing} />} />
            </div>
            <KeyValues
              rows={[
                { label: "Cash in hand", value: money(data.opening.cash_in_hand) },
                { label: "Bank", value: money(data.opening.bank) },
                { label: "Cash + bank before overdraft", value: money(data.opening.excluding_overdraft) },
                { label: "Drawn bank overdraft", value: money(data.opening.bank_od) },
                { label: "Net cash (used for the forecast)", value: money(data.opening.including_overdraft) },
                { label: "Net change over the horizon", value: money(data.totals.net) },
              ]}
            />
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-text-primary">Week by week</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Weekly cash requirement">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-1 font-medium">Week</th>
                    <th className="px-2 py-1 text-right font-medium">Opening</th>
                    <th className="px-2 py-1 text-right font-medium">Cash in</th>
                    <th className="px-2 py-1 text-right font-medium">Cash out</th>
                    <th className="px-2 py-1 text-right font-medium">Net</th>
                    <th className="px-2 py-1 text-right font-medium">Closing</th>
                    <th className="px-2 py-1 font-medium">Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weeks.map((w) => {
                    const open = openWeeks.has(w.week_index);
                    const cats = Object.entries(w.by_category);
                    return (
                      <Fragment key={w.week_index}>
                        <tr
                          className={`border-b border-border/60 align-top ${w.below_zero ? "bg-red-50" : ""}`}
                          data-testid={w.below_zero ? "mfg-cash-week-below-zero" : undefined}
                        >
                          <td className="px-2 py-1">
                            <div className="font-medium">Week {w.week_index + 1}</div>
                            <div className="text-[11px] text-text-muted">
                              {formatDate(w.week_start)} – {formatDate(w.week_end)}
                            </div>
                            {w.below_zero ? <Chip tone="bad">Below zero</Chip> : null}
                          </td>
                          <td className="px-2 py-1 text-right">
                            <MoneyText value={w.opening} />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <MoneyText value={w.inflow} />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <MoneyText value={w.outflow} />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <MoneyText value={w.net} />
                          </td>
                          <td className="px-2 py-1 text-right">
                            <MoneyText value={w.closing} strong />
                          </td>
                          <td className="px-2 py-1">
                            {cats.length ? (
                              <button
                                type="button"
                                className="text-[11px] font-medium text-brand-primary hover:underline"
                                aria-expanded={open}
                                onClick={() => toggleWeek(w.week_index)}
                              >
                                {open ? "Hide" : "Show"} {cats.length} categor{cats.length === 1 ? "y" : "ies"}
                              </button>
                            ) : (
                              <span className="text-[11px] text-text-muted">Nothing due</span>
                            )}
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-b border-border/60 bg-surface-subtle">
                            <td colSpan={7} className="px-4 py-2">
                              <ul className="grid gap-1 sm:grid-cols-2">
                                {cats.map(([cat, amt]) => (
                                  <li key={cat} className="flex justify-between gap-2">
                                    <span className="text-text-secondary">{cashCategoryLabel(cat)}</span>
                                    <MoneyText value={amt} />
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950" data-testid="mfg-facility-headroom">
            <div className="font-semibold">Available financing (memo, not cash)</div>
            <div className="mt-1">
              Unused limits on {data.facility_headroom.facilities} active facilit{data.facility_headroom.facilities === 1 ? "y" : "ies"}:{" "}
              <strong>
                {money(data.facility_headroom.amount)} {base}
              </strong>
              . {data.facility_headroom.note}
            </div>
            {Object.keys(data.facility_headroom.unknown_by_currency).length ? (
              <div className="mt-1">
                Not converted (no exchange rate):{" "}
                {Object.entries(data.facility_headroom.unknown_by_currency)
                  .map(([ccy, amt]) => `${money(amt)} ${ccy}`)
                  .join(", ")}
              </div>
            ) : null}
          </div>

          {data.undated.rows > 0 || data.beyond_horizon_rows > 0 ? (
            <NoticeBox tone="warn">
              {data.undated.rows > 0
                ? `${data.undated.rows} item(s) have no date and are not in any week (in ${money(data.undated.inflow)}, out ${money(data.undated.outflow)}). `
                : ""}
              {data.beyond_horizon_rows > 0 ? `${data.beyond_horizon_rows} item(s) fall after this horizon.` : ""}
            </NoticeBox>
          ) : null}

          {data.unknown_by_currency.length ? (
            <div className="space-y-1" data-testid="mfg-cash-unknown-fx">
              <h4 className="text-xs font-semibold text-text-primary">Left out: no exchange rate</h4>
              <ul className="list-disc pl-5 text-xs text-amber-900">
                {data.unknown_by_currency.map((u) => (
                  <li key={`${u.direction}-${u.category}-${u.currency}`}>
                    {u.direction === "IN" ? "In" : "Out"} · {cashCategoryLabel(u.category)}: {money(u.source_amount)} {u.currency} ({u.rows} item
                    {u.rows === 1 ? "" : "s"})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.notes.length || data.reason_codes.length ? (
            <div className="space-y-1" data-testid="mfg-cash-notes">
              <h4 className="text-xs font-semibold text-text-primary">Notes</h4>
              <ReasonChips codes={data.reason_codes} tone="warn" />
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
                {data.notes.map((n) => {
                  const { code, text } = splitNote(n);
                  return (
                    <li key={n} className={code ? "text-amber-900" : undefined}>
                      {code ? <strong>{reasonLabel(code)}: </strong> : null}
                      {text}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <CashRowsTable rows={data.rows} rowCount={data.row_count} truncated={data.truncated} limit={rowLimit} onMore={() => setRowLimit((n) => n + ROWS_STEP)} />
        </>
      ) : null}
    </PanelCard>
  );
}

function CashRowsTable({
  rows,
  rowCount,
  truncated,
  limit,
  onMore,
}: {
  rows: CashRow[];
  rowCount: number;
  truncated: boolean;
  limit: number;
  onMore: () => void;
}) {
  const shown = rows.slice(0, limit);
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-text-primary">Items behind the figures</h4>
      {truncated ? (
        <NoticeBox tone="warn">
          <span data-testid="mfg-cash-truncated">
            Only the first {rows.length} of {rowCount} items are listed here. The weekly totals above still include all {rowCount}.
          </span>
        </NoticeBox>
      ) : null}
      {rows.length === 0 ? <EmptyState>No cash items in this horizon.</EmptyState> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Cash items">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">In / out</th>
                <th className="px-2 py-1 font-medium">Category</th>
                <th className="px-2 py-1 font-medium">Source</th>
                <th className="px-2 py-1 font-medium">Due</th>
                <th className="px-2 py-1 font-medium">Confidence</th>
                <th className="px-2 py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.source_type}-${r.source_id ?? "x"}-${r.category}-${i}`} className="border-b border-border/60 align-top">
                  <td className="px-2 py-1">
                    <Chip tone={r.direction === "IN" ? "good" : "neutral"}>{r.direction === "IN" ? "In" : "Out"}</Chip>
                  </td>
                  <td className="px-2 py-1">{cashCategoryLabel(r.category)}</td>
                  <td className="px-2 py-1">
                    <div className="font-medium">{r.reference ?? (r.source_id != null ? `#${r.source_id}` : "—")}</div>
                    <div className="text-[11px] text-text-muted">{reasonLabel(r.source_type)}</div>
                  </td>
                  <td className="px-2 py-1">
                    <div>{formatDate(r.due_date)}</div>
                    <div className="text-[11px] text-text-muted">{reasonLabel(r.date_rule)}</div>
                    {r.overdue ? <Chip tone="bad">Overdue</Chip> : null}
                  </td>
                  <td className="px-2 py-1">
                    <Chip tone={confidenceTone(r.confidence)}>{CONFIDENCE_LABEL[r.confidence] ?? r.confidence}</Chip>
                  </td>
                  <td className="px-2 py-1 text-right">
                    {r.amount != null ? <MoneyText value={r.amount} /> : <span className="text-amber-900">Unknown</span>}
                    {r.currency && r.source_amount ? (
                      <div className="text-[11px] text-text-muted">
                        {formatDecimal(r.source_amount, 2)} {r.currency}
                        {r.rate ? ` @ ${r.rate}` : ""}
                      </div>
                    ) : null}
                    {r.reason_codes.filter((c) => c !== "OVERDUE").length ? (
                      <div className="mt-0.5">
                        <ReasonChips codes={r.reason_codes.filter((c) => c !== "OVERDUE")} tone="warn" />
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {rows.length > shown.length ? (
        <button type="button" className={secondaryBtn} onClick={onMore}>
          Show more ({rows.length - shown.length} left)
        </button>
      ) : null}
    </div>
  );
}
