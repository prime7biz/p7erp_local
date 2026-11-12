import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ControlItem, ControlRule } from "@/api/financeBudgetAnalytics";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import {
  evidencePairs,
  moneyText,
  SEVERITY_CHIP,
  SEVERITY_LABEL,
  voucherHref,
} from "@/components/finance/budget/budgetLogic";
import { LoadingBlock, ReportError, SwitchedOffNotice } from "@/components/finance/budget/BudgetPageParts";
import { StatementPeriodPicker } from "@/components/finance/statements/StatementPeriodPicker";
import { useBudgetAnalyticsEnabled, useExpenseControls } from "@/hooks/useFinanceBudgetAnalytics";
import { todayLocalISO } from "@/lib/dates";

/**
 * Expense controls, tenant flag `finance_budget_analytics_v2`: one card per check (unusual increase,
 * unbudgeted spend, repeated amount, missing cost centre, budget alerts). Open a card to see its items
 * and the evidence. Alerts only: nothing is blocked and nothing is changed.
 */
export function ExpenseControlsPage() {
  const enabled = useBudgetAnalyticsEnabled();
  const [asOf, setAsOf] = useState(() => todayLocalISO());
  const [openCode, setOpenCode] = useState<string | null>(null);
  const { data, loading, error, errorStatus, reload } = useExpenseControls(asOf, enabled);
  const currency = data?.base_currency ?? "";

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Expense controls"
        description="Checks on posted expense: unusual increases, spend with no budget, repeated amounts, missing cost centres and budget alerts. Alerts only — nothing is blocked or changed."
      />

      {!enabled ? (
        <SwitchedOffNotice />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <StatementPeriodPicker mode="as-of" value={asOf} onChange={setAsOf} />
          </div>

          <ReportError error={error} status={errorStatus} onRetry={reload} />
          {loading && !data ? <LoadingBlock label="Loading expense controls" /> : null}

          {data ? (
            <>
              <p className="text-xs text-text-muted">
                As of {data.as_of_date} · financial year {data.fiscal_year} · amounts in {currency} · budget check on posting:{" "}
                {data.enforcement_mode || "—"} · data as of {new Date(data.data_as_of).toLocaleString()}
                {loading ? " · refreshing…" : ""}
              </p>
              {data.rules.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-muted">No checks to show.</p>
              ) : (
                <div className="space-y-3" aria-label="Control rules">
                  {data.rules.map((rule) => (
                    <RuleCard
                      key={rule.code}
                      rule={rule}
                      currency={currency}
                      open={openCode === rule.code}
                      onToggle={() => setOpenCode(openCode === rule.code ? null : rule.code)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function RuleCard({ rule, currency, open, onToggle }: { rule: ControlRule; currency: string; open: boolean; onToggle: () => void }) {
  const clear = rule.count === 0;
  const listId = `rule-items-${rule.code}`;
  return (
    <section
      data-testid={`rule-${rule.code}`}
      className={`rounded-xl border ${clear ? "border-border-subtle bg-surface-subtle" : "border-border bg-surface-raised shadow-sm"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">{rule.label}</h2>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_CHIP[rule.severity]}`}>
              {SEVERITY_LABEL[rule.severity]}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            <b className="tabular-nums text-text-primary" data-testid={`rule-count-${rule.code}`}>
              {rule.count}
            </b>{" "}
            item(s) · {currency} <span className="tabular-nums">{moneyText(rule.amount)}</span>
          </p>
          {rule.note ? <p className="mt-1 text-xs text-text-muted">{rule.note}</p> : null}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          aria-expanded={open}
          aria-controls={listId}
          disabled={clear}
          onClick={onToggle}
        >
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          {clear ? "All clear" : open ? "Hide items" : "Show items"}
        </button>
      </div>
      {open ? (
        <div id={listId} className="border-t border-border-subtle">
          {rule.items.length < rule.count ? (
            <p className="px-4 pt-3 text-xs text-text-muted">
              Showing the first {rule.items.length} of {rule.count} items (worst first).
            </p>
          ) : null}
          <ul className="divide-y divide-border-subtle">
            {rule.items.map((item, i) => (
              <ControlItemRow key={`${item.code}-${i}`} item={item} currency={currency} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ControlItemRow({ item, currency }: { item: ControlItem; currency: string }) {
  const pairs = evidencePairs(item.evidence);
  return (
    <li className="px-4 py-3 text-sm" data-testid="control-item">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-text-primary">{item.title}</p>
        <span className="tabular-nums text-text-primary">
          {currency} {moneyText(item.amount)}
        </span>
      </div>
      {pairs.length > 0 ? (
        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-muted">
          {pairs.map((p) => (
            <div key={p.label} className="flex gap-1">
              <dt>{p.label}:</dt>
              <dd className="tabular-nums text-text-secondary">{p.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.voucher_ids.length > 0 ? (
        <p className="mt-1 flex flex-wrap gap-2 text-xs">
          <span className="text-text-muted">Vouchers:</span>
          {item.voucher_ids.map((id) => (
            <Link key={id} className="text-brand-primary hover:underline" to={voucherHref(id)}>
              #{id}
            </Link>
          ))}
        </p>
      ) : null}
    </li>
  );
}
