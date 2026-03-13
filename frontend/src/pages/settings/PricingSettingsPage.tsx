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
  if (error) return <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Subscription & Pricing</h2>
        <p className="text-sm text-gray-600">
          Current plan and usage for this tenant.
        </p>
      </div>
      {data && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-gray-900">{data.display_name}</span>
            {data.max_users != null && (
              <span className="text-sm text-gray-500">Up to {data.max_users} users</span>
            )}
          </div>
          <ul className="space-y-2 text-sm text-gray-700">
            {data.features.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span> {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-gray-500">
            Contact support to upgrade or change your plan.
          </p>
        </div>
      )}
    </div>
  );
}
