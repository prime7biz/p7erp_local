/** Budget forecast per cost centre x category: budget, posted, committed, forecast, status; one Actions menu per row. */
import { Fragment, useMemo, useState } from "react";
import { mgmtPerformanceApi, type BudgetForecastResponse, type ForecastRow, type MpAccess } from "@/api/mgmtPerformance";
import { LoadingBlock, NotesList, ReportError } from "@/components/finance/budget/BudgetPageParts";
import { useStatementResource } from "@/hooks/useFinanceStatements";
import { logApiError } from "@/utils/logApiError";
import {
  ActionsMenu,
  Chip,
  Dialog,
  Empty,
  Field,
  ReasonList,
  buttonClass,
  fieldClass,
  primaryButtonClass,
  tableWrap,
  td,
  tdR,
  th,
  thR,
} from "./MpParts";
import {
  STATUS_TEXT,
  forecastRowActions,
  isDecimalText,
  money,
  newRequestId,
  pct,
  reasonText,
  sourceText,
} from "./mgmtPerformanceLogic";

interface Props {
  period: string;
  access: MpAccess;
  onShowExceptions: () => void;
}

export function BudgetForecastView({ period, access, onShowExceptions }: Props) {
  const res = useStatementResource<BudgetForecastResponse>("mp.forecast", period, () => mgmtPerformanceApi.getBudgetForecast(period));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revise, setRevise] = useState<ForecastRow | null>(null);
  const d = res.data;
  const keyOf = (r: ForecastRow) => `${r.cost_center_id ?? 0}|${r.category}`;

  function pick(row: ForecastRow, id: string) {
    if (id === "months") setExpanded((cur) => (cur === keyOf(row) ? null : keyOf(row)));
    else if (id === "revise") setRevise(row);
    else if (id === "exceptions") onShowExceptions();
  }

  return (
    <div className="space-y-4">
      <ReportError error={res.error} status={res.errorStatus} onRetry={res.reload} />
      {res.loading && !d ? <LoadingBlock label="Loading budget forecast" /> : null}
      {d ? (
        <>
          <p className="text-xs text-text-muted">
            {d.scope === "company" ? "All cost centres" : "Your cost centres only"} · {d.period.label} · amounts in {d.base_currency}
            {d.budgets_used.length ? ` · budgets: ${d.budgets_used.map((b) => b.budget_name).join(", ")}` : " · no FINAL budget for this year"}
          </p>
          <ReasonList codes={d.reason_codes} text={reasonText} />
          {d.rows.length === 0 ? (
            <Empty>No budget, spend or commitment in this period yet.</Empty>
          ) : (
            <div className={tableWrap}>
              <table className="min-w-full text-sm" aria-label="Budget forecast">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className={th}>Cost centre</th>
                    <th className={th}>Category</th>
                    <th className={thR}>Budget</th>
                    <th className={thR}>Posted</th>
                    <th className={thR}>Committed</th>
                    <th className={thR}>Forecast</th>
                    <th className={thR}>Used %</th>
                    <th className={th}>Status</th>
                    <th className={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((row) => (
                    <Fragment key={keyOf(row)}>
                      <tr className="border-t border-border-subtle" data-testid="forecast-row">
                        <td className={td}>{row.cost_center_label}</td>
                        <td className={td}>
                          {row.category_label}
                          <span className="block text-[11px] text-text-muted">{row.sources.map(sourceText).join(", ")}</span>
                        </td>
                        {row.restricted ? (
                          <td className={`${td} text-xs text-text-muted`} colSpan={5}>
                            Payroll amounts are restricted (needs payroll permission).
                          </td>
                        ) : (
                          <>
                            <td className={tdR}>{money(row.budget)}</td>
                            <td className={tdR}>{money(row.actual)}</td>
                            <td className={tdR}>{money(row.committed)}</td>
                            <td className={`${tdR} font-medium`}>{money(row.forecast)}</td>
                            <td className={tdR}>{pct(row.used_pct)}</td>
                          </>
                        )}
                        <td className={td}>
                          <Chip status={row.status} label={STATUS_TEXT[row.status]} />
                        </td>
                        <td className={td}>
                          <ActionsMenu items={forecastRowActions(row, access)} onPick={(id) => pick(row, id)} />
                        </td>
                      </tr>
                      {expanded === keyOf(row) ? (
                        <tr className="bg-surface-subtle">
                          <td colSpan={9} className="px-3 py-2">
                            <table className="w-full text-xs" aria-label="Month by month">
                              <thead>
                                <tr className="text-text-muted">
                                  <th className="text-left">Month</th>
                                  <th className="text-right">Budget</th>
                                  <th className="text-right">Posted</th>
                                  <th className="text-right">Committed</th>
                                  <th className="text-right">Forecast</th>
                                  <th className="pl-3 text-left">How</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.months.map((m) => (
                                  <tr key={m.month}>
                                    <td>
                                      {m.month} ({m.kind})
                                    </td>
                                    <td className="text-right tabular-nums">{money(m.budget)}</td>
                                    <td className="text-right tabular-nums">{money(m.actual)}</td>
                                    <td className="text-right tabular-nums">{money(m.committed)}</td>
                                    <td className="text-right tabular-nums">{money(m.forecast)}</td>
                                    <td className="pl-3">{m.source ? sourceText(m.source) : ""}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold" data-testid="forecast-totals">
                    <td className={td} colSpan={2}>
                      Total operating expenses
                    </td>
                    <td className={tdR}>{money(d.totals.budget)}</td>
                    <td className={tdR}>{money(d.totals.actual)}</td>
                    <td className={tdR}>{money(d.totals.committed)}</td>
                    <td className={tdR}>{money(d.totals.forecast)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {d.unmapped.length ? (
            <div className="rounded-xl border border-status-warning/30 bg-surface-raised p-4 text-sm">
              <p className="font-semibold text-text-primary">Expense accounts without a category ({d.unmapped.length})</p>
              <p className="text-xs text-text-muted">They are not in the forecast. Give them a category in Setup → Expense categories.</p>
              <ul className="mt-2 space-y-1 text-xs">
                {d.unmapped.map((u, i) => (
                  <li key={`${u.kind}-${u.account_id ?? 0}-${u.cost_center_id ?? 0}-${i}`}>
                    {u.kind === "POSTED" ? "Posted" : "Budget"}: {u.account_label}
                    {u.cost_center_label ? ` (${u.cost_center_label})` : ""} - {money(u.amount)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.payroll?.length ? (
            <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <p className="font-semibold text-text-primary">Payroll projection (company total)</p>
              {d.payroll.map((p) => (
                <p key={p.month} className="mt-1 text-xs text-text-secondary">
                  {p.month}: {money(p.amount)} -{" "}
                  {p.source === "PAYROLL_RUN"
                    ? "from the finalised payroll run"
                    : `earned so far ${money(p.earned_to_date)} (attendance) + rest of month ${money(p.remaining)} + approved overtime ${money(p.overtime)}; ${p.employees} employees`}
                </p>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-text-muted">
            Status: Warning when the forecast reaches the category warning %; At risk when the forecast is above the budget; Over
            budget when posted spend is already above it.
          </p>
          <NotesList notes={d.notes} />
        </>
      ) : null}
      {revise ? (
        <RevisionDialog
          row={revise}
          onClose={() => setRevise(null)}
          onDone={() => {
            setRevise(null);
            res.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function RevisionDialog({ row, onClose, onDone }: { row: ForecastRow; onClose: () => void; onDone: () => void }) {
  const requestId = useMemo(() => newRequestId("rev"), []);
  const [lineId, setLineId] = useState<number>(row.budget_line_ids[0] ?? 0);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = isDecimalText(amount) && reason.trim().length >= 3;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await mgmtPerformanceApi.requestRevision({ request_id: requestId, kind: "CHANGE", budget_line_id: lineId, new_amount: amount.trim(), reason: reason.trim() });
      onDone();
    } catch (e) {
      logApiError("mgmtPerformance.requestRevision", e);
      setError((e as Error).message || "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Request a budget change"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButtonClass} disabled={!valid || busy} onClick={() => void submit()}>
            {busy ? "Sending…" : "Send for approval"}
          </button>
        </>
      }
    >
      <p className="text-text-secondary">
        {row.cost_center_label} · {row.category_label}. A second person must approve the change; the old amount is kept in the history.
      </p>
      {row.budget_line_ids.length > 1 ? (
        <Field label="Budget line">
          <select className={`${fieldClass} w-full`} value={lineId} onChange={(e) => setLineId(Number(e.target.value))}>
            {row.budget_line_ids.map((id) => (
              <option key={id} value={id}>
                Line #{id}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="New amount" hint="Whole budget-line amount, up to 4 decimals.">
        <input className={`${fieldClass} w-full`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Reason">
        <textarea className={`${fieldClass} w-full`} rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-status-danger-foreground">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
