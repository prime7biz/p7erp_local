import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getTenant, listTenantUsers } from "@/api/client";

export function TenantDetailPage() {
  const { id } = useParams();
  const tid = Number(id);
  const [t, setT] = useState<Record<string, unknown> | null>(null);
  const [users, setUsers] = useState<{ id: number; username: string; email: string }[]>([]);

  useEffect(() => {
    if (!tid) return;
    getTenant(tid).then(setT);
    listTenantUsers(tid).then((r: { items: { id: number; username: string; email: string }[] }) =>
      setUsers(r.items ?? []),
    );
  }, [tid]);

  return (
    <div>
      <Link to="/tenants" className="text-sm text-blue-600 underline">
        ← Tenants
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-4">Tenant {id}</h1>
      <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto mb-6">{JSON.stringify(t, null, 2)}</pre>
      <h2 className="font-medium mb-2">Users</h2>
      <ul className="text-sm space-y-1">
        {users.map((u) => (
          <li key={u.id}>
            {u.username} ({u.email})
          </li>
        ))}
      </ul>
    </div>
  );
}
