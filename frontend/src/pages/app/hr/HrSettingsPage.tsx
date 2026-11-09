import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HrSettings, type HrWeekday } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { erpControlFocusClass, listPageErrorClass, listPageRootClass } from "@/components/app/listPageLayout";
import { EmployeeNumberFormatCard } from "@/components/hr/bd/EmployeeNumberFormatCard";
import { KpiCard } from "@/components/hr/HrListParts";
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

const RELATED_SETUP: { label: string; to: string; description: string }[] = [
  { label: "Bangladesh setup", to: `${PREFIX}/bangladesh-setup`, description: "Official RMG wage grades, leave types and labour-law rules in one step" },
  { label: "Attendance devices", to: `${PREFIX}/attendance/devices`, description: "Fingerprint / card machines and punch file import" },
  { label: "Overtime rules", to: `${PREFIX}/attendance/overtime-rules`, description: "Weekday / weekend / holiday multipliers and daily caps" },
  { label: "Holidays", to: `${PREFIX}/attendance/holidays`, description: "Company and public holidays skipped by leave counts" },
  { label: "Shifts", to: `${PREFIX}/attendance/shifts`, description: "Working hours, grace time and night shifts" },
  { label: "Departments", to: `${PREFIX}/departments`, description: "Department masters used on every employee" },
];

const sectionClass = "space-y-4 rounded-lg border border-border bg-surface-raised p-4 scroll-mt-4";
const inputClass = `mt-1 w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary disabled:bg-surface-subtle disabled:text-text-muted ${erpControlFocusClass}`;
const primaryButtonClass = "rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60";
const secondaryButtonClass = "rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-60";

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function dayLabel(day: HrWeekday): string {
  return WEEKDAYS.find((d) => d.value === day)?.label ?? day;
}

