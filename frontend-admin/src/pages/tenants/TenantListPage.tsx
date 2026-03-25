import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listTenants } from "@/api/client";

export function TenantListPage() {
  const [items, setItems] = useState<{ id: number; name: string; company_code: string | null }[]>([]);
  useEffect(() => {
    listTenants(1).then((r) => setItems((r.items as { id: number; name: string; company_code: string | null }[]) ?? []));
  }, []);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Tenants</h1>
      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{t.id}</td>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2">{t.company_code ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link className="text-blue-600 underline" to={`/tenants/${t.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
