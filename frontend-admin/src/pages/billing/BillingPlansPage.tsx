import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBillingPlans, type BillingPlanItem } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatUsd } from "@/utils/format";
import { useAdminAuth } from "@/context/AdminAuthContext";

export function BillingPlansPage() {
  const { can } = useAdminAuth();
  const [items, setItems] = useState<BillingPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listBillingPlans()
      .then((r) => setItems(r.items))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  return (
    <div>
      <PageHeader
        title="Billing plans"
        description="Platform subscription plans, limits, and pricing."
        actions={
          <Link
            to="/billing/plans/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            New plan
          </Link>
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (p) => p.id },
          { key: "name", header: "Name", cell: (p) => p.name },
          { key: "code", header: "Code", cell: (p) => <span className="font-mono text-xs">{p.code ?? "—"}</span> },
          { key: "users", header: "Max users", cell: (p) => p.max_users ?? "—" },
          {
            key: "sup",
            header: "Support",
            cell: (p) => <span className="capitalize text-xs">{p.support_level ?? "—"}</span>,
          },
          { key: "m", header: "Monthly", cell: (p) => formatUsd(p.price_monthly_usd) },
          { key: "y", header: "Yearly", cell: (p) => formatUsd(p.price_yearly_usd ?? 0) },
          {
            key: "a",
            header: "Active",
            cell: (p) => <StatusBadge variant={p.is_active ? "success" : "neutral"}>{p.is_active ? "Yes" : "No"}</StatusBadge>,
          },
          {
            key: "e",
            header: "",
            cell: (p) =>
              can("billing.manage_plans") ? (
                <Link className="text-indigo-600 text-xs font-medium hover:underline" to={`/billing/plans/${p.id}/edit`}>
                  Edit
                </Link>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
          },
        ]}
        rows={items}
        rowKey={(p) => p.id}
        emptyMessage="No plans configured."
      />
    </div>
  );
}
