import { useEffect, useState } from "react";
import { api, type SettingsPricingResponse } from "@/api/client";

export function PricingSettingsPage() {
  const [data, setData] = useState<SettingsPricingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getSettingsPricing()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load pricing"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading subscription...</p>;
  if (error) return <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">{error}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Subscription & Pricing</h2>
        <p className="text-sm text-text-muted">
          Current plan and usage for this tenant.
        </p>
      </div>
      {data && (
        <div className="rounded-xl border border-border bg-surface-raised p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-text-primary">{data.display_name}</span>
            {data.max_users != null && (
              <span className="text-sm text-text-muted">Up to {data.max_users} users</span>
            )}
          </div>
          <ul className="space-y-2 text-sm text-text-secondary">
            {data.features.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-status-success-foreground">✓</span> {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-text-muted">
            Contact support to upgrade or change your plan.
          </p>
        </div>
      )}
    </div>
  );
}
