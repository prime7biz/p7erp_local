import { useEffect, useState } from "react";
import { listRateLimits, putRateLimit } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { Link } from "react-router-dom";

export function RateLimitsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<{ tenant_id: number; requests_per_minute: number; requests_per_hour: number; is_custom: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    listRateLimits()
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
      <PageHeader title="Rate limits" description="Per-tenant API throttling overrides." />
      <DataTable
        columns={[
          {
            key: "t",
            header: "Tenant",
            cell: (r) => (
              <Link className="text-indigo-600 hover:underline" to={`/tenants/${r.tenant_id}`}>
                {r.tenant_id}
              </Link>
            ),
          },
          { key: "rpm", header: "/ min", cell: (r) => r.requests_per_minute },
          { key: "rph", header: "/ hour", cell: (r) => r.requests_per_hour },
          { key: "c", header: "Custom", cell: (r) => (r.is_custom ? "Yes" : "No") },
          {
            key: "e",
            header: "",
            cell: (r) => (
              <button
                type="button"
                className="text-xs text-indigo-600"
                onClick={() => {
                  const rpm = window.prompt("Requests per minute", String(r.requests_per_minute));
                  const rph = window.prompt("Requests per hour", String(r.requests_per_hour));
                  if (rpm == null || rph == null) return;
                  putRateLimit(r.tenant_id, {
                    requests_per_minute: parseInt(rpm, 10),
                    requests_per_hour: parseInt(rph, 10),
                  }).then(() => {
                    showToast("Updated", "success");
                    load();
                  });
                }}
              >
                Edit
              </button>
            ),
          },
        ]}
        rows={items}
        rowKey={(r) => r.tenant_id}
        emptyMessage="No custom rate limits."
      />
    </div>
  );
}
