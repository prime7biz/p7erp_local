import type { StatementEnvelope } from "@/api/financeStatements";
import { describePeriod } from "./statementPeriod";

/**
 * Company block shown above every statement (on screen and on paper):
 * company name, address, e-mail, statement title, period and currency.
 */
export function StatementHeader({ title, data }: { title: string; data: StatementEnvelope | null }) {
  return (
    <header className="print-avoid-break rounded-xl border border-border bg-surface-raised px-4 py-3 text-center print:rounded-none print:border-0 print:border-b print:border-border-strong">
      <p className="text-base font-semibold text-text-primary">{data?.company.name ?? "\u00A0"}</p>
      {data?.company.address ? <p className="text-xs text-text-muted">{data.company.address}</p> : null}
      {data?.company.email ? <p className="text-xs text-text-muted">{data.company.email}</p> : null}
      <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
      {data ? (
        <p className="text-sm text-text-secondary">
          {describePeriod(data.period)}
          <span className="text-text-muted"> · Amounts in {data.base_currency}</span>
        </p>
      ) : null}
    </header>
  );
}
