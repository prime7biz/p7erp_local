import { useEffect, useState } from "react";
import { api, type SettingsChequeTemplateRow } from "@/api/client";

export function ChequeTemplatesPage() {
  const [items, setItems] = useState<SettingsChequeTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getSettingsChequeTemplates()
      .then((data) => setItems(data.items ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load cheque templates"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading cheque templates...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Cheque Templates</h2>
        <p className="text-sm text-text-muted">
          Manage cheque print templates for payment vouchers.
        </p>
      </div>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center text-text-muted">
            No cheque templates yet. This feature will be available in a future release.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
              <tr>
                <th className="py-2 px-4">Name</th>
                <th className="py-2 px-4">Default</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 px-4 font-medium text-text-primary">{r.name}</td>
                  <td className="py-2 px-4 text-text-secondary">{r.is_default ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
