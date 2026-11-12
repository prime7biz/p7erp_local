import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { todayLocalISO } from "@/lib/dates";
import { fiscalYearOptions, normalizeStartMonth } from "@/lib/fiscalYear";
import { asOfForFiscalYear, periodForFiscalYear, type StatementPeriod } from "./statementPeriod";

const fieldClass =
  "rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

/** Financial-year start month of this company (Settings -> Configuration), 1-12. */
export function useFiscalStartMonth(): number {
  return normalizeStartMonth(useAuth().me?.feature_flags?.fiscal_year_start_month);
}

interface RangeProps {
  mode: "range";
  value: StatementPeriod;
  onChange: (next: StatementPeriod) => void;
}
interface YearProps {
  mode: "year";
  value: StatementPeriod;
  onChange: (next: StatementPeriod) => void;
}
interface AsOfProps {
  mode: "as-of";
  /** The as-of date (YYYY-MM-DD). */
  value: string;
  onChange: (next: string) => void;
}

/**
 * Period choice for a statement.
 *  - `range`: financial year select + From / To dates (typing a date clears the year).
 *  - `year`: financial year only (monthly statements).
 *  - `as-of`: financial year select (jumps to that year's end / today) + one As-of date.
 */
export function StatementPeriodPicker(props: RangeProps | YearProps | AsOfProps) {
  const startMonth = useFiscalStartMonth();
  const today = todayLocalISO();
  const options = useMemo(() => fiscalYearOptions(startMonth, today), [startMonth, today]);

  const selectedYear = props.mode === "as-of" ? asOfYear(props.value, options) : props.value.fiscalYear;

  function pickYear(fy: number) {
    if (props.mode === "as-of") props.onChange(asOfForFiscalYear(fy, startMonth, today));
    else props.onChange(periodForFiscalYear(fy, startMonth));
  }

  return (
    <div className="no-print flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-text-muted">
        Financial year
        <select
          className={`${fieldClass} mt-1 block`}
          value={selectedYear ?? ""}
          onChange={(e) => e.target.value && pickYear(Number(e.target.value))}
        >
          {selectedYear == null ? <option value="">Custom dates</option> : null}
          {options.map((o) => (
            <option key={o.fiscalYear} value={o.fiscalYear}>
              {o.label}
              {o.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>
      {props.mode === "range" ? (
        <>
          <label className="text-xs font-medium text-text-muted">
            From
            <input
              type="date"
              className={`${fieldClass} mt-1 block`}
              value={props.value.from}
              max={props.value.to || undefined}
              onChange={(e) => props.onChange({ ...props.value, fiscalYear: null, from: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-text-muted">
            To
            <input
              type="date"
              className={`${fieldClass} mt-1 block`}
              value={props.value.to}
              min={props.value.from || undefined}
              onChange={(e) => props.onChange({ ...props.value, fiscalYear: null, to: e.target.value })}
            />
          </label>
        </>
      ) : null}
      {props.mode === "as-of" ? (
        <label className="text-xs font-medium text-text-muted">
          As of
          <input
            type="date"
            className={`${fieldClass} mt-1 block`}
            value={props.value}
            onChange={(e) => e.target.value && props.onChange(e.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

function asOfYear(asOf: string, options: { fiscalYear: number; startDate: string; endDate: string }[]): number | null {
  return options.find((o) => asOf >= o.startDate && asOf <= o.endDate)?.fiscalYear ?? null;
}
