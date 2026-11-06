import { VOUCHER_NEXT_STEP_LABEL, VOUCHER_WORKFLOW_STEPS } from "@/components/vouchers/workflowMeta";

type Props = {
  status: string;
};

const STEP_SHORT: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CHECKED: "Checked",
  RECOMMENDED: "Recommended",
  APPROVED: "Approved",
  POSTED: "Posted",
};

function badgeClass(status: string): string {
  if (status === "POSTED") return "bg-status-success-subtle text-status-success-foreground";
  if (status === "REJECTED") return "bg-status-danger-subtle text-status-danger-foreground";
  if (status === "CANCELLED" || status === "REVERSED") return "bg-surface-subtle text-text-muted";
  if (status === "DRAFT") return "bg-surface-subtle text-text-secondary";
  return "bg-status-warning-subtle text-status-warning-foreground";
}

/**
 * Status badge + six-step approval bar (Draft → Posted) + what happens next.
 * Rejected / cancelled / reversed vouchers show no bar, only the outcome.
 */
export function VoucherWorkflowProgress({ status }: Props) {
  const s = (status || "").toUpperCase();
  const stepIndex = (VOUCHER_WORKFLOW_STEPS as readonly string[]).indexOf(s);
  const inChain = stepIndex >= 0;
  const next = VOUCHER_NEXT_STEP_LABEL[s] ?? "";
  const nextClass =
    s === "REJECTED" ? "text-status-danger-foreground" : s === "CANCELLED" || s === "REVERSED" ? "text-text-muted" : "text-text-secondary";

  return (
    <div className="min-w-[11rem] space-y-1">
      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${badgeClass(s)}`}>{s || "—"}</span>
      {inChain ? (
        <div
          className="flex items-center gap-0.5"
          role="img"
          aria-label={`Step ${stepIndex + 1} of ${VOUCHER_WORKFLOW_STEPS.length}: ${STEP_SHORT[s] ?? s}`}
        >
          {VOUCHER_WORKFLOW_STEPS.map((step, i) => (
            <span
              key={step}
              title={STEP_SHORT[step]}
              className={`h-1.5 flex-1 rounded-full ${
                i < stepIndex ? "bg-brand-primary opacity-50" : i === stepIndex ? "bg-brand-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      ) : null}
      {next ? <p className={`text-[11px] ${nextClass}`}>{next}</p> : null}
    </div>
  );
}
