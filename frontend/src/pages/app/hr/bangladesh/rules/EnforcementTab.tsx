/** Strict enforcement switches. All OFF by default; turning one on needs an approved rule set covering today. */
import { hrBangladeshApi } from "@/api/hrBangladesh";
import { Badge, Banner, Card, Messages } from "@/components/hr/bd/BdUi";
import { useAction, useLoad } from "@/components/hr/bd/bdHooks";
import { ENFORCEMENT_LABELS } from "@/components/hr/bd/bdLabels";

export function EnforcementTab({ onChanged }: { onChanged: () => void }) {
  const state = useLoad(() => hrBangladeshApi.bdEnforcement(), []);
  const { busy, error, notice, run } = useAction();

  const toggle = (key: string, value: boolean) => {
    const label = ENFORCEMENT_LABELS[key]?.title ?? key;
    const msg = value
      ? `Turn ON ${label} enforcement? Prime7 will start blocking or posting according to the approved rule set.`
      : `Turn OFF ${label} enforcement? Prime7 goes back to preview only for this rule.`;
    if (!window.confirm(msg)) return;
    void run(async () => {
      await hrBangladeshApi.bdSetEnforcement({ [key]: value });
      await state.reload();
      onChanged();
    }, `${label} enforcement ${value ? "on" : "off"}.`);
  };

  const approved = state.data?.approved_rule_set;
  return (
    <div className="space-y-4">
      <Messages error={error || state.error} notice={notice} />
      {state.data && !approved ? (
        <Banner kind="warning">No approved rule set covers today. Approve one on the Rule sets tab before turning enforcement on.</Banner>
      ) : null}
      {approved ? (
        <Banner kind="info">
          Using {approved.code} ({approved.catalog_version}) from {approved.effective_from}.
        </Banner>
      ) : null}
      <Card title="Enforcement" description="Only manager / admin can switch these. Every change is written to the audit log.">
        <div className="space-y-3">
          {Object.entries(state.data?.flags ?? {}).map(([key, on]) => (
            <div key={key} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {ENFORCEMENT_LABELS[key]?.title ?? key} <Badge tone={on ? "green" : "gray"}>{on ? "Enforced" : "Preview only"}</Badge>
                </p>
                <p className="text-xs text-text-muted">{ENFORCEMENT_LABELS[key]?.help}</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={on}
                  checked={on}
                  disabled={busy || (!on && !approved)}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                {on ? "On" : "Off"}
              </label>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
