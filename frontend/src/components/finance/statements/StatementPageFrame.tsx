import type { ReactNode } from "react";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import type { CommentaryPeriodQuery, CommentaryReport } from "@/api/financeAiInsights";
import type { StatementEnvelope, StatementExportReport, StatementQuery } from "@/api/financeStatements";
import { FinanceAiCommentaryPanel } from "@/components/finance/ai/FinanceAiCommentaryPanel";
import type { StatementResource } from "@/hooks/useFinanceStatements";
import { useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { StatementWarnings, ReconciliationBadge } from "./StatementBanners";
import { StatementExportBar } from "./StatementExportBar";
import { StatementHeader } from "./StatementHeader";
import "./statementPrint.css";

interface Props<T extends StatementEnvelope> {
  /** Screen title, also used in the printed header. */
  title: string;
  description: string;
  resource: StatementResource<T>;
  /** Period / filter controls. */
  controls: ReactNode;
  /** Server export (Excel / PDF). Leave out for a report that has none (Stock vs Ledger). */
  exportInfo?: { report: StatementExportReport; query: StatementQuery; fileBase: string };
  /** Hide the "Balanced" badge for reports that have no balance rule. */
  hideReconciliation?: boolean;
  /** "Explain this report" (shown only while `finance_ai_insights_v2` is on). Leave out for reports AI does not cover. */
  aiReport?: { report: CommentaryReport; period: CommentaryPeriodQuery };
  children: (data: T) => ReactNode;
}

/**
 * Shared page shell of every Tally-style statement: page header, period controls, export / print,
 * company header, classification warnings, reconciliation badge and the loading / error / empty
 * / "switched off" states. The report body is rendered by `children(data)`.
 */
export function StatementPageFrame<T extends StatementEnvelope>({
  title,
  description,
  resource,
  controls,
  exportInfo,
  hideReconciliation,
  aiReport,
  children,
}: Props<T>) {
  const enabled = useStatementsEnabled();
  const { data, loading, error, errorStatus, reload } = resource;

  return (
    <div className={`${listPageRootClass} statement-print-root print-report`}>
      <AppPageHeader title={title} description={description} className="no-print" />

      {!enabled ? (
        <div role="status" className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">Tally-style statements are switched off</p>
          <p className="mt-1">
            An admin can switch on <b>Tally-style statements</b> in Settings → Configuration → More features → Finance
            navigation. The classic reports keep working.
          </p>
        </div>
      ) : (
        <>
          <div className="no-print flex flex-wrap items-end justify-between gap-3">
            {controls}
            {exportInfo ? (
              <StatementExportBar
                report={exportInfo.report}
                query={exportInfo.query}
                fileBase={exportInfo.fileBase}
                disabled={!data || loading}
              />
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="no-print flex flex-wrap items-center gap-3 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
              <span>
                {errorStatus === 403
                  ? "You do not have permission to view this statement."
                  : errorStatus === 404
                    ? "This statement is not switched on for your company."
                    : error}
              </span>
              {errorStatus !== 403 && errorStatus !== 404 ? (
                <button type="button" className="rounded border border-current px-2 py-0.5 text-xs" onClick={reload}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <StatementHeader title={title} data={data} />

          {loading && !data ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading statement">
              <div className="h-8 animate-pulse rounded bg-surface-subtle" />
              <div className="h-48 animate-pulse rounded-xl bg-surface-subtle" />
            </div>
          ) : null}

          {data ? (
            <>
              <div className="no-print flex flex-wrap items-center gap-2">
                {hideReconciliation ? null : <ReconciliationBadge reconciliation={data.reconciliation} />}
                <span className="text-xs text-text-muted">
                  Data as of {new Date(data.data_as_of).toLocaleString()}
                  {loading ? " · refreshing…" : ""}
                </span>
              </div>
              {aiReport ? <FinanceAiCommentaryPanel report={aiReport.report} period={aiReport.period} /> : null}
              <StatementWarnings warnings={data.warnings} />
              {children(data)}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
