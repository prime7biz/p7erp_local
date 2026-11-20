/**
 * Pilot cutover for user_authority_classes_v1: dry-run → review → apply → (optional) restore.
 * Does not turn the flag on; Super Admin still enables that in Configuration after apply.
 */
import { useState } from "react";
import { api, type AuthorityCutoverProposal } from "@/api/client";
import { useConfirm } from "@/components/app/useConfirm";
import { logApiError } from "@/utils/logApiError";

function statusLabel(status: string): string {
  switch ((status || "").toUpperCase()) {
    case "PROPOSED":
      return "Ready";
    case "APPLIED":
      return "Applied";
    case "SKIPPED":
      return "Skipped";
    case "UNRESOLVED":
      return "Needs fix";
    default:
      return status || "—";
  }
}

function classLabel(p: AuthorityCutoverProposal): string {
  if (p.proposed_is_tenant_super_admin) return "Super Admin";
  return p.proposed_authority_class || "—";
}

export function AuthorityCutoverPanel() {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"dry" | "apply" | "restore" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [proposals, setProposals] = useState<AuthorityCutoverProposal[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [unresolved, setUnresolved] = useState(0);
  const [earliestAdminId, setEarliestAdminId] = useState<number | null>(null);

  async function refreshProposals(keepSuccess?: string) {
    const res = await api.authorityCutoverDryRun();
    setProposals(res.proposals || []);
    setBlocked(Boolean(res.blocked));
    setUnresolved(res.unresolved_count || 0);
    setEarliestAdminId(res.earliest_admin_user_id ?? null);
    if (keepSuccess) {
      setSuccess(keepSuccess);
    } else {
      setSuccess(
        res.blocked
          ? `Dry-run done. ${res.unresolved_count} user(s) need a role before you can apply.`
          : `Dry-run done. ${res.proposals.length} user proposal(s). Review the table, then Apply.`,
      );
    }
  }

  async function runDryRun() {
    setBusy("dry");
    setError("");
    setSuccess("");
    try {
      await refreshProposals();
    } catch (e) {
      logApiError("AuthorityCutoverPanel.dryRun", e);
      setError(e instanceof Error ? e.message : "Dry-run failed");
    } finally {
      setBusy(null);
    }
  }

  async function runApply() {
    if (blocked) {
      setError("Fix unresolved users (give them a role), then run Dry-run again.");
      return;
    }
    const ok = await confirm({
      title: "Apply authority cutover?",
      description:
        "This sets Class, modules and Super Admin from the proposal table. It does not turn the feature flag on. Shared Roles are not changed. Other users may need to sign in again.",
      confirmLabel: "Apply proposals",
    });
    if (!ok) return;
    setBusy("apply");
    setError("");
    setSuccess("");
    try {
      const res = await api.authorityCutoverApply({});
      await refreshProposals(
        `Applied ${res.applied} user(s); skipped ${res.skipped}. You can now turn on User authority classes (Super Admin only).`,
      );
    } catch (e) {
      logApiError("AuthorityCutoverPanel.apply", e);
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  async function runRestore() {
    const ok = await confirm({
      title: "Restore cutover metadata?",
      description:
        "This puts Class, modules and Super Admin back to the values saved at dry-run. Roles stay unchanged. Prefer turning the flag off if you only want legacy access.",
      confirmLabel: "Restore",
      danger: true,
    });
    if (!ok) return;
    setBusy("restore");
    setError("");
    setSuccess("");
    try {
      const res = await api.authorityCutoverRestore();
      await refreshProposals(`Restored ${res.restored} user(s) from the cutover snapshot.`);
    } catch (e) {
      logApiError("AuthorityCutoverPanel.restore", e);
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-subtle p-3">
      <div>
        <p className="text-sm font-medium text-text-primary">Authority cutover (pilot)</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Step 1: Dry-run. Step 2: check Super Admin suggestion and Classes. Step 3: Apply. Step 4: turn on{" "}
          <b>User authority classes</b> above (Super Admin only, after preflight). Admin / Super Admin only.
        </p>
      </div>

      {(error || success) && (
        <div className="space-y-1">
          {error ? (
            <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
              {success}
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void runDryRun()}
          className="min-h-[44px] rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-subtle disabled:opacity-60"
        >
          {busy === "dry" ? "Running…" : "1. Dry-run"}
        </button>
        <button
          type="button"
          disabled={busy !== null || proposals.length === 0 || blocked}
          onClick={() => void runApply()}
          className="min-h-[44px] rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-60"
        >
          {busy === "apply" ? "Applying…" : "2. Apply"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void runRestore()}
          className="min-h-[44px] rounded-lg border border-status-danger/40 px-3 py-2 text-sm font-semibold text-status-danger-foreground hover:bg-status-danger-subtle disabled:opacity-60"
        >
          {busy === "restore" ? "Restoring…" : "Restore"}
        </button>
      </div>

      {proposals.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            Suggested Super Admin user id: {earliestAdminId ?? "—"}. Unresolved: {unresolved}.
            {blocked ? " Apply is blocked until every user has a role." : ""}
          </p>
          <div className="max-h-72 overflow-auto rounded border border-border bg-surface-raised">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-subtle text-text-secondary">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">User</th>
                  <th className="px-2 py-1.5 font-semibold">Role</th>
                  <th className="px-2 py-1.5 font-semibold">Proposed</th>
                  <th className="px-2 py-1.5 font-semibold">Modules</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.user_id} className="border-t border-border">
                    <td className="px-2 py-1.5 text-text-primary">
                      {p.username || `#${p.user_id}`}
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary">{p.original_role_name || "—"}</td>
                    <td className="px-2 py-1.5 text-text-primary">{classLabel(p)}</td>
                    <td className="px-2 py-1.5 text-text-secondary">
                      {(p.proposed_module_grants || []).join(", ") || "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          p.status === "UNRESOLVED"
                            ? "text-status-danger-foreground"
                            : "text-text-secondary"
                        }
                      >
                        {statusLabel(p.status)}
                      </span>
                      {p.reason ? (
                        <span className="mt-0.5 block text-[10px] text-text-muted">{p.reason}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">No proposals yet. Click Dry-run to generate them.</p>
      )}
    </div>
  );
}
