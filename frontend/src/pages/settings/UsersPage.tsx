import { useEffect, useMemo, useState } from "react";
import {
  api,
  type LinkableEmployeeRow,
  type SettingsRoleResponse,
  type SettingsUserCreate,
  type SettingsUserUpdate,
  type StaffInviteRowResponse,
  type UserWithRoleResponse,
} from "@/api/client";
import { PasswordFieldInput } from "@/components/auth/PasswordFieldInput";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";

const AUTHORITY_OPTIONS = [
  { value: "CLASS_1", label: "Class 1 — Approval" },
  { value: "CLASS_2", label: "Class 2 — Recommendation" },
  { value: "CLASS_3", label: "Class 3 — Verification" },
  { value: "CLASS_4", label: "Class 4 — Data entry" },
] as const;

const DEFAULT_MODULES = [
  "merch",
  "inventory",
  "production",
  "finance",
  "hr",
  "trade",
  "commercial",
  "facility",
  "settings",
  "reports",
  "ai",
  "business_overview",
] as const;

function userLabel(u: UserWithRoleResponse): string {
  return (u.username && u.username.trim()) || u.email;
}

function classLabel(code: string | null | undefined): string {
  if (!code) return "—";
  if (code === "SUPER") return "Super Admin";
  const hit = AUTHORITY_OPTIONS.find((o) => o.value === code);
  return hit?.label ?? code;
}

type FormState = {
  role_id: number;
  email: string;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  authority_class: string;
  module_grants: string[];
  employee_id: number | null;
  employee_label: string;
  designation: string;
};

const emptyForm = (roleId = 0): FormState => ({
  role_id: roleId,
  email: "",
  username: "",
  password: "",
  first_name: "",
  last_name: "",
  is_active: true,
  authority_class: "CLASS_4",
  module_grants: [],
  employee_id: null,
  employee_label: "",
  designation: "",
});

