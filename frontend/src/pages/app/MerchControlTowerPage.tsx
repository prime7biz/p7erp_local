import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MerchControlTowerSummaryResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { RefreshCw, ClipboardList, FileText, ShoppingCart, AlertTriangle, Layers, Activity, TrendingUp } from "lucide-react";

function StatCard({
  title,
  value,
  subtitle,
  href,
  severity,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  href: string;
  severity?: "neutral" | "warn" | "danger";
}) {
  const border =
    severity === "danger"
      ? "border-status-danger/30 bg-status-danger-subtle/20"
      : severity === "warn"
        ? "border-status-warning/30 bg-status-warning-subtle/25"
        : "border-border bg-surface-raised";
  return (
    <Link
      to={href}
      className={`block rounded-xl border p-4 shadow-sm transition hover:opacity-95 ${border}`}
    >
      <div className="text-xs font-medium text-text-muted">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{value}</div>
      {subtitle ? <p className="mt-1 text-[11px] text-text-secondary">{subtitle}</p> : null}
    </Link>
  );
}

export function MerchControlTowerPage() {
  const [data, setData] = useState<MerchControlTowerSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getMerchControlTowerSummary();
      setData(res);
    } catch (e) {
      logApiError("MerchControlTowerPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load summary");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generated = data?.generated_at
    ? new Date(data.generated_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : "—";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Merchandising control tower</h1>
          <p className="mt-1 text-sm text-text-secondary">
            One-screen snapshot of open inquiries, quotation risk, commercial drift, BOMs, TNA, and planning pressure.
          </p>
          <p className="mt-1 text-xs text-text-muted">Last updated: {generated}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-primary hover:bg-surface-subtle disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-danger/25 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Inquiries needing action"
            value={data.inquiries_needing_action.count}
            subtitle={
              data.inquiries_needing_action.oldest_date
                ? `Oldest created ${data.inquiries_needing_action.oldest_date}`
                : undefined
            }
            href="/app/inquiries"
            severity={data.inquiries_needing_action.count > 0 ? "warn" : "neutral"}
          />
          <StatCard
            title="Quotations incomplete (costing)"
            value={data.quotations_at_risk.incomplete_count}
            subtitle={`Expiring within 14d: ${data.quotations_at_risk.expiring_soon_count}`}
            href="/app/quotations"
            severity={data.quotations_at_risk.incomplete_count > 0 ? "warn" : "neutral"}
          />
          <StatCard
            title="Orders — commercial drift (scan)"
            value={data.orders_with_drift}
            subtitle="Recent orders with quotation vs snapshot differences (capped scan)."
            href="/app/orders"
            severity={data.orders_with_drift > 0 ? "danger" : "neutral"}
          />
          <StatCard
            title="Pending change requests"
            value={data.pending_change_requests}
            subtitle="Awaiting approval before commercial fields can change."
            href="/app/orders"
            severity={data.pending_change_requests > 0 ? "warn" : "neutral"}
          />
          <StatCard
            title="BOM — draft / submitted"
            value={data.bom_status.draft_count + data.bom_status.submitted_count}
            subtitle={`Approved ${data.bom_status.approved_count} · Frozen ${data.bom_status.frozen_count}`}
            href="/app/bom"
            severity={
              data.bom_status.draft_count + data.bom_status.submitted_count > 0 ? "warn" : "neutral"
            }
          />
          <StatCard
            title="TNA overdue"
            value={data.tna_overdue.count}
            subtitle={`Critical / mandatory: ${data.tna_overdue.critical_count}`}
            href="/app/followup"
            severity={data.tna_overdue.count > 0 ? "danger" : "neutral"}
          />
          <StatCard
            title="Planning risk (delivery ≤ 14d)"
            value={data.planning_risk}
            subtitle="Orders not yet shipped with near-term delivery date."
            href="/app/merchandising/pipeline"
            severity={data.planning_risk > 0 ? "warn" : "neutral"}
          />
          <StatCard
            title="Samples pending"
            value={data.sample_pending}
            subtitle="Requested, in progress, or submitted (merch samples)."
            href="/app/merchandising/samples"
            severity={data.sample_pending > 0 ? "warn" : "neutral"}
          />
          <StatCard
            title="Samples past target date"
            value={data.sample_overdue_target}
            subtitle="Open merch samples whose target date is before today."
            href="/app/merchandising/samples"
            severity={data.sample_overdue_target > 0 ? "danger" : "neutral"}
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface-subtle/40 p-4 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">Quick links</p>
        <ul className="mt-2 flex flex-wrap gap-3 text-xs">
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/inquiries">
              <ClipboardList className="h-3.5 w-3.5" /> Inquiries
            </Link>
          </li>
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/quotations">
              <FileText className="h-3.5 w-3.5" /> Quotations
            </Link>
          </li>
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/orders">
              <ShoppingCart className="h-3.5 w-3.5" /> Orders
            </Link>
          </li>
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/merchandising/alerts">
              <AlertTriangle className="h-3.5 w-3.5" /> Alerts
            </Link>
          </li>
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/bom">
              <Layers className="h-3.5 w-3.5" /> BOM builder
            </Link>
          </li>
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/followup">
              <Activity className="h-3.5 w-3.5" /> TNA / Follow-up
            </Link>
          </li>
          <li>
            <Link className="inline-flex items-center gap-1 text-status-info-foreground hover:underline" to="/app/merchandising/pipeline">
              <TrendingUp className="h-3.5 w-3.5" /> Pipeline
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
