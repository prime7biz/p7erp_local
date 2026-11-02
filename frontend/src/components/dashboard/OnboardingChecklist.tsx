import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, X } from "lucide-react";
import { api, type OnboardingChecklist as Checklist } from "@/api/client";
import { resolveRole } from "@/lib/roles";
import { logApiError } from "@/utils/logApiError";

function dismissKey(tenantId: number | undefined) {
  return `p7_onboarding_dismissed:${tenantId ?? "unknown"}`;
}

/** "Get started" card for admins/managers until every setup step is done (or they hide it). */
export function OnboardingChecklist({ tenantId, roleName }: { tenantId?: number; roleName?: string | null }) {
  const eligible = resolveRole(roleName).isElevated;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey(tenantId)) === "1";
    } catch {
      return false;
    }
  });
  const [data, setData] = useState<Checklist | null>(null);

  useEffect(() => {
    if (!eligible || dismissed) return;
    let cancelled = false;
    api
      .getOnboardingChecklist()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => logApiError("OnboardingChecklist.load", e));
    return () => {
      cancelled = true;
    };
  }, [eligible, dismissed]);

  if (!eligible || dismissed || !data || data.completed >= data.total) return null;
  const pct = Math.round((data.completed / data.total) * 100);

  const hide = () => {
    try {
      localStorage.setItem(dismissKey(tenantId), "1");
    } catch {
      /* private mode: hide for this session only */
    }
    setDismissed(true);
  };

  return (
    <section aria-labelledby="onboarding-title" className="rounded-2xl border border-brand-primary/30 bg-brand-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="onboarding-title" className="text-base font-semibold text-text-primary">
            Get started with Prime7 ERP
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            {data.completed} of {data.total} setup steps done. Each step ticks itself off when the data exists.
          </p>
        </div>
        <button type="button" onClick={hide} className="rounded-md p-1 text-text-muted hover:bg-surface-subtle" aria-label="Hide setup checklist">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link
              to={s.href}
              className={`flex h-full items-start gap-2 rounded-xl border bg-surface-raised p-3 text-sm transition hover:border-brand-primary/50 ${
                s.done ? "border-border opacity-70" : "border-border-strong"
              }`}
            >
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-label="Not done" />
              )}
              <span>
                <span className={`block font-medium ${s.done ? "text-text-secondary line-through" : "text-text-primary"}`}>{s.title}</span>
                <span className="block text-xs text-text-muted">{s.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
