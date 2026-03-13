import { useEffect, useState } from "react";
import {
  api,
  type SettingsRoleCreate,
  type SettingsRoleResponse,
  type SettingsRoleUpdate,
} from "@/api/client";

const PERMISSION_GROUPS = [
  {
    title: "Merchandising",
    items: [
      { key: "merch.read", label: "Read merchandising" },
      { key: "merch.write", label: "Edit merchandising" },
      { key: "merch.approve", label: "Approve merchandising" },
    ],
  },
  {
    title: "Inventory",
    items: [
      { key: "inventory.read", label: "Read inventory" },
      { key: "inventory.write", label: "Edit inventory" },
      { key: "inventory.approve", label: "Approve inventory" },
    ],
  },
  {
    title: "Finance",
    items: [
      { key: "finance.read", label: "Read finance" },
      { key: "finance.write", label: "Edit finance" },
      { key: "finance.approve", label: "Approve finance" },
    ],
  },
  {
    title: "HR",
    items: [
      { key: "hr.read", label: "Read HR" },
      { key: "hr.write", label: "Edit HR" },
      { key: "hr.approve", label: "Approve HR" },
    ],
  },
  {
    title: "System",
    items: [
      { key: "settings.read", label: "Read settings" },
      { key: "settings.write", label: "Edit settings" },
      { key: "reports.export", label: "Export reports" },
    ],
  },
] as const;

type PermissionMap = Record<string, boolean>;

function createBlankPermissions(): PermissionMap {
  const all: PermissionMap = {};
  for (const group of PERMISSION_GROUPS) {
    for (const item of group.items) {
      all[item.key] = false;
    }
  }
  return all;
}

function toPermissionMap(raw: Record<string, unknown> | undefined): PermissionMap {
  const map = createBlankPermissions();
  if (!raw) return map;
  for (const key of Object.keys(map)) {
    map[key] = Boolean(raw[key]);
  }
  return map;
}

function toApiPermissions(map: PermissionMap): Record<string, unknown> {
  return Object.fromEntries(Object.entries(map).filter(([, enabled]) => enabled));
}

export function RolesPage() {
  const [roles, setRoles] = useState<SettingsRoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    display_name: "",
    permissions: createBlankPermissions(),
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.settingsListRoles();
      setRoles(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingRoleId(null);
    setForm({ name: "", display_name: "", permissions: createBlankPermissions() });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const permissions = toApiPermissions(form.permissions);
      if (editingRoleId) {
        const data: SettingsRoleUpdate = {
          display_name: form.display_name,
          permissions,
        };
        await api.settingsUpdateRole(editingRoleId, data);
        setSuccess("Role updated.");
      } else {
        const data: SettingsRoleCreate = {
          name: form.name,
          display_name: form.display_name,
          permissions,
        };
        await api.settingsCreateRole(data);
        setSuccess("Role created.");
      }
      await load();
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (role: SettingsRoleResponse) => {
    setEditingRoleId(role.id);
    setForm({
      name: role.name,
      display_name: role.display_name,
      permissions: toPermissionMap(role.permissions),
    });
  };

  const handleDelete = async (role: SettingsRoleResponse) => {
    if (!window.confirm(`Delete role "${role.display_name}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.settingsDeleteRole(role.id);
      setSuccess("Role deleted.");
      if (editingRoleId === role.id) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete role");
    }
  };

  const togglePermission = (key: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: checked,
      },
    }));
  };

  if (loading) return <p>Loading roles...</p>;

  return (
    <div className="space-y-4">
      <h1 style={{ marginTop: 0 }}>Roles</h1>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">{editingRoleId ? "Edit role" : "Add role"}</h2>
        <p className="text-xs text-gray-500">Fields marked with ** are mandatory.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="System name (e.g. merch_manager) **"
            required
            disabled={!!editingRoleId}
          />
          <input
            value={form.display_name}
            onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Display name **"
            required
          />
        </div>
        <p className="text-xs text-gray-500">Choose permissions for this role:</p>
        <div className="grid gap-3 md:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.title} className="rounded border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-800">{group.title}</p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => (
                  <label key={item.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.permissions[item.key] ?? false}
                      onChange={(e) => togglePermission(item.key, e.target.checked)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : editingRoleId ? "Update role" : "Create role"}
          </button>
          {editingRoleId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Display name</th>
            <th style={{ padding: 8 }}>Enabled permissions</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{r.name}</td>
              <td style={{ padding: 8 }}>{r.display_name}</td>
              <td style={{ padding: 8 }}>{Object.keys(r.permissions || {}).length}</td>
              <td style={{ padding: 8 }}>
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(r)}
                  className="ml-2 rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  disabled={r.name.toLowerCase() === "admin"}
                  title={r.name.toLowerCase() === "admin" ? "Admin role cannot be deleted" : undefined}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
