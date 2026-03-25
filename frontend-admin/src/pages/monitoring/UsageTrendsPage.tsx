import { useEffect, useState } from "react";
import { getMonitoringUsage } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatBytes } from "@/utils/format";

export function UsageTrendsPage() {
  const [items, setItems] = useState<
    { id: number; tenant_id: number; date: string | null; api_calls_count: number; api_errors_count: number; storage_bytes_used: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMonitoringUsage()
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Usage trends" description="Daily rollup across tenants (aggregated)." />
      <DataTable
        columns={[
          { key: "t", header: "Tenant", cell: (r) => r.tenant_id },
          { key: "d", header: "Date", cell: (r) => r.date ?? "—" },
          { key: "a", header: "API calls", cell: (r) => r.api_calls_count },
          { key: "e", header: "Errors", cell: (r) => r.api_errors_count },
          { key: "s", header: "Storage", cell: (r) => formatBytes(Number(r.storage_bytes_used)) },
        ]}
        rows={items}
        rowKey={(r) => r.id}
        emptyMessage="No usage rows."
      />
    </div>
  );
}
