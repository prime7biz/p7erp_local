import { RefreshCw } from "lucide-react";
import {
  getPresetDateRange,
  type DashboardDatePreset,
} from "@/components/dashboard/dashboardRoleVisibility";

const PRESETS: { id: DashboardDatePreset; label: string }[] = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_90_days", label: "Last 90 days" },
];

type HeroStat = {
  label: string;
  value: string;
};

type DashboardHeaderProps = {
  greeting: string;
  firstName: string;
  dateTimeLabel: string;
  lastUpdatedLabel: string;
  activePreset: DashboardDatePreset;
  refreshing?: boolean;
  heroStats?: HeroStat[];
  onRefresh: () => void;
  onRangeChange: (range: { from: string; to: string }, preset: DashboardDatePreset) => void;
};

export function DashboardHeader({
  greeting,
  firstName,
  dateTimeLabel,
  lastUpdatedLabel,
  activePreset,
  refreshing,
  heroStats = [],
  onRefresh,
  onRangeChange,
}: DashboardHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-brand-subtle via-surface-raised to-accent-secondary-subtle p-5 sm:p-6 shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, var(--color-brand-primary) 0, transparent 40%), radial-gradient(circle at 80% 0%, var(--color-accent-secondary) 0, transparent 35%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text-primary">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">{dateTimeLabel}</p>
          <p className="mt-1 text-xs text-text-muted">
            Last updated: {lastUpdatedLabel}
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-text-muted transition-colors hover:bg-state-hover hover:text-brand-primary disabled:opacity-50"
              title="Refresh dashboard"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          {heroStats.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {heroStats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-[5.5rem] rounded-xl border border-white/30 bg-white/70 px-3 py-2 text-center shadow-sm backdrop-blur-sm dark:border-border dark:bg-surface-raised/80"
                >
                  <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{stat.label}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-text-primary">{stat.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-text-muted">Date range</span>
            <div className="inline-flex rounded-lg border border-border bg-surface-subtle/80 p-0.5 backdrop-blur-sm">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onRangeChange(getPresetDateRange(p.id), p.id)}
                  className={`h-9 rounded-md px-3 text-[11px] font-semibold transition-colors ${
                    activePreset === p.id
                      ? "bg-surface-raised text-brand-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
