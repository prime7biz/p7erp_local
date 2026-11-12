import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { StatementReconciliation, StatementWarning } from "@/api/financeStatements";
import { formatIndian, isZeroMoney } from "./statementFormat";

/** Where the statement class of an account group is set. */
export const ACCOUNT_GROUPS_SETUP_PATH = "/app/accounts/groups";

const WARNING_TEXT: Record<string, string> = {
  UNCLASSIFIED_GROUPS: "account group(s)",
  UNCLASSIFIED_STOCK: "stock line(s)",
  ZERO_DENOMINATOR: "ratio(s) could not be worked out",
};

/**
 * Warning banner for classification gaps. Unclassified groups are shown as "Unclassified" in the
 * statement (nothing is guessed); the link opens Account Groups where a Statement class is chosen.
 */
export function StatementWarnings({ warnings }: { warnings: StatementWarning[] | undefined }) {
  const list = warnings ?? [];
  if (list.length === 0) return null;
  return (
    <div className="no-print space-y-2" role="status">
      {list.map((w) => {
        const unclassified = w.code.startsWith("UNCLASSIFIED");
        return (
          <div
            key={w.code}
            className="flex flex-wrap items-start gap-2 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              {unclassified ? (
                <>
                  <b>Unclassified:</b> {w.count} {WARNING_TEXT[w.code] ?? "item(s)"}
                  {!isZeroMoney(w.amount) ? <> with {formatIndian(w.amount)}</> : null} are not given a statement
                  class yet. They are shown as <b>Unclassified</b>; nothing is guessed.{" "}
                  {w.code === "UNCLASSIFIED_GROUPS" ? (
                    <Link className="font-medium underline" to={ACCOUNT_GROUPS_SETUP_PATH}>
                      Set the Statement class in Account Groups
                    </Link>
                  ) : null}
                </>
              ) : (
                <>
                  {w.count} {WARNING_TEXT[w.code] ?? w.code.toLowerCase().replaceAll("_", " ")}
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** "Balanced" or "Out of balance by x". */
export function ReconciliationBadge({ reconciliation }: { reconciliation: StatementReconciliation | undefined }) {
  if (!reconciliation) return null;
  const ok = reconciliation.balanced;
  return (
    <span
      role="status"
      data-testid="reconciliation-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        ok
          ? "border-status-success/30 bg-status-success-subtle text-status-success-foreground"
          : "border-status-danger/30 bg-status-danger-subtle text-status-danger-foreground"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
      {ok ? "Balanced" : `Difference ${formatIndian(reconciliation.difference)}`}
    </span>
  );
}
