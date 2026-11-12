import { useEffect, useState } from "react";
import { api, type HrSalaryTdsSwitch } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

/** Settings switch for Bangladesh salary TDS. Saved on its own because it needs a signed approval record. */
export function SalaryTdsSwitch() {
  const [state, setState] = useState<HrSalaryTdsSwitch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getHrSalaryTdsSwitch().then(setState).catch((e) => logApiError("SalaryTdsSwitch.load", e));
  }, []);

  if (!state) return null;

  const change = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setState(await api.setHrSalaryTdsSwitch(enabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the setting");
    } finally {
      setBusy(false);
    }
  };

  const blocked = !state.enabled && !state.can_enable;
  return (
    <div className="text-sm text-text-secondary">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 rounded border-border-strong"
          checked={state.enabled}
          disabled={busy || blocked}
          onChange={(e) => void change(e.target.checked)}
        />
        <span>
          <span className="font-medium text-text-primary">Bangladesh salary income tax (TDS)</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Deducts income tax at source in payroll (July–June projection). Needs the signed tax approval record, gross
            payroll posting and a tax payable account. Saves immediately. Off by default.
          </span>
        </span>
      </label>
      {blocked && (
        <ul className="mt-1 ml-7 list-disc text-xs text-status-warning-foreground" data-testid="tds-switch-problems">
          {state.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 ml-7 text-xs text-status-danger-foreground" role="alert">{error}</p>}
    </div>
  );
}
