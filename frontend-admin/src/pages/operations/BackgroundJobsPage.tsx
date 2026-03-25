import { Link } from "react-router-dom";
import { getMaintenanceTasks } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { useApi } from "@/hooks/useApi";

export function BackgroundJobsPage() {
  const { data, loading, error, refetch } = useApi(() => getMaintenanceTasks());

  if (loading && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Background jobs"
        description="Scheduled platform maintenance tasks (cron / job runner). Execution is not triggered from this UI."
        actions={
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => void refetch()}
          >
            Refresh
          </button>
        }
      />
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {data && (
        <>
          <p className="text-sm text-slate-600 mb-6 max-w-3xl">{data.scheduler_note}</p>
          <ul className="space-y-3 max-w-3xl">
            {data.tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">{t.id}</div>
                <p className="text-sm text-slate-600 mt-2">{t.description}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-sm text-slate-500 mt-8">
        Related:{" "}
        <Link to="/operations/backups" className="text-indigo-600 hover:underline">
          Backup center
        </Link>
        {" · "}
        <Link to="/monitoring/usage" className="text-indigo-600 hover:underline">
          Usage trends
        </Link>
        {" · "}
        <Link to="/billing/invoices" className="text-indigo-600 hover:underline">
          Invoices
        </Link>
      </p>
    </div>
  );
}
