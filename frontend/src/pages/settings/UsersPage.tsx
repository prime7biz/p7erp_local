import { useEffect, useState } from "react";
import { api, type UserWithRoleResponse } from "@/api/client";

export function UsersPage() {
  const [users, setUsers] = useState<UserWithRoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listUsers()
      .then(setUsers)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading users…</p>;
  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Users</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Username</th>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Role</th>
            <th style={{ padding: 8 }}>Active</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{u.email}</td>
              <td style={{ padding: 8 }}>{u.username}</td>
              <td style={{ padding: 8 }}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
              <td style={{ padding: 8 }}>{u.role_name}</td>
              <td style={{ padding: 8 }}>{u.is_active ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