export function UsersPage() {
  const { me } = useAuth();
  const authorityOn =
    me?.feature_flags?.user_authority_classes_v1 === true || me?.authority_classes_enabled === true;
  const availableModules = me?.available_modules?.length ? me.available_modules : [...DEFAULT_MODULES];

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
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeOptions, setEmployeeOptions] = useState<LinkableEmployeeRow[]>([]);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    role_id: 0,
    authority_class: "CLASS_4",
    module_grants: [] as string[],
  });
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRows, roleRows, inviteRows] = await Promise.all([
        api.settingsListUsers(),
        api.settingsListRoles(),
        api.settingsListStaffInvitations().catch((e) => {
          logApiError("UsersPage.settingsListStaffInvitations", e);
          return [] as StaffInviteRowResponse[];
        }),
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
    void load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (!authorityOn) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void api
        .settingsListLinkableEmployees(employeeSearch)
        .then((rows) => {
          if (!cancelled) setEmployeeOptions(rows);
        })
        .catch((e) => logApiError("UsersPage.linkableEmployees", e));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [authorityOn, employeeSearch]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm(roles[0]?.id || 0));
    setEmployeeSearch("");
  };

  const editingUser = useMemo(
    () => (editingId == null ? null : users.find((u) => u.id === editingId) ?? null),
    [editingId, users],
  );
  const editingLocked = Boolean(editingUser?.is_tenant_super_admin);

  const toggleModule = (code: string, target: "form" | "invite") => {
    if (target === "form") {
      setForm((prev) => {
        const has = prev.module_grants.includes(code);
        return {
          ...prev,
          module_grants: has ? prev.module_grants.filter((m) => m !== code) : [...prev.module_grants, code],
        };
      });
      return;
    }
    setInviteForm((prev) => {
      const has = prev.module_grants.includes(code);
      return {
        ...prev,
        module_grants: has ? prev.module_grants.filter((m) => m !== code) : [...prev.module_grants, code],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLocked) {
      setError("The company Super Admin cannot be edited here.");
      return;
    }
    if (authorityOn && form.module_grants.length === 0) {
      setError("Select at least one module.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId) {
        const data: SettingsUserUpdate = {
          email: form.email,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          is_active: form.is_active,
        };
        if (!authorityOn) data.role_id = form.role_id;
        if (form.username.trim()) data.username = form.username.trim();
        if (form.password.trim()) data.password = form.password;
        if (authorityOn) {
          data.authority_class = form.authority_class;
          data.module_grants = form.module_grants;
          if (form.employee_id) data.employee_id = form.employee_id;
          else if (users.find((u) => u.id === editingId)?.employee_id) data.clear_employee_link = true;
        }
        await api.settingsUpdateUser(editingId, data);
        setSuccess("User updated.");
      } else {
        const data: SettingsUserCreate = {
          email: form.email,
          password: form.password,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          is_active: form.is_active,
        };
        if (!authorityOn) data.role_id = form.role_id;
        if (form.username.trim()) data.username = form.username.trim();
        if (authorityOn) {
          data.authority_class = form.authority_class;
          data.module_grants = form.module_grants;
          if (form.employee_id) data.employee_id = form.employee_id;
        }
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
      authority_class: u.authority_class && u.authority_class !== "SUPER" ? u.authority_class : "CLASS_4",
      module_grants: [...(u.module_grants || [])],
      employee_id: u.employee_id ?? null,
      employee_label: u.employee_label ?? "",
      designation: u.designation ?? "",
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

  const handleSignOutDevices = async (u: UserWithRoleResponse) => {
    if (
      !window.confirm(
        `Sign out "${userLabel(u)}" on every device? Use this for a lost or stolen phone. The account stays active; they can sign in again.`,
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await api.settingsSignOutUserDevices(u.id);
      setSuccess(`"${userLabel(u)}" was signed out on every device.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sign out devices");
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
    if (authorityOn && inviteForm.module_grants.length === 0) {
      setError("Select at least one module for the invitation.");
      return;
    }
    setInviteSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.settingsInviteStaff({
        email: inviteForm.email,
        first_name: inviteForm.first_name || undefined,
        last_name: inviteForm.last_name || undefined,
        role_id: authorityOn ? undefined : inviteForm.role_id,
        authority_class: authorityOn ? inviteForm.authority_class : undefined,
        module_grants: authorityOn ? inviteForm.module_grants : undefined,
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
        authority_class: "CLASS_4",
        module_grants: [],
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
      await api.settingsCancelStaffInvitation(inv.id).catch(() => undefined);
      const res = await api.settingsInviteStaff({
        email: inv.email,
        first_name: inv.first_name ?? undefined,
        last_name: inv.last_name ?? undefined,
        role_id: authorityOn ? undefined : inv.role_id,
        authority_class: authorityOn ? inv.authority_class ?? "CLASS_4" : undefined,
        module_grants: authorityOn ? inv.module_grants ?? [] : undefined,
        employee_id: authorityOn ? inv.employee_id ?? undefined : undefined,
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
  if (!authorityOn && roles.length === 0) {
    return <p style={{ color: "#dc2626" }}>No roles found. Create a role first.</p>;
  }

  const modulePicker = (selected: string[], target: "form" | "invite", disabled = false) => (
    <div className="md:col-span-2 rounded border border-border bg-surface-subtle p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary">Modules **</p>
        <button
          type="button"
          disabled={disabled}
          className="text-xs text-primary underline disabled:opacity-50"
          onClick={() => {
            if (target === "form") setForm((p) => ({ ...p, module_grants: [...availableModules] }));
            else setInviteForm((p) => ({ ...p, module_grants: [...availableModules] }));
          }}
        >
          Select all
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {availableModules.map((code) => (
          <label key={`${target}-${code}`} className="inline-flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              disabled={disabled}
              checked={selected.includes(code)}
              onChange={() => toggleModule(code, target)}
            />
            {code}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 style={{ marginTop: 0 }}>Users</h1>
      {authorityOn ? (
        <p className="text-sm text-text-muted">
          Authority classes are on. Choose Class and modules for each user. Super Admin is protected and cannot be
          edited here.
        </p>
      ) : null}

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
        {editingLocked ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This is the protected Super Admin. Credentials can only be recovered through platform break-glass.
          </div>
        ) : null}
        <p className="text-xs text-text-muted">Fields marked with ** are mandatory.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Email **"
            type="email"
            required
            disabled={editingLocked}
          />
          {editingId ? (
            <input
              value={form.username}
              onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
              className="rounded border border-border px-3 py-2 text-sm"
              placeholder="Username (optional)"
              disabled={editingLocked}
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
            disabled={editingLocked}
          />
          <input
            value={form.last_name}
            onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Last name"
            disabled={editingLocked}
          />

          {authorityOn ? (
            <>
              <select
                value={form.authority_class}
                onChange={(e) => setForm((prev) => ({ ...prev, authority_class: e.target.value }))}
                className="rounded border border-border px-3 py-2 text-sm"
                required
                disabled={editingLocked}
              >
                {AUTHORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="space-y-1">
                <input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full rounded border border-border px-3 py-2 text-sm"
                  placeholder="Search employee to link"
                  disabled={editingLocked}
                />
                {form.employee_label || form.designation ? (
                  <p className="text-xs text-text-muted">
                    Linked: {form.employee_label || "employee"}
                    {form.designation ? ` · Designation: ${form.designation}` : ""}
                  </p>
                ) : null}
                {employeeOptions.length > 0 ? (
                  <select
                    className="w-full rounded border border-border px-3 py-2 text-sm"
                    value={form.employee_id ?? ""}
                    disabled={editingLocked}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const row = employeeOptions.find((r) => r.id === id);
                      setForm((prev) => ({
                        ...prev,
                        employee_id: id,
                        employee_label: row?.label ?? "",
                        designation: row?.designation_title ?? "",
                      }));
                    }}
                  >
                    <option value="">No employee link</option>
                    {employeeOptions.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              {modulePicker(form.module_grants, "form", editingLocked)}
            </>
          ) : (
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
          )}

          {!editingLocked ? (
            <PasswordFieldInput
              id={`settings-user-password-${editingId ?? "new"}`}
              value={form.password}
              onChange={(next) => setForm((prev) => ({ ...prev, password: next }))}
              placeholder={editingId ? "New password (optional)" : "Password **"}
              required={!editingId}
              autoComplete="new-password"
              showLock={false}
              inputClassName="min-w-0 w-full rounded border border-border py-2 text-sm"
            />
          ) : (
            <p className="text-xs text-text-muted px-1">Password cannot be changed here for Super Admin.</p>
          )}
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            disabled={editingLocked}
          />
          Active user
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || editingLocked}
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

      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>{authorityOn ? "Class" : "Role"}</th>
              {authorityOn ? <th style={{ padding: 8 }}>Modules</th> : null}
              <th style={{ padding: 8 }}>Active</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 8 }}>
                  {u.email}
                  {u.is_tenant_super_admin ? (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                      Super Admin
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: 8 }}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || "-"}</td>
                <td style={{ padding: 8 }}>{authorityOn ? classLabel(u.authority_class) : u.role_name}</td>
                {authorityOn ? (
                  <td style={{ padding: 8 }} className="text-xs text-text-muted">
                    {(u.module_grants || []).join(", ") || "—"}
                  </td>
                ) : null}
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
                      <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
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
                        {!u.is_tenant_super_admin && u.is_active ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionsId(null);
                                void handleSignOutDevices(u);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Sign out devices
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeactivate(u);
                                setOpenActionsId(null);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Deactivate
                            </button>
                          </>
                        ) : null}
                        {!u.is_tenant_super_admin && !u.is_active ? (
                          <button
                            type="button"
                            onClick={() => {
                              void handleActivate(u);
                              setOpenActionsId(null);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Activate
                          </button>
                        ) : null}
                        {!u.is_tenant_super_admin ? (
                          <button
                            type="button"
                            onClick={() => {
                              void handleDelete(u);
                              setOpenActionsId(null);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger-foreground hover:bg-status-danger-subtle"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-white p-4 space-y-3">
        <h2 className="font-semibold text-text-primary text-sm">Pending invitations</h2>
        <p className="text-xs text-text-muted">Staff accept invites at /accept-invite?token=…</p>
        {invitations.length === 0 ? (
          <p className="text-sm text-text-muted">No invitations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: 8 }}>Email</th>
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>{authorityOn ? "Class" : "Role"}</th>
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
                    <td style={{ padding: 8 }}>
                      {authorityOn ? classLabel(inv.authority_class) : inv.role_name}
                    </td>
                    <td style={{ padding: 8 }}>{inv.status}</td>
                    <td style={{ padding: 8 }}>{new Date(inv.expires_at).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        {inv.status === "pending" ? (
                          <div className="flex flex-wrap gap-1">
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
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setInviteOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-white p-6 shadow-xl"
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
              {authorityOn ? (
                <>
                  <select
                    required
                    value={inviteForm.authority_class}
                    onChange={(e) => setInviteForm((p) => ({ ...p, authority_class: e.target.value }))}
                    className="w-full rounded border border-border px-3 py-2 text-sm"
                  >
                    {AUTHORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {modulePicker(inviteForm.module_grants, "invite")}
                </>
              ) : (
                <>
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
                      Role permissions preview: {Object.keys(selectedRoleForInvite.permissions || {}).length} keys set
                      (edit role for details).
                    </p>
                  ) : null}
                </>
              )}
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
