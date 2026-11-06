import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HrSettings, type HrWeekday } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

const PREFIX = "/app/hr";

const WEEKDAYS: { value: HrWeekday; label: string }[] = [
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
];

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function HrSettingsPage() {
  const [settings, setSettings] = useState<HrSettings | null>(null);
  const [weekend, setWeekend] = useState<HrWeekday[]>([]);
  const [otEnabled, setOtEnabled] = useState(false);
  const [hoursPerMonth, setHoursPerMonth] = useState("208");
  const [multiplier, setMultiplier] = useState("2");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<"weekend" | "overtime" | null>(null);

  const apply = (s: HrSettings) => {
    setSettings(s);
    setWeekend(s.weekend_days);
    setOtEnabled(s.ot_from_salary_enabled);
    setHoursPerMonth(String(s.ot_hours_per_month));
    setMultiplier(String(s.ot_multiplier));
  };

  const load = useCallback(async () => {
    try {
      apply(await api.getHrSettings());
    } catch (err) {
      logApiError("hr.settings.load", err);
      setError(errorText(err, "Could not load HR settings"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDay = (day: HrWeekday) => {
    setWeekend((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  };

  const saveWeekend = async () => {
    setError("");
    setMessage("");
    if (weekend.length === 0) {
      setError("Choose at least one weekend day");
      return;
    }
    if (weekend.length === WEEKDAYS.length) {
      setError("At least one day of the week must be a working day");
      return;
    }
    setSaving("weekend");
    try {
      apply(await api.updateHrSettings({ weekend_days: weekend }));
      setMessage("Weekend days saved");
    } catch (err) {
      logApiError("hr.settings.saveWeekend", err);
      setError(errorText(err, "Save failed"));
    } finally {
      setSaving(null);
    }
  };

  const saveOvertime = async () => {
    setError("");
    setMessage("");
    const hours = Number(hoursPerMonth);
    const mult = Number(multiplier);
    if (!Number.isFinite(hours) || hours < 50 || hours > 400) {
      setError("Hours per month must be between 50 and 400");
      return;
    }
    if (!Number.isFinite(mult) || mult <= 0 || mult > 5) {
      setError("Overtime multiplier must be more than 0 and at most 5");
      return;
    }
    setSaving("overtime");
    try {
      apply(
        await api.updateHrSettings({ ot_from_salary_enabled: otEnabled, ot_hours_per_month: hours, ot_multiplier: mult }),
      );
      setMessage("Overtime settings saved");
    } catch (err) {
      logApiError("hr.settings.saveOvertime", err);
      setError(errorText(err, "Save failed"));
    } finally {
      setSaving(null);
    }
  };

  const hourly = Number(hoursPerMonth) > 0 ? 20800 / Number(hoursPerMonth) : 0;
  const canEditWeekend = settings?.can_edit_weekend ?? false;
  const canEditOvertime = settings?.can_edit_overtime ?? false;

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="HR Settings"
        description="Company-wide HR rules: weekly holiday and how overtime is paid."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "HR Settings" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {message && <div className="text-sm text-status-success-foreground">{message}</div>}

      {!settings ? (
        <div className="text-sm text-text-muted">Loading...</div>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Weekend (weekly holiday)</h2>
              <p className="text-xs text-text-muted">
                Leave requests do not count these days (or company holidays). Default is Friday.
                {settings.weekend_days_is_default ? " Not saved yet — Friday is used." : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((d) => (
                <label key={d.value} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={weekend.includes(d.value)}
                    disabled={!canEditWeekend}
                    onChange={() => toggleDay(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
            {canEditWeekend ? (
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void saveWeekend()}
                className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving === "weekend" ? "Saving..." : "Save weekend"}
              </button>
            ) : (
              <p className="text-xs text-text-muted">Only a manager / admin or a role with “hr.attendance.manage” can change this.</p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Overtime pay from salary</h2>
              <p className="text-xs text-text-muted">
                When on, payroll auto-calculate pays each approved overtime entry as hours × (monthly base salary ÷ hours
                per month) × multiplier. The multiplier comes from the entry&apos;s overtime rule (weekday / weekend /
                holiday, with its daily hour cap) or, without a rule, from the default below. “Per OT hour” salary
                components then pay 0 so overtime is not paid twice. Payroll runs that were already calculated keep their
                old numbers.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={otEnabled}
                disabled={!canEditOvertime}
                onChange={(e) => setOtEnabled(e.target.checked)}
              />
              Pay overtime from salary
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Hours per month
                <input
                  type="number"
                  min={50}
                  max={400}
                  step="any"
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={hoursPerMonth}
                  disabled={!canEditOvertime}
                  onChange={(e) => setHoursPerMonth(e.target.value)}
                />
                <span className="text-xs text-text-muted">Bangladesh Labour Act: basic ÷ 208.</span>
              </label>
              <label className="block text-sm">
                Default multiplier
                <input
                  type="number"
                  min={0.1}
                  max={5}
                  step="any"
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={multiplier}
                  disabled={!canEditOvertime}
                  onChange={(e) => setMultiplier(e.target.value)}
                />
                <span className="text-xs text-text-muted">Bangladesh: overtime at twice the hourly rate (2).</span>
              </label>
            </div>
            {hourly > 0 && Number(multiplier) > 0 && (
              <p className="text-xs text-text-muted">
                Example: base 20,800 → {hourly.toFixed(2)} per hour → one overtime hour pays{" "}
                {(hourly * Number(multiplier)).toFixed(2)}.
              </p>
            )}
            {canEditOvertime ? (
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void saveOvertime()}
                className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving === "overtime" ? "Saving..." : "Save overtime settings"}
              </button>
            ) : (
              <p className="text-xs text-text-muted">Only a manager / admin or a role with “hr.payroll.manage” can change this.</p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
            <h2 className="text-base font-semibold text-text-primary">Related setup</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <Link to={`${PREFIX}/attendance/devices`} className="underline">
                  Attendance devices
                </Link>{" "}
                — fingerprint / card machines and punch file import
              </li>
              <li>
                <Link to={`${PREFIX}/attendance/overtime-rules`} className="underline">
                  Overtime rules
                </Link>{" "}
                — weekday / weekend / holiday multipliers and daily caps
              </li>
              <li>
                <Link to={`${PREFIX}/attendance/holidays`} className="underline">
                  Holidays
                </Link>
              </li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
