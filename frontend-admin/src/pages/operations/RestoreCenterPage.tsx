import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

/**
 * Restore Center — information architecture and confirmation flow only.
 * Full database restore stays restricted to break-glass ops; tenant sandbox restore is planned for a later phase.
 */
export function RestoreCenterPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [scope, setScope] = useState<"tenant_sandbox" | "full_db">("tenant_sandbox");
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Restore center"
        description="Plan and request restores with impact preview. Execution hooks are not enabled here yet."
        actions={
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setStep(1)}
          >
            Reset wizard
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        <StatusBadge variant={step >= 1 ? "success" : "neutral"}>1. Scope</StatusBadge>
        <StatusBadge variant={step >= 2 ? "success" : "neutral"}>2. Backup point</StatusBadge>
        <StatusBadge variant={step >= 3 ? "success" : "neutral"}>3. Impact preview</StatusBadge>
        <StatusBadge variant={step >= 4 ? "success" : "neutral"}>4. Verification</StatusBadge>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6 max-w-3xl">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Choose restore scope</h2>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
              <input
                type="radio"
                name="scope"
                checked={scope === "tenant_sandbox"}
                onChange={() => setScope("tenant_sandbox")}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-900">Tenant sandbox (planned)</div>
                <p className="text-xs text-slate-600 mt-1">
                  Restore one tenant’s business data into an isolated sandbox for UAT or investigation. Lowest blast
                  radius; aligns with entitlements and feature flags per tenant.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 cursor-not-allowed opacity-80">
              <input type="radio" name="scope" disabled checked={scope === "full_db"} readOnly className="mt-1" />
              <div>
                <div className="font-medium text-slate-900">Full database restore</div>
                <p className="text-xs text-amber-900 mt-1">
                  Restricted to super-admin break-glass procedures outside this UI. Not available from the panel.
                </p>
              </div>
            </label>
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Select backup point</h2>
            <p className="text-xs text-slate-600">
              Future integration: list completed backup jobs from Backup center (tenant-scoped or full dumps). For now,
              this step is a placeholder — pick a job reference in operations when execution ships.
            </p>
            <Link to="/operations/backups" className="text-sm font-medium text-indigo-600 hover:underline">
              Open backup center
            </Link>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setStep(3)}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Impact preview</h2>
            <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
              <li>Target environment: sandbox namespace (not production tenant DB).</li>
              <li>Estimated downtime: none for production (sandbox only).</li>
              <li>Data overlap: existing sandbox data for that tenant would be replaced.</li>
              <li>Compliance: log platform admin action + ticket reference (when implemented).</li>
            </ul>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setStep(2)}>
                Back
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setConfirmOpen(true)}
              >
                Request restore…
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">Post-restore verification (checklist)</h2>
            <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-2">
              <li>Smoke test login for the sandbox tenant.</li>
              <li>Spot-check key modules (inventory, finance) against expected backup date.</li>
              <li>Confirm background jobs and integrations are disabled or pointed at sandbox.</li>
              <li>Record outcome in the linked support ticket.</li>
            </ol>
            <p className="text-xs text-slate-500">This checklist will tie to automated health probes when execution is built.</p>
          </div>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm restore request">
        <p className="text-sm text-slate-700">
          Restore execution is not wired in this build. Confirming only advances the wizard to the verification checklist
          so teams can rehearse the operational flow.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              setConfirmOpen(false);
              setStep(4);
            }}
          >
            Acknowledge (no execution yet)
          </button>
        </div>
      </Modal>
    </div>
  );
}
