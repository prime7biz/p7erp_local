import { Link } from "react-router-dom";
import { listPayments } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatUsd } from "@/utils/format";
import { formatDateTime } from "@/utils/format";
import { useApi } from "@/hooks/useApi";

export function PaymentsPage() {
  const { data, loading, error, refetch } = useApi(() => listPayments().then((r) => r.items));

  const items =
    data ??
    ([] as { id: number; invoice_id: number; tenant_id: number; amount: number; method: string; paid_at: string | null }[]);

  if (loading && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Recorded payments against invoices."
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
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (p) => p.id },
          { key: "inv", header: "Invoice", cell: (p) => p.invoice_id },
          {
            key: "t",
            header: "Tenant",
            cell: (p) => (
              <Link className="text-indigo-600 hover:underline" to={`/tenants/${p.tenant_id}`}>
                {p.tenant_id}
              </Link>
            ),
          },
          { key: "a", header: "Amount", cell: (p) => formatUsd(p.amount) },
          { key: "m", header: "Method", cell: (p) => p.method },
          { key: "d", header: "Paid", cell: (p) => formatDateTime(p.paid_at) },
        ]}
        rows={items}
        rowKey={(p) => p.id}
        emptyMessage="No payments."
      />
    </div>
  );
}
