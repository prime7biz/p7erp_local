/**
 * Shown right after "Create employee": what was done, what failed (with retry), and one-click
 * documents. Each action is shown only when the user's role and the company settings allow it.
 */
import { useState } from "react";
import { CheckCircle2, FileText, IdCard, PartyPopper, Ticket, XCircle } from "lucide-react";
import { api, type HrOnboardingRun } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isValidationError, stepLabel } from "./employeeWorkspaceLogic";
import { downloadBlob } from "./recordTabs/shared";

type Props = {
  run: HrOnboardingRun;
  canGenerateDocuments: boolean;
  canPrintGatePass: boolean;
  onRetry: () => void;
  retrying: boolean;
  onClose: () => void;
};

export function NextStepsDialog({ run, canGenerateDocuments, canPrintGatePass, onRetry, retrying, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const employee = run.employee;
  const failed = (Object.keys(run.steps) as (keyof HrOnboardingRun["steps"])[]).filter((k) => run.steps[k] === "FAILED");
  // A refused salary (e.g. below the grade) fails the same way on retry; it must be corrected instead.
  const salaryNeedsFix = failed.length === 1 && failed[0] === "payroll" && isValidationError(run.error?.code);

  const download = async (key: string, fetcher: () => Promise<Blob>, filename: string) => {
    setBusy(key);
    setMessage("");
    try {
      downloadBlob(await fetcher(), filename);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  if (!employee) return null;
  const code = employee.employee_code;
  const action = (key: string, label: string, Icon: typeof IdCard, fetcher: () => Promise<Blob>, filename: string) => (
    <button
      type="button"
      onClick={() => void download(key, fetcher, filename)}
      disabled={busy !== null}
      className="flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
    >
      <Icon className="h-4 w-4 text-brand-primary" aria-hidden="true" />
      {busy === key ? "Preparing…" : label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="next-steps-title">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="border-b border-border-subtle pb-3">
          <CardTitle id="next-steps-title" className="flex items-center gap-2 text-lg">
            <PartyPopper className="h-5 w-5 text-brand-primary" aria-hidden="true" />
            {code} created
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <ul className="space-y-1 text-sm">
            {(Object.keys(run.steps) as (keyof HrOnboardingRun["steps"])[]).map((step) => (
              <li key={step} className="flex items-center gap-2">
                {run.steps[step] === "FAILED" ? (
                  <XCircle className="h-4 w-4 text-status-danger" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className={`h-4 w-4 ${run.steps[step] === "SKIPPED" ? "text-text-muted" : "text-status-success"}`} aria-hidden="true" />
                )}
                <span className="text-text-primary">{stepLabel(step)}</span>
                <span className="text-xs text-text-muted">{run.steps[step].toLowerCase()}</span>
              </li>
            ))}
          </ul>
          {failed.length > 0 && (
            <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              <p>{run.error?.message ?? "A step did not finish."} The employee is saved.</p>
              {salaryNeedsFix ? (
                <p className="mt-1">Continue to the profile and set a valid salary on the <strong>Salary</strong> tab.</p>
              ) : (
                <Button type="button" variant="outline" className="mt-2" onClick={onRetry} disabled={retrying}>
                  {retrying ? "Retrying…" : "Retry failed steps"}
                </Button>
              )}
            </div>
          )}
          {(canGenerateDocuments || (canPrintGatePass && run.gate_pass)) && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Documents</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {canGenerateDocuments && action("id", "ID card", IdCard, () => api.generateHrIdCard(employee.id), `${code}-id-card.pdf`)}
                {canGenerateDocuments &&
                  action("letter", "Appointment letter (QR signed)", FileText, () => api.generateHrAppointmentLetter(employee.id), `${code}-appointment-letter.pdf`)}
                {canGenerateDocuments &&
                  action("jd", "Job description (QR signed)", FileText, () => api.generateHrJobDescription(employee.id), `${code}-job-description.pdf`)}
                {canPrintGatePass &&
                  run.gate_pass &&
                  action("gate", `Temporary gate pass ${run.gate_pass.pass_code}`, Ticket, () => api.printHrGatePass(run.gate_pass!.id), `${run.gate_pass.pass_code}.pdf`)}
              </div>
            </div>
          )}
          {message && <p className="text-sm text-status-danger">{message}</p>}
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Continue to profile
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