function sameDays(a: HrWeekday[], b: HrWeekday[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function UnsavedTag() {
  return (
    <span className="rounded-full bg-status-warning-subtle px-2 py-0.5 text-[11px] font-semibold text-status-warning-foreground">Unsaved changes</span>
  );
}

function ReadOnlyNote({ permission }: { permission: string }) {
  return (
    <p className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-text-muted">
      View only. A manager / admin or a role with “{permission}” can change this.
    </p>
  );
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

  // Each section keeps its own draft: saving or resetting one never discards the other's edits.
  const resetWeekend = (s: HrSettings) => setWeekend(s.weekend_days);
  const resetOvertime = (s: HrSettings) => {
    setOtEnabled(s.ot_from_salary_enabled);
    setHoursPerMonth(String(s.ot_hours_per_month));
    setMultiplier(String(s.ot_multiplier));
  };
  const load = useCallback(async () => {
    try {
      const s = await api.getHrSettings();
      setSettings(s);
      setWeekend(s.weekend_days);
      setOtEnabled(s.ot_from_salary_enabled);
      setHoursPerMonth(String(s.ot_hours_per_month));
      setMultiplier(String(s.ot_multiplier));
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
      const saved = await api.updateHrSettings({ weekend_days: weekend });
      setSettings(saved);
      resetWeekend(saved);
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
      const saved = await api.updateHrSettings({ ot_from_salary_enabled: otEnabled, ot_hours_per_month: hours, ot_multiplier: mult });
      setSettings(saved);
      resetOvertime(saved);
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
  const weekendDirty = settings ? !sameDays(weekend, settings.weekend_days) : false;
  // The default (Friday) is not stored until saved once, so allow saving it unchanged.
  const canSaveWeekend = weekendDirty || Boolean(settings?.weekend_days_is_default);
  const overtimeDirty = settings
    ? otEnabled !== settings.ot_from_salary_enabled ||
      Number(hoursPerMonth) !== settings.ot_hours_per_month ||
      Number(multiplier) !== settings.ot_multiplier
    : false;
  const workingDays = WEEKDAYS.length - weekend.length;

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="HR Settings"
        description="Company-wide HR rules: weekly holiday, overtime pay and employee numbers."
        actions={
          <Link to={PREFIX} className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle">
            HR dashboard
          </Link>
        }
      />

      {error && <div className={listPageErrorClass}>{error}</div>}
      {message && (
        <div role="status" className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {message}
        </div>
      )}

      {!settings ? (
        error ? null : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading HR settings">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface-subtle" />
            ))}
          </div>
        )
      ) : (
        <>
          {/* Current rules at a glance: click to jump to the section */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Weekend"
              value={settings.weekend_days.map(dayLabel).join(", ") || "-"}
              hint={settings.weekend_days_is_default ? "Default (not saved yet)" : `${WEEKDAYS.length - settings.weekend_days.length} working days`}
              onClick={() => scrollToSection("hr-settings-weekend")}
            />
            <KpiCard
              label="Overtime from salary"
              value={settings.ot_from_salary_enabled ? "On" : "Off"}
              hint={settings.ot_from_salary_enabled ? "Paid by payroll auto-calculate" : "Uses OT salary components"}
              onClick={() => scrollToSection("hr-settings-overtime")}
            />
            <KpiCard label="Hours per month" value={settings.ot_hours_per_month} hint="Hourly rate = basic ÷ hours" onClick={() => scrollToSection("hr-settings-overtime")} />
            <KpiCard label="OT multiplier" value={`${settings.ot_multiplier}×`} hint="Default when no OT rule" onClick={() => scrollToSection("hr-settings-overtime")} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <section id="hr-settings-weekend" className={sectionClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">Weekend (weekly holiday)</h2>
                    <p className="text-xs text-text-muted">
                      Leave requests do not count these days (or company holidays). Default is Friday.
                      {settings.weekend_days_is_default ? " Not saved yet — Friday is used." : ""}
                    </p>
                  </div>
                  {weekendDirty && <UnsavedTag />}
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Weekend days">
                  {WEEKDAYS.map((d) => {
                    const on = weekend.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={on}
                        disabled={!canEditWeekend}
                        onClick={() => toggleDay(d.value)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                          on
                            ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                            : "border-border-strong text-text-secondary hover:bg-surface-subtle"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-text-muted">
                  {weekend.length} weekend day(s), {workingDays} working day(s) per week.
                </p>
                {canEditWeekend ? (
                  <div className="flex gap-2">
                    <button type="button" disabled={saving !== null || !canSaveWeekend} onClick={() => void saveWeekend()} className={primaryButtonClass}>
                      {saving === "weekend" ? "Saving..." : "Save weekend"}
                    </button>
                    {weekendDirty && (
                      <button type="button" disabled={saving !== null} onClick={() => resetWeekend(settings)} className={secondaryButtonClass}>
                        Reset
                      </button>
                    )}
                  </div>
                ) : (
                  <ReadOnlyNote permission="hr.attendance.manage" />
                )}
              </section>

              <section id="hr-settings-overtime" className={sectionClass}>
                <div className="flex flex-wrap items-start justify-between gap-2">
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
                  {overtimeDirty && <UnsavedTag />}
                </div>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={otEnabled} disabled={!canEditOvertime} onChange={(e) => setOtEnabled(e.target.checked)} />
                  Pay overtime from salary
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-text-secondary">
                    Hours per month
                    <input
                      type="number"
                      min={50}
                      max={400}
                      step="any"
                      className={inputClass}
                      value={hoursPerMonth}
                      disabled={!canEditOvertime}
                      onChange={(e) => setHoursPerMonth(e.target.value)}
                    />
                    <span className="text-xs text-text-muted">Bangladesh Labour Act: basic ÷ 208.</span>
                  </label>
                  <label className="block text-sm text-text-secondary">
                    Default multiplier
                    <input
                      type="number"
                      min={0.1}
                      max={5}
                      step="any"
                      className={inputClass}
                      value={multiplier}
                      disabled={!canEditOvertime}
                      onChange={(e) => setMultiplier(e.target.value)}
                    />
                    <span className="text-xs text-text-muted">Bangladesh: overtime at twice the hourly rate (2).</span>
                  </label>
                </div>
                {hourly > 0 && Number(multiplier) > 0 && (
                  <div className="rounded-lg bg-surface-subtle px-3 py-2 text-xs text-text-secondary">
                    <span className="font-semibold text-text-primary">Example:</span> basic 20,800 → {hourly.toFixed(2)} per hour → one
                    overtime hour pays <span className="font-semibold text-text-primary">{(hourly * Number(multiplier)).toFixed(2)}</span>.
                  </div>
                )}
                {canEditOvertime ? (
                  <div className="flex gap-2">
                    <button type="button" disabled={saving !== null || !overtimeDirty} onClick={() => void saveOvertime()} className={primaryButtonClass}>
                      {saving === "overtime" ? "Saving..." : "Save overtime settings"}
                    </button>
                    {overtimeDirty && (
                      <button type="button" disabled={saving !== null} onClick={() => resetOvertime(settings)} className={secondaryButtonClass}>
                        Reset
                      </button>
                    )}
                  </div>
                ) : (
                  <ReadOnlyNote permission="hr.payroll.manage" />
                )}
              </section>

              <EmployeeNumberFormatCard />
            </div>

            <aside className="space-y-4">
              <section className="rounded-lg border border-border bg-surface-raised p-4">
                <h2 className="text-base font-semibold text-text-primary">Related setup</h2>
                <ul className="mt-3 space-y-1">
                  {RELATED_SETUP.map((r) => (
                    <li key={r.to}>
                      <Link to={r.to} className="block rounded-lg px-3 py-2 hover:bg-surface-subtle">
                        <span className="text-sm font-medium text-text-primary">{r.label}</span>
                        <span className="block text-xs text-text-muted">{r.description}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
