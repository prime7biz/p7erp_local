import { useEffect, useState } from "react";
import {
  api,
  type SettingsRoleResponse,
  type SettingsUserCreate,
  type SettingsUserUpdate,
  type StaffInviteRowResponse,
  type UserWithRoleResponse,
} from "@/api/client";

function userLabel(u: UserWithRoleResponse): string {
  return (u.username && u.username.trim()) || u.email;
}

export function UsersPage() {
  const [users, setUsers] = useState<UserWithRoleResponse[]>([]);
  const [roles, setRoles] = useState<SettingsRoleResponse[]>([]);
  const [invitations, setInvitations] = useState<StaffInviteRowResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    role_id: 0,
  });
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
      const [userRows, roleRows, inviteRows] = await Promise.all([
        api.settingsListUsers(),
        api.settingsListRoles(),
        api.settingsListStaffInvitations().catch(() => [] as StaffInviteRowResponse[]),
      ]);
      setUsers(userRows);
      setRoles(roleRows);
      setInvitations(inviteRows);
      setForm((prev) => ({ ...prev, role_id: prev.role_id || roleRows[0]?.id || 0 }));
      setInviteForm((prev) => ({ ...prev, role_id: prev.role_id || roleRows[0]?.id || 0 }));
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
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          is_active: form.is_active,
        };
        if (form.username.trim()) data.username = form.username.trim();
        if (form.password.trim()) data.password = form.password;
        await api.settingsUpdateUser(editingId, data);
        setSuccess("User updated.");
      } else {
        const data: SettingsUserCreate = {
          role_id: form.role_id,
          email: form.email,
          password: form.password,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          is_active: form.is_active,
        };
        if (form.username.trim()) data.username = form.username.trim();
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
      username: u.username ?? "",
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
      setSuccess(`User "${userLabel(u)}" deactivated.`);
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
      setSuccess(`User "${userLabel(u)}" activated.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate user");
    }
  };

  const handleDelete = async (u: UserWithRoleResponse) => {
    if (!window.confirm(`Delete user "${userLabel(u)}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.settingsDeleteUser(u.id);
      setSuccess(`User "${userLabel(u)}" deleted.`);
      if (editingId === u.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.settingsInviteStaff({
        email: inviteForm.email,
        first_name: inviteForm.first_name || undefined,
        last_name: inviteForm.last_name || undefined,
        role_id: inviteForm.role_id,
      });
      if (res.invite_token_plain) {
        window.alert(
          `Invitation sent (dev token copy):\n\n${res.invite_token_plain}\n\nAccept URL: ${window.location.origin}/accept-invite?token=${encodeURIComponent(res.invite_token_plain)}`,
        );
      }
      setSuccess("Invitation sent.");
      setInviteOpen(false);
      setInviteForm({
        email: "",
        first_name: "",
        last_name: "",
        role_id: roles[0]?.id || 0,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send invitation");
    } finally {
      setInviteSaving(false);
    }
  };

  const handleResendInvite = async (inv: StaffInviteRowResponse) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await api.settingsInviteStaff({
        email: inv.email,
        first_name: inv.first_name ?? undefined,
        last_name: inv.last_name ?? undefined,
        role_id: inv.role_id,
      });
      if (res.invite_token_plain) {
        window.alert(
          `New invitation (dev token):\n\n${res.invite_token_plain}\n\nAccept URL: ${window.location.origin}/accept-invite?token=${encodeURIComponent(res.invite_token_plain)}`,
        );
      }
      setSuccess("Invitation resent.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resend invitation");
    }
  };

  const handleCancelInvite = async (inv: StaffInviteRowResponse) => {
    if (!window.confirm(`Cancel invitation for ${inv.email}?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.settingsCancelStaffInvitation(inv.id);
      setSuccess("Invitation cancelled.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel invitation");
    }
  };

  const selectedRoleForInvite = roles.find((r) => r.id === inviteForm.role_id);

  if (loading) return <p>Loading users...</p>;
  if (roles.length === 0) return <p style={{ color: "#dc2626" }}>No roles found. Create a role first.</p>;

  return (
    <div className="space-y-4">
      <h1 style={{ marginTop: 0 }}>Users</h1>

      {(error || success) && (
        <div className="space-y-2">
          {error && (
            <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
              {success}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setInviteOpen(true);
            setInviteForm((prev) => ({ ...prev, role_id: prev.role_id || roles[0]?.id || 0 }));
          }}
          className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-subtle"
        >
          Invite staff
        </button>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-white p-4 space-y-3">
        <h2 className="font-semibold text-text-primary text-sm">{editingId ? "Edit user" : "Create user"}</h2>
        <p className="text-xs text-text-muted">Fields marked with ** are mandatory. Username is optional (auto-generated when blank).</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Email **"
            type="email"
            required
          />
          {editingId ? (
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="rounded border border-border px-3 py-2 text-sm"
              placeholder="Username (optional)"
            />
          ) : (
            <div className="text-xs text-text-muted flex items-center px-1">
              New users sign in with <span className="font-medium mx-1">email</span> + password.
            </div>
          )}
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
              <td style={{ padding: 8 }}>{u.username ?? "—"}</td>
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

      <div className="rounded-xl border border-border bg-white p-4 space-y-3">
        <h2 className="font-semibold text-text-primary text-sm">Pending invitations</h2>
        <p className="text-xs text-text-muted">Staff accept invites at /accept-invite?token=…</p>
        {invitations.length === 0 ? (
          <p className="text-sm text-text-muted">No invitations yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: 8 }}>Email</th>
                <th style={{ padding: 8 }}>Name</th>
                <th style={{ padding: 8 }}>Role</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Expires</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 8 }}>{inv.email}</td>
                  <td style={{ padding: 8 }}>{[inv.first_name, inv.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td style={{ padding: 8 }}>{inv.role_name}</td>
                  <td style={{ padding: 8 }}>{inv.status}</td>
                  <td style={{ padding: 8 }}>{new Date(inv.expires_at).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>
                    <div className="flex flex-wrap gap-2">
                      {inv.status === "pending" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleResendInvite(inv)}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCancelInvite(inv)}
                            className="rounded-lg border border-border px-2.5 py-1 text-xs text-status-danger-foreground hover:bg-status-danger-subtle"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {inviteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setInviteOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <h2 id="invite-title" className="text-lg font-semibold text-text-primary">
              Invite staff
            </h2>
            <p className="text-xs text-text-muted mt-1">We email a secure link to set their password.</p>
            <form onSubmit={handleInviteSubmit} className="mt-4 space-y-3">
              <input
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded border border-border px-3 py-2 text-sm"
                placeholder="Email **"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={inviteForm.first_name}
                  onChange={(e) => setInviteForm((p) => ({ ...p, first_name: e.target.value }))}
                  className="rounded border border-border px-3 py-2 text-sm"
                  placeholder="First name"
                />
                <input
                  value={inviteForm.last_name}
                  onChange={(e) => setInviteForm((p) => ({ ...p, last_name: e.target.value }))}
                  className="rounded border border-border px-3 py-2 text-sm"
                  placeholder="Last name"
                />
              </div>
              <select
                required
                value={inviteForm.role_id}
                onChange={(e) => setInviteForm((p) => ({ ...p, role_id: Number(e.target.value) }))}
                className="w-full rounded border border-border px-3 py-2 text-sm"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.display_name}
                  </option>
                ))}
              </select>
              {selectedRoleForInvite ? (
                <p className="text-xs text-text-muted rounded border border-border bg-surface-subtle p-2 max-h-24 overflow-auto">
                  Role permissions preview: {Object.keys(selectedRoleForInvite.permissions || {}).length} keys set (edit role for
                  details).
                </p>
              ) : null}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={inviteSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {inviteSaving ? "Sending…" : "Send invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
