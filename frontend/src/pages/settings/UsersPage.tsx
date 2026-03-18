import { useEffect, useState } from "react";
import {
  api,
  type SettingsRoleResponse,
  type SettingsUserCreate,
  type SettingsUserUpdate,
  type UserWithRoleResponse,
} from "@/api/client";

export function UsersPage() {
  const [users, setUsers] = useState<UserWithRoleResponse[]>([]);
  const [roles, setRoles] = useState<SettingsRoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState({
    role_id: 0,
    email: "",
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRows, roleRows] = await Promise.all([
        api.settingsListUsers(),
        api.settingsListRoles(),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
      setForm((prev) => ({ ...prev, role_id: prev.role_id || roleRows[0]?.id || 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      role_id: roles[0]?.id || 0,
      email: "",
      username: "",
      password: "",
      first_name: "",
      last_name: "",
      is_active: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        const data: SettingsUserUpdate = {
          role_id: form.role_id,
          email: form.email,
          username: form.username,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          is_active: form.is_active,
        };
        if (form.password.trim()) data.password = form.password;
        await api.settingsUpdateUser(editingId, data);
        setSuccess("User updated.");
      } else {
        const data: SettingsUserCreate = {
          role_id: form.role_id,
          email: form.email,
          username: form.username,
          password: form.password,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          is_active: form.is_active,
        };
        await api.settingsCreateUser(data);
        setSuccess("User created.");
      }
      await load();
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save user");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: UserWithRoleResponse) => {
    setEditingId(u.id);
    setForm({
      role_id: u.role_id,
      email: u.email,
      username: u.username,
      password: "",
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      is_active: u.is_active,
    });
  };

  const handleDeactivate = async (u: UserWithRoleResponse) => {
    setError(null);
    setSuccess(null);
    try {
      await api.settingsDeactivateUser(u.id);
      setSuccess(`User "${u.username}" deactivated.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate user");
    }
  };

  const handleActivate = async (u: UserWithRoleResponse) => {
    setError(null);
    setSuccess(null);
    try {
      await api.settingsActivateUser(u.id);
      setSuccess(`User "${u.username}" activated.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate user");
    }
  };

  const handleDelete = async (u: UserWithRoleResponse) => {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.settingsDeleteUser(u.id);
      setSuccess(`User "${u.username}" deleted.`);
      if (editingId === u.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    }
  };

  if (loading) return <p>Loading users...</p>;
  if (roles.length === 0) return <p style={{ color: "#dc2626" }}>No roles found. Create a role first.</p>;

  return (
    <div className="space-y-4">
      <h1 style={{ marginTop: 0 }}>Users</h1>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
          {success && <div className="rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-white p-4 space-y-3">
        <h2 className="font-semibold text-text-primary text-sm">{editingId ? "Edit user" : "Add user"}</h2>
        <p className="text-xs text-text-muted">Fields marked with ** are mandatory.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Email **"
            type="email"
            required
          />
          <input
            value={form.username}
            onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Username **"
            required
          />
          <input
            value={form.first_name}
            onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="First name"
          />
          <input
            value={form.last_name}
            onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Last name"
          />
          <select
            value={form.role_id}
            onChange={(e) => setForm((prev) => ({ ...prev, role_id: Number(e.target.value) }))}
            className="rounded border border-border px-3 py-2 text-sm"
            required
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.display_name}
              </option>
            ))}
          </select>
          <input
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder={editingId ? "New password (optional)" : "Password **"}
            type="password"
            required={!editingId}
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Active user
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : editingId ? "Update user" : "Create user"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Username</th>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Role</th>
            <th style={{ padding: 8 }}>Active</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{u.email}</td>
              <td style={{ padding: 8 }}>{u.username}</td>
              <td style={{ padding: 8 }}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "-"}</td>
              <td style={{ padding: 8 }}>{u.role_name}</td>
              <td style={{ padding: 8 }}>{u.is_active ? "Yes" : "No"}</td>
              <td style={{ padding: 8 }}>
                <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setOpenActionsId(openActionsId === u.id ? null : u.id)}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    Actions
                  </button>
                  {openActionsId === u.id && (
                    <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(u);
                          setOpenActionsId(null);
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Edit
                      </button>
                      {u.is_active ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleDeactivate(u);
                            setOpenActionsId(null);
                          }}
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            handleActivate(u);
                            setOpenActionsId(null);
                          }}
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(u);
                          setOpenActionsId(null);
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger-foreground hover:bg-status-danger-subtle"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
