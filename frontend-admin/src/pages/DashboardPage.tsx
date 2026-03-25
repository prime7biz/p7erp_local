import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getDashboardSummary,
  getSystemHealth,
  getSystemResources,
  listPlatformAudit,
  postDashboardAiAnalyze,
  type DashboardSummaryResponse,
  type SystemHealthResponse,
  type SystemResourcesResponse,
} from "@/api/client";
import type { PlatformAdminAuditItem } from "@/api/client";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBytes, formatDateTime, formatUsd } from "@/utils/format";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { usePolling } from "@/hooks/usePolling";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  Cpu,
  Database,
  DollarSign,
  HardDrive,
  RefreshCw,
  Shield,
  Sparkles,
  Ticket,
  Users,
  Zap,
} from "lucide-react";

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 1000) / 10);
}

function getTimeBasedGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function minutesAgo(from: Date | null, now: Date): string {
  if (!from) return "—";
  const diffMs = now.getTime() - from.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  return `${diffMins} min ago`;
}

function severityFrame(sev: "ok" | "warning" | "critical") {
  if (sev === "critical") return "border-l-4 border-l-red-500 bg-red-50/80";
  if (sev === "warning") return "border-l-4 border-l-amber-500 bg-amber-50/60";
  return "border-l-4 border-l-emerald-500 bg-emerald-50/50";
}

