import { useEffect, useState } from "react";
import { api, type RoleResponse } from "@/api/client";

export function RolesPage() {
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRoles()
      .then(setRoles)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading roles…</p>;
  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Roles</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Display name</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{r.name}</td>
              <td style={{ padding: 8 }}>{r.display_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
