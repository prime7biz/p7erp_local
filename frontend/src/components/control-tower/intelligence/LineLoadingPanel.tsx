import type { CapacityResponse, LineLoadingResponse } from "@/api/manufacturingIntelligence";

import { formatDate, formatDecimal } from "./formatDecimal";
import { PanelCard, ReasonChips } from "./IntelligenceUi";
import { cellTitle, isSoftOnly, STATUS_STYLE, statusStyle } from "./panelLogic";

type Props = {
  capacity: CapacityResponse | null;
  lineLoading: LineLoadingResponse | null;
  loading?: boolean;
  error?: string;
};

/** Panel C: line x day loading grid (colour + letter + tooltip; firm vs soft-only distinguished). */
export function LineLoadingPanel({ capacity, lineLoading, loading, error }: Props) {
  const lines = capacity?.lines ?? [];
  const firstDays = lines[0]?.days ?? [];
  return (
    <PanelCard
      testId="mfg-line-loading-panel"
      title="Line loading by day"
      subtitle="Firm bookings and soft bookings against practical capacity. Scroll sideways for long windows."
      loading={loading}
      error={error}
    >
      <ul className="flex flex-wrap gap-3 text-[11px] text-text-secondary" aria-label="Legend">
        {Object.entries(STATUS_STYLE).map(([k, v]) => (
          <li key={k} className="inline-flex items-center gap-1">
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] font-bold ${v.cls}`}>{v.letter}</span>
            {k.charAt(0) + k.slice(1).toLowerCase()}
          </li>
        ))}
        <li className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border-2 border-dashed border-blue-500 bg-white text-[10px] font-bold text-blue-700">
            s
          </span>
          Soft booking only (dashed)
        </li>
      </ul>

      {capacity && lines.length === 0 ? <p className="text-xs text-text-muted">No sewing lines found for this filter.</p> : null}

      {lines.length > 0 ? (
        <div className="max-w-full overflow-x-auto rounded border border-border" tabIndex={0} aria-label="Line loading grid, scrolls horizontally">
          <table className="border-separate border-spacing-0 text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[84px] border-b border-r border-border bg-surface-raised px-2 py-1 text-left text-xs font-medium text-text-muted">
                  Line
                </th>
                {firstDays.map((d, i) => {
                  const day = d.date.slice(8, 10);
                  const showMonth = i === 0 || day === "01";
                  return (
                    <th key={d.date} className="min-w-[22px] border-b border-border px-0 py-0.5 text-center font-normal text-text-muted" title={formatDate(d.date)}>
                      {showMonth ? <div className="font-semibold">{d.date.slice(5, 7)}/</div> : null}
                      {day}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.line_id}>
                  <th scope="row" className="sticky left-0 z-10 border-r border-border/60 bg-surface-raised px-2 py-0.5 text-left text-xs font-medium text-text-primary">
                    {l.line_code}
                  </th>
                  {l.days.map((d) => {
                    const st = statusStyle(d.status);
                    const soft = isSoftOnly(d);
                    const title = cellTitle(l.line_code, d);
                    return (
                      <td key={d.date} className="p-px">
                        <span
                          role="img"
                          aria-label={title}
                          title={title}
                          data-status={d.status}
                          className={`flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold ${
                            soft ? "border-2 border-dashed border-blue-500 bg-white text-blue-700" : st.cls
                          }`}
                        >
                          {soft ? "s" : st.letter}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {lineLoading?.truncated ? (
        <p className="text-[11px] text-amber-900">The booking list was cut at the server limit; narrow the window or filter to see all rows.</p>
      ) : null}

      {lineLoading && lineLoading.unresolved_rows.length > 0 ? (
        <div className="space-y-1" data-testid="mfg-unresolved-rows">
          <h4 className="text-xs font-semibold text-text-primary">
            Bookings that could not be priced ({lineLoading.unresolved_rows.length})
          </h4>
          <p className="text-[11px] text-text-muted">These plans are left out of the load above until the missing data is fixed.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-1 font-medium">Plan #</th>
                  <th className="px-2 py-1 font-medium">Line</th>
                  <th className="px-2 py-1 font-medium">Order</th>
                  <th className="px-2 py-1 font-medium">Booking</th>
                  <th className="px-2 py-1 font-medium text-right">Remaining qty</th>
                  <th className="px-2 py-1 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {lineLoading.unresolved_rows.map((r) => (
                  <tr key={r.config_id} className="border-b border-border/60">
                    <td className="px-2 py-1">{r.config_id}</td>
                    <td className="px-2 py-1">{lines.find((x) => x.line_id === r.line_id)?.line_code ?? r.line_id}</td>
                    <td className="px-2 py-1">{r.order_id ?? "—"}</td>
                    <td className="px-2 py-1">{r.reservation_status}</td>
                    <td className="px-2 py-1 text-right">{formatDecimal(r.remaining_qty)}</td>
                    <td className="px-2 py-1">
                      <ReasonChips codes={[...r.reason_codes, ...r.missing_inputs]} tone="warn" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </PanelCard>
  );
}
