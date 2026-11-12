import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import type { ProfitabilityResponse, ProfitWarning } from "@/api/financeControl";
import { amountText, marginText } from "@/components/finance/control/controlLogic";
import { ACCOUNT_GROUPS_SETUP_PATH } from "@/components/finance/statements/StatementBanners";
import { formatIndian, subtractMoneyText } from "@/components/finance/statements/statementFormat";

const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted";

const WARNING_TEXT: Record<string, string> = {
  COST_CENTER_LINES_OWNED_BY_OTHER_ORDER:
    "ledger line(s) on this cost centre belong to another order (they are linked to that order, so they are left out here to avoid counting them twice)",
};

/** Yellow banner for profit warnings. Unclassified accounts link to Account Groups, where the class is set. */
export function ProfitWarnings({ warnings }: { warnings: ProfitWarning[] | undefined }) {
  const list = warnings ?? [];
  if (list.length === 0) return null;
  return (
    <div className="space-y-2" role="status" data-testid="profit-warnings">
      {list.map((w) => (
        <div
          key={w.code}
          className="flex items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {w.code === "UNCLASSIFIED_ACCOUNTS" ? (
              <>
                <b>Unclassified:</b> {w.count} ledger line(s) with {formatIndian(w.amount)} sit in account groups without a statement class,
                so they are not counted as revenue or cost.{" "}
                <Link className="font-medium underline" to={ACCOUNT_GROUPS_SETUP_PATH}>
                  Set the Statement class in Account Groups
                </Link>
              </>
            ) : (
              <>
                {w.count} {WARNING_TEXT[w.code] ?? w.code.toLowerCase().replaceAll("_", " ")}
                {w.amount ? <> ({formatIndian(w.amount)})</> : null}
              </>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

interface LineProps {
  label: string;
  budget?: string;
  actual: string;
  strong?: boolean;
}

function Line({ label, budget, actual, strong }: LineProps) {
  const cell = strong ? "font-semibold" : "";
  return (
    <tr className="border-t border-border-subtle">
      <td className={`px-3 py-1.5 ${cell}`}>{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{budget === undefined ? "—" : formatIndian(budget)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${cell}`}>{formatIndian(actual)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {budget === undefined ? "—" : formatIndian(subtractMoneyText(actual, budget))}
      </td>
    </tr>
  );
}

/**
 * Profit of one order / style / contract / buyer: budget (quotation) beside actual (posted books),
 * coverage of the links, warnings and notes. Used by the order side panel and the entity page.
 */
export function ProfitDetail({ data }: { data: ProfitabilityResponse }) {
  const { budget, actual, coverage } = data;
  return (
    <div className="space-y-4" data-testid="profit-detail">
      <ProfitWarnings warnings={data.warnings} />

      <section className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 text-sm sm:grid-cols-3" aria-label="Result">
        <div>
          <p className="text-xs text-text-muted">Gross profit ({data.base_currency})</p>
          <p className="text-base font-semibold tabular-nums" data-testid="detail-gross">{formatIndian(data.gross_profit)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Nett profit ({data.base_currency})</p>
          <p className="text-base font-semibold tabular-nums" data-testid="detail-nett">{formatIndian(data.nett_profit)}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Margin</p>
          <p className="text-base font-semibold tabular-nums" data-testid="detail-margin">{marginText(data.margin_percent)}</p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-surface-raised" aria-label="Budget versus actual">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className={`${th} text-left`}>Line</th>
              <th className={`${th} text-right`}>Budget (quotation)</th>
              <th className={`${th} text-right`}>Actual (books)</th>
              <th className={`${th} text-right`}>Actual − budget</th>
            </tr>
          </thead>
          <tbody>
            <Line label="Revenue" budget={budget.revenue} actual={actual.revenue} />
            <Line label="Material" budget={budget.material} actual={actual.material} />
            <Line label="CM (cut and make)" budget={budget.cm} actual={actual.cm} />
            <Line label="Other cost" budget={budget.other} actual={actual.other} />
            <Line label="Overhead" actual={actual.overhead} />
            <Line label="Finance cost" actual={actual.finance_cost} />
          </tbody>
        </table>
        <p className="border-t border-border-subtle px-3 py-2 text-xs text-text-muted">
          The quotation has no overhead or finance cost, so those two lines have no budget. Shared overhead is not split between orders yet.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-4 text-sm" aria-label="Coverage">
        <p className="font-semibold text-text-primary">How the actuals were linked</p>
        <ul className="mt-2 grid gap-1 text-text-secondary sm:grid-cols-2" data-testid="detail-coverage">
          <li>Lines linked straight to the order: <b>{coverage.direct_voucher_lines}</b></li>
          <li>Lines linked through the contract cost centre: <b>{coverage.cost_center_lines}</b></li>
          <li>Lines with no order or contract link: <b>{coverage.unlinked_lines}</b></li>
          <li>Orders included: <b>{coverage.orders_in_scope}</b> ({coverage.orders_without_budget} without a quotation budget)</li>
        </ul>
        <p className="mt-2 text-text-secondary">
          Unattributed actual (profit and loss lines with no link, shown, never split): <b className="tabular-nums" data-testid="detail-unattributed">{amountText(data.unattributed_actual)}</b>
        </p>
      </section>

      {data.notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-text-muted" data-testid="detail-notes">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
