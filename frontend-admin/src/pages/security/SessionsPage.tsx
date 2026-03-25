import { useEffect, useState } from "react";
import { listAdminSessions, revokeAdminSession } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/utils/format";

export function SessionsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<
    { id: number; admin_id: number; ip_address: string | null; created_at: string | null; expires_at: string | null; revoked_at: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  function load() {
    listAdminSessions(1, 200)
      .then((r) => setItems(r.items))
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Admin sessions" description="Active platform admin JWT sessions (revoke to sign out)." />
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (s) => s.id },
          { key: "a", header: "Admin", cell: (s) => s.admin_id },
          { key: "ip", header: "IP", cell: (s) => s.ip_address ?? "—" },
          { key: "c", header: "Created", cell: (s) => formatDateTime(s.created_at) },
          { key: "e", header: "Expires", cell: (s) => formatDateTime(s.expires_at) },
          {
            key: "r",
            header: "Revoked",
            cell: (s) => (s.revoked_at ? formatDateTime(s.revoked_at) : "—"),
          },
          {
            key: "x",
            header: "",
            cell: (s) =>
              !s.revoked_at ? (
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => revokeAdminSession(s.id).then(() => { showToast("Revoked", "success"); load(); })}
                >
                  Revoke
                </button>
              ) : null,
          },
        ]}
        rows={items}
        rowKey={(s) => s.id}
        emptyMessage="No sessions."
      />
    </div>
  );
}
