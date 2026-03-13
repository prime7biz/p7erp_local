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
        <h2 className="text-xl font-bold text-gray-900">Cheque Templates</h2>
        <p className="text-sm text-gray-600">
          Manage cheque print templates for payment vouchers.
        </p>
      </div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No cheque templates yet. This feature will be available in a future release.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="py-2 px-4">Name</th>
                <th className="py-2 px-4">Default</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-4 font-medium text-gray-900">{r.name}</td>
                  <td className="py-2 px-4 text-gray-700">{r.is_default ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
