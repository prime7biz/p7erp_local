import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cancelTenantSubscription, listSubscriptions, putTenantSubscription } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/context/ToastContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";

export function SubscriptionsPage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const manage = can("billing.manage_billing");

  const [items, setItems] = useState<{ id: number; tenant_id: number; plan_id: number; status: string; billing_cycle: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ tenantId: string; planId: string } | null>(null);

  function load() {
    setErr(null);
    listSubscriptions()
      .then((r) => setItems(r.items))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Tenant subscription assignments."
        actions={
          manage ? (
            <button
              type="button"
              onClick={() => setAssign({ tenantId: "", planId: "" })}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Assign plan
            </button>
          ) : undefined
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (s) => s.id },
          {
            key: "tenant",
            header: "Tenant",
            cell: (s) => (
              <Link className="text-indigo-600 hover:underline" to={`/tenants/${s.tenant_id}`}>
                {s.tenant_id}
              </Link>
            ),
          },
          { key: "plan", header: "Plan ID", cell: (s) => s.plan_id },
          { key: "st", header: "Status", cell: (s) => s.status },
          { key: "bc", header: "Cycle", cell: (s) => s.billing_cycle },
          {
            key: "a",
            header: "",
            cell: (s) =>
              manage ? (
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={async () => {
                    try {
                      await cancelTenantSubscription(s.tenant_id);
                      showToast("Cancelled", "success");
                      load();
                    } catch (e: unknown) {
                      showToast(e instanceof Error ? e.message : "Cancel failed", "error");
                    }
                  }}
                >
                  Cancel
                </button>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
          },
        ]}
        rows={items}
        rowKey={(s) => s.id}
        emptyMessage="No subscriptions."
      />

      <Modal open={!!assign} onClose={() => setAssign(null)} title="Assign subscription" size="sm">
        {assign && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const tid = parseInt(assign.tenantId, 10);
              const pid = parseInt(assign.planId, 10);
              if (!tid || !pid) {
                showToast("Enter tenant ID and plan ID", "error");
                return;
              }
              try {
                await putTenantSubscription(tid, { plan_id: pid, status: "active" });
                showToast("Saved", "success");
                setAssign(null);
                load();
              } catch (err: unknown) {
                showToast(err instanceof Error ? err.message : "Save failed", "error");
              }
            }}
          >
            <div>
              <label className="block text-xs text-slate-500">Tenant ID</label>
              <input className="w-full rounded border px-2 py-1 text-sm" value={assign.tenantId} onChange={(e) => setAssign({ ...assign, tenantId: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-500">Plan ID</label>
              <input className="w-full rounded border px-2 py-1 text-sm" value={assign.planId} onChange={(e) => setAssign({ ...assign, planId: e.target.value })} />
            </div>
            <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2 text-sm text-white">Save</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
