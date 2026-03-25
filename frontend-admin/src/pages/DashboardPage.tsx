import { useEffect, useState } from "react";
import { listTenants, getSystemHealth } from "@/api/client";

export function DashboardPage() {
  const [total, setTotal] = useState<number | null>(null);
  const [health, setHealth] = useState<unknown>(null);

  useEffect(() => {
    listTenants(1)
      .then((r) => setTotal(r.meta?.total ?? 0))
      .catch(() => setTotal(null));
    getSystemHealth()
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Tenants (approx.)</div>
          <div className="text-2xl font-bold">{total ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">System health</div>
          <pre className="text-xs mt-2 overflow-auto max-h-40">{JSON.stringify(health, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