export function DashboardPage() {
  const { can, me } = useAdminAuth();
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [resources, setResources] = useState<SystemResourcesResponse | null>(null);
  const [activity, setActivity] = useState<PlatformAdminAuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ severity: "ok" | "warning" | "critical"; analysis: string; generated_at: string } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [s, h, r] = await Promise.all([getDashboardSummary(), getSystemHealth(), getSystemResources()]);
      setSummary(s);
      setHealth(h);
      setResources(r);
      if (can("monitoring.admin_audit")) {
        const a = await listPlatformAudit(1, 10);
        setActivity(a.items ?? []);
      } else {
        setActivity([]);
      }
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [can]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  usePolling(() => void refresh(), 45_000, true);

  const onAiAnalyze = async () => {
    setAiErr(null);
    setAiLoading(true);
    try {
      const r = await postDashboardAiAnalyze();
      setAiResult(r);
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : "Analysis failed");
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  };

  const disk = health?.disk;
  const usedDiskPct = disk ? pct(disk.used_bytes, disk.total_bytes) : 0;
  const cpuPct = resources?.cpu_percent ?? null;
  const memPct = resources?.memory_percent ?? null;
  const pool = resources?.db_pool;

  const greeting = getTimeBasedGreeting(currentTime.getHours());
  const firstName = me?.username?.split(/@|\s/)[0] ?? "Admin";

  if (loading && !summary && !health) return <LoadingState />;

  return (
    <div className="max-w-7xl mx-auto space-y-6" data-page="platform-admin-dashboard">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {currentTime.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · {currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
            Last updated: {minutesAgo(lastUpdated, currentTime)}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void refresh().finally(() => setLoading(false));
              }}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </p>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-right shrink-0">
          <p className="text-sm font-semibold text-slate-800">Platform operations</p>
          <p className="text-xs text-slate-600 mt-0.5 capitalize">{me?.role?.replace(/_/g, " ") ?? "—"}</p>
        </div>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.12em] mb-3">Key metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-3">
          {[
            {
              label: "Total tenants",
              value: summary?.total_tenants ?? "—",
              href: "/tenants",
              icon: Building2,
              border: "border-l-indigo-500",
              iconBg: "bg-indigo-100",
              iconColor: "text-indigo-700",
              cap: "tenants.view" as const,
            },
            {
              label: "Active / inactive",
              value: summary ? `${summary.active_tenants} / ${summary.inactive_tenants}` : "—",
              href: "/tenants",
              icon: Users,
              border: "border-l-sky-500",
              iconBg: "bg-sky-100",
              iconColor: "text-sky-700",
              cap: "tenants.view" as const,
            },
            {
              label: "MRR (approx.)",
              value: summary != null ? formatUsd(summary.mrr_approx_usd) : "—",
              href: "/billing/revenue",
              icon: DollarSign,
              border: "border-l-emerald-500",
              iconBg: "bg-emerald-100",
              iconColor: "text-emerald-700",
              cap: "billing.view" as const,
            },
            {
              label: "Overdue invoices",
              value: summary?.overdue_invoices ?? "—",
              href: "/billing/invoices",
              icon: AlertTriangle,
              border: "border-l-amber-500",
              iconBg: "bg-amber-100",
              iconColor: "text-amber-800",
              cap: "billing.view" as const,
            },
            {
              label: "Failed backups (24h)",
              value: summary?.failed_backups_24h ?? "—",
              href: "/operations/backups",
              icon: HardDrive,
              border: "border-l-rose-500",
              iconBg: "bg-rose-100",
              iconColor: "text-rose-700",
              cap: "operations.backups" as const,
            },
            {
              label: "Open support tickets",
              value: summary?.open_tickets ?? "—",
              href: "/support/tickets",
              icon: Ticket,
              border: "border-l-violet-500",
              iconBg: "bg-violet-100",
              iconColor: "text-violet-700",
              cap: "support.tickets" as const,
            },
          ]
            .filter((c) => !c.cap || can(c.cap))
            .map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={`rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden border-l-[3px] ${card.border} hover:shadow-md transition-shadow`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-2.5 rounded-xl ${card.iconBg}`}>
                        <Icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      <Link
                        to={card.href}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5"
                      >
                        View <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 tabular-nums">{card.value}</p>
                    <p className="text-xs text-slate-600 mt-1">{card.label}</p>
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.12em] mb-3">Signals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Throttled AI tenants", value: summary?.throttled_ai_tenants, dot: "bg-amber-400" },
            { label: "Active subscriptions", value: summary?.active_subscriptions, dot: "bg-emerald-400" },
            { label: "Pending announcements", value: summary?.pending_announcements, dot: "bg-sky-400" },
            { label: "Platform admins", value: summary?.platform_admin_count, dot: "bg-slate-400" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${stat.dot}`} />
              <div className="min-w-0">
                <p className="text-xl font-bold text-slate-900 tabular-nums">
                  {stat.value !== undefined && stat.value !== null ? stat.value : "—"}
                </p>
                <p className="text-xs text-slate-600 truncate">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-800 mb-3">Platform controls</h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant={summary?.gemini_kill_switch ? "danger" : "success"}>
              Gemini kill switch: {summary?.gemini_kill_switch ? "ON" : "OFF"}
            </StatusBadge>
            <StatusBadge variant={summary?.maintenance_mode ? "warning" : "neutral"}>
              Maintenance: {summary?.maintenance_mode ? "ON" : "OFF"}
            </StatusBadge>
            <StatusBadge variant={health?.gemini_enabled ? "success" : "neutral"}>
              API Gemini: {health?.gemini_enabled ? "Enabled" : "Disabled"}
            </StatusBadge>
            <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-indigo-100 text-indigo-800 capitalize">
              Env: {health?.api_env ?? "—"}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-800 mb-3">Quick actions</h2>
          <div className="flex flex-wrap gap-2">
            {can("tenants.create") && (
              <Link
                to="/tenants/new"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                Create tenant
              </Link>
            )}
            {can("operations.backups") && (
              <Link
                to="/operations/backups"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Backup center
              </Link>
            )}
            {can("support.announcements") && (
              <Link
                to="/support/announcements"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Announcements
              </Link>
            )}
            {can("billing.view") && (
              <Link
                to="/billing/invoices"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Invoices
              </Link>
            )}
            {can("support.tickets") && (
              <Link
                to="/support/tickets"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Support tickets
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-indigo-600" />
            System resources (live)
          </h2>
          {resources?.note && <span className="text-xs text-amber-700">{resources.note}</span>}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span className="flex items-center gap-1">
                <Cpu className="h-3.5 w-3.5" /> CPU
              </span>
              <span className="tabular-nums font-semibold">{cpuPct != null ? `${cpuPct}%` : "—"}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all"
                style={{ width: `${cpuPct != null ? Math.min(100, cpuPct) : 0}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> Memory
              </span>
              <span className="tabular-nums font-semibold">{memPct != null ? `${memPct}%` : "—"}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all"
                style={{ width: `${memPct != null ? Math.min(100, memPct) : 0}%` }}
              />
            </div>
            {resources?.memory_total_bytes != null && resources.memory_used_bytes != null && (
              <p className="text-[11px] text-slate-500 mt-1">
                {formatBytes(resources.memory_used_bytes)} / {formatBytes(resources.memory_total_bytes)}
              </p>
            )}
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span className="flex items-center gap-1">
                <HardDrive className="h-3.5 w-3.5" /> Disk
              </span>
              <span className="tabular-nums font-semibold">{disk ? `${usedDiskPct}%` : "—"}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all"
                style={{ width: `${usedDiskPct}%` }}
              />
            </div>
            {disk && (
              <p className="text-[11px] text-slate-500 mt-1">
                {formatBytes(disk.used_bytes)} used · {formatBytes(disk.free_bytes)} free
              </p>
            )}
          </div>
        </div>
        {pool && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600 border-t border-slate-100 pt-3">
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <Database className="h-3.5 w-3.5" />
              DB pool
            </span>
            <span>size {pool.size}</span>
            <span>in {pool.checked_in}</span>
            <span>out {pool.checked_out}</span>
            <span>overflow {pool.overflow}</span>
          </div>
        )}
      </section>

      <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${aiResult ? severityFrame(aiResult.severity) : ""}`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              AI server health check
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              On-demand Gemini analysis of current metrics (respects global AI budget).
            </p>
          </div>
          <button
            type="button"
            disabled={aiLoading}
            onClick={() => void onAiAnalyze()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {aiLoading ? "Analyzing…" : "Analyze server health"}
          </button>
        </div>
        {aiErr && <p className="text-sm text-red-600 mb-2">{aiErr}</p>}
        {aiResult && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Shield className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-semibold capitalize text-slate-800">Severity: {aiResult.severity}</span>
              <span className="text-slate-500">{aiResult.generated_at}</span>
            </div>
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{aiResult.analysis}</p>
          </div>
        )}
        {!aiResult && !aiErr && !aiLoading && (
          <p className="text-xs text-slate-500">Run an analysis to get a short risk summary and recommendations.</p>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-medium text-slate-800 flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-500" />
            Recent admin activity
          </h2>
          {can("monitoring.admin_audit") && (
            <Link to="/monitoring/admin-audit" className="text-xs font-medium text-indigo-600 hover:underline">
              View all
            </Link>
          )}
        </div>
        {!can("monitoring.admin_audit") ? (
          <EmptyState
            title="Activity hidden"
            description="Your role does not include the platform admin activity log. Ask a super admin if you need visibility."
          />
        ) : activity.length === 0 ? (
          <EmptyState title="No recent actions" description="No platform admin audit rows in this window." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((row) => (
              <li key={row.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap gap-2 items-baseline">
                  <Activity className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono text-xs text-slate-500">#{row.id}</span>
                  <span className="font-medium text-slate-800">{row.action}</span>
                  {row.target_tenant_id != null && (
                    <span className="text-xs text-slate-500">tenant {row.target_tenant_id}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">{formatDateTime(row.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
