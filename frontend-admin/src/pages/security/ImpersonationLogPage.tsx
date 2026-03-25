import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listImpersonationSessions } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/utils/format";

export function ImpersonationLogPage() {
  const [items, setItems] = useState<
    { id: number; admin_id: number; tenant_id: number; user_id: number; expires_at: string | null; revoked_at: string | null; created_at: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listImpersonationSessions(1, 200)
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Impersonation log" description="Support sessions where an admin issued a tenant JWT." />
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (r) => r.id },
          { key: "a", header: "Admin", cell: (r) => r.admin_id },
          {
            key: "t",
            header: "Tenant",
            cell: (r) => (
              <Link className="text-indigo-600 hover:underline" to={`/tenants/${r.tenant_id}`}>
                {r.tenant_id}
              </Link>
            ),
          },
          { key: "u", header: "User", cell: (r) => r.user_id },
          { key: "c", header: "Created", cell: (r) => formatDateTime(r.created_at) },
          { key: "e", header: "Expires", cell: (r) => formatDateTime(r.expires_at) },
          { key: "r", header: "Revoked", cell: (r) => (r.revoked_at ? formatDateTime(r.revoked_at) : "—") },
        ]}
        rows={items}
        rowKey={(r) => r.id}
        emptyMessage="No impersonation sessions recorded."
      />
    </div>
  );
}
