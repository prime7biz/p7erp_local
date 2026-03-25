import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HrDashboardData } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrDashboardPage() {
  const [data, setData] = useState<HrDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const d = await api.getHrDashboardData();
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = data
    ? [
        { label: "Total employees", value: data.total_employees.toString(), sub: `${data.active_employees} active` },
        { label: "Pending leave", value: data.pending_leave_requests.toString(), sub: "Awaiting approval" },
        { label: "Payroll queue", value: data.pending_payroll_approvals.toString(), sub: "runs finalized" },
        { label: "Open hiring", value: data.open_recruitment_requisitions.toString(), sub: "requisitions" },
        { label: "Today attendance", value: `${data.today_attendance_rate_percent}%`, sub: `${data.today_attendance_entries} entries` },
      ]
    : [];

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="HR Dashboard"
        description="Overview of workforce, attendance, leave, payroll, and hiring."
        breadcrumbs={[{ label: "HR", href: PREFIX }]}
      />
      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {loading ? (
        <div className="text-sm text-text-muted">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-text-muted">{c.label}</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{c.value}</p>
              <p className="text-xs text-text-muted">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">Quick links</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Link className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle" to={`${PREFIX}/employees`}>
            Employees
          </Link>
          <Link className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle" to={`${PREFIX}/leave/requests`}>
            Leave requests
          </Link>
          <Link className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle" to={`${PREFIX}/payroll/approvals`}>
            Payroll approvals
          </Link>
          <Link className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle" to={`${PREFIX}/leave/approvals`}>
            Leave approvals
          </Link>
          <Link className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle" to={`${PREFIX}/reports`}>
            HR reports
          </Link>
          <Link className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle" to={`${PREFIX}/sections`}>
            Sections & lines
          </Link>
        </div>
      </div>
    </div>
  );
}
