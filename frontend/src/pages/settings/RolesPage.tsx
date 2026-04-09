import { Fragment, useEffect, useMemo, useState } from "react";
import {
  api,
  type GovernanceToggleKeyApi,
  type PermissionsModuleApi,
  type PermissionsRegistryResponse,
  type SettingsRoleCreate,
  type SettingsRoleResponse,
  type SettingsRoleUpdate,
} from "@/api/client";

/** Level columns shown left-to-right when present in the registry. */
const LEVEL_COLUMN_ORDER = ["read", "write", "edit", "approve", "export"] as const;

type PermMap = Record<string, boolean>;

function allKeysFromRegistry(reg: PermissionsRegistryResponse): string[] {
  const keys: string[] = [];
  for (const mod of reg.modules) {
    if (mod.access_key) keys.push(mod.access_key);
    for (const sub of mod.submodules) {
      for (const level of sub.levels) {
        keys.push(`${mod.id}.${sub.id}.${level}`);
      }
    }
  }
  for (const g of reg.governance_toggle_keys ?? []) {
    keys.push(g.key);
  }
  return keys;
}

function blankMap(reg: PermissionsRegistryResponse): PermMap {
  return Object.fromEntries(allKeysFromRegistry(reg).map((k) => [k, false]));
}

function applyLegacyModuleFlat(raw: Record<string, unknown>, mod: PermissionsModuleApi, map: PermMap) {
  const id = mod.id;
  if (raw[`${id}.read`] === true) {
    for (const sub of mod.submodules) {
      if (sub.levels.includes("read")) map[`${id}.${sub.id}.read`] = true;
    }
  }
  if (raw[`${id}.write`] === true) {
    for (const sub of mod.submodules) {
      for (const l of ["read", "write", "edit"] as const) {
        if (sub.levels.includes(l)) map[`${id}.${sub.id}.${l}`] = true;
      }
    }
  }
  if (raw[`${id}.approve`] === true) {
    for (const sub of mod.submodules) {
      if (sub.levels.includes("approve")) map[`${id}.${sub.id}.approve`] = true;
    }
  }
}

function applySpecialLegacy(raw: Record<string, unknown>, map: PermMap) {
  if (raw["reports.export"] === true) map["reports.all.export"] = true;
}

function toPermissionMap(raw: Record<string, unknown> | undefined, reg: PermissionsRegistryResponse): PermMap {
  const map = blankMap(reg);
  if (!raw) return map;
  for (const k of allKeysFromRegistry(reg)) {
    if (raw[k] === true) map[k] = true;
  }
  for (const mod of reg.modules) {
    applyLegacyModuleFlat(raw, mod, map);
  }
  applySpecialLegacy(raw, map);
  if (raw["*"] === true) {
    for (const k of allKeysFromRegistry(reg)) map[k] = true;
  }
  return map;
}

function toApiPermissions(map: PermMap): Record<string, unknown> {
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v));
}

function columnsForRegistry(reg: PermissionsRegistryResponse): readonly string[] {
  const present = new Set<string>();
  for (const m of reg.modules) {
    for (const s of m.submodules) {
      for (const l of s.levels) present.add(l);
    }
  }
  return LEVEL_COLUMN_ORDER.filter((l) => present.has(l));
}

function templateFull(reg: PermissionsRegistryResponse): PermMap {
  const m = blankMap(reg);
  for (const k of Object.keys(m)) m[k] = true;
  return m;
}

function governanceKeys(reg: PermissionsRegistryResponse): string[] {
  return (reg.governance_toggle_keys ?? []).map((g) => g.key);
}

function templateWithGovernance(reg: PermissionsRegistryResponse, on: boolean): Partial<PermMap> {
  const patch: Partial<PermMap> = {};
  for (const k of governanceKeys(reg)) patch[k] = on;
  return patch;
}

function templateViewer(reg: PermissionsRegistryResponse): PermMap {
  const m = blankMap(reg);
  for (const mod of reg.modules) {
    if (mod.access_key) m[mod.access_key] = true;
    for (const sub of mod.submodules) {
      if (sub.levels.includes("read")) m[`${mod.id}.${sub.id}.read`] = true;
    }
  }
  return m;
}

function templateManager(reg: PermissionsRegistryResponse): PermMap {
  const m = templateViewer(reg);
  for (const mod of reg.modules) {
    for (const sub of mod.submodules) {
      for (const l of sub.levels) {
        if (l === "read" || l === "write" || l === "edit") m[`${mod.id}.${sub.id}.${l}`] = true;
      }
    }
  }
  Object.assign(m, templateWithGovernance(reg, true));
  return m;
}

function templateDataEntry(reg: PermissionsRegistryResponse): PermMap {
  const m = blankMap(reg);
  for (const mod of reg.modules) {
    if (mod.access_key) m[mod.access_key] = true;
    for (const sub of mod.submodules) {
      if (sub.levels.includes("read")) m[`${mod.id}.${sub.id}.read`] = true;
      if (sub.levels.includes("write")) m[`${mod.id}.${sub.id}.write`] = true;
    }
  }
  return m;
}

export function RolesPage() {
  const [registry, setRegistry] = useState<PermissionsRegistryResponse | null>(null);
  const [roles, setRoles] = useState<SettingsRoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    name: "",
    display_name: "",
    permissions: {} as PermMap,
  });

  const levelColumns = useMemo(() => (registry ? columnsForRegistry(registry) : []), [registry]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reg, rows] = await Promise.all([api.settingsGetPermissionsRegistry(), api.settingsListRoles()]);
      setRegistry(reg);
      setRoles(rows);
      setForm((prev) => ({
        ...prev,
        permissions: prev.permissions && Object.keys(prev.permissions).length ? prev.permissions : toPermissionMap({}, reg),
      }));
      const exp: Record<string, boolean> = {};
      for (const m of reg.modules) exp[m.id] = true;
      setExpanded(exp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
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

  const editingRole = editingRoleId ? roles.find((r) => r.id === editingRoleId) : null;
  const isAdminRole = (editingRole?.name || "").toLowerCase() === "admin";
  const readOnly = isAdminRole && !!editingRoleId;

  const resetForm = () => {
    setEditingRoleId(null);
    setForm({
      name: "",
      display_name: "",
      permissions: registry ? blankMap(registry) : {},
    });
  };

  const moduleAccessEnabled = (mod: PermissionsModuleApi) => {
    if (!mod.access_key) return true;
    return !!form.permissions[mod.access_key];
  };

  const setModuleAccess = (mod: PermissionsModuleApi, on: boolean) => {
    if (!mod.access_key) return;
    setForm((prev) => {
      const next = { ...prev.permissions, [mod.access_key!]: on };
      if (!on) {
        for (const sub of mod.submodules) {
          for (const level of sub.levels) {
            next[`${mod.id}.${sub.id}.${level}`] = false;
          }
        }
      }
      return { ...prev, permissions: next };
    });
  };

  const toggleGovernanceKey = (permKey: string, on: boolean) => {
    setForm((prev) => ({ ...prev, permissions: { ...prev.permissions, [permKey]: on } }));
  };

  const governanceByGroup = useMemo(() => {
    const m = new Map<string, GovernanceToggleKeyApi[]>();
    for (const g of registry?.governance_toggle_keys ?? []) {
      const grp = g.group || "Other";
      const arr = m.get(grp) ?? [];
      arr.push(g);
      m.set(grp, arr);
    }
    return m;
  }, [registry]);

  const toggleSubLevel = (mod: PermissionsModuleApi, subId: string, level: string, on: boolean) => {
    const key = `${mod.id}.${subId}.${level}`;
    setForm((prev) => {
      const next = { ...prev.permissions, [key]: on };
      if (on && mod.access_key) next[mod.access_key] = true;
      return { ...prev, permissions: next };
    });
  };

  const selectAllSubRow = (mod: PermissionsModuleApi, subId: string, on: boolean) => {
    const sub = mod.submodules.find((s) => s.id === subId);
    if (!sub) return;
    setForm((prev) => {
      const next = { ...prev.permissions };
      for (const level of sub.levels) {
        next[`${mod.id}.${subId}.${level}`] = on;
      }
      if (on && mod.access_key) next[mod.access_key] = true;
      return { ...prev, permissions: next };
    });
  };

  const selectAllColumnInModule = (mod: PermissionsModuleApi, level: string, on: boolean) => {
    setForm((prev) => {
      const next = { ...prev.permissions };
      for (const sub of mod.submodules) {
        if (sub.levels.includes(level)) next[`${mod.id}.${sub.id}.${level}`] = on;
      }
      if (on && mod.access_key) next[mod.access_key] = true;
      return { ...prev, permissions: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!registry) return;
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
    if (!registry) return;
    setEditingRoleId(role.id);
    setForm({
      name: role.name,
      display_name: role.display_name,
      permissions: toPermissionMap(role.permissions as Record<string, unknown>, registry),
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

  const applyTemplate = (key: string) => {
    if (!registry) return;
    let next: PermMap;
    switch (key) {
      case "full":
        next = templateFull(registry);
        break;
      case "manager":
        next = templateManager(registry);
        break;
      case "viewer":
        next = templateViewer(registry);
        break;
      case "data_entry":
        next = templateDataEntry(registry);
        break;
      default:
        return;
    }
    setForm((prev) => ({ ...prev, permissions: next }));
  };

  if (loading || !registry) return <p>Loading roles...</p>;

  return (
    <div className="space-y-4">
      <h1 style={{ marginTop: 0 }}>Roles</h1>

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

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h2 className="font-semibold text-text-primary text-sm">{editingRoleId ? "Edit role" : "Add role"}</h2>
        <p className="text-xs text-text-muted">Fields marked with ** are mandatory.</p>
        {readOnly && (
          <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
            The <strong>admin</strong> role is fully enabled and cannot be edited here.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="System name (e.g. merch_manager) **"
            required
            disabled={!!editingRoleId || readOnly}
          />
          <input
            value={form.display_name}
            onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Display name **"
            required
            disabled={readOnly}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-text-muted">Templates:</label>
          <select
            className="rounded border border-border px-2 py-1.5 text-xs"
            disabled={readOnly}
            defaultValue=""
            onChange={(e) => {
              applyTemplate(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Apply template…</option>
            <option value="full">Full access</option>
            <option value="manager">Manager (no approve)</option>
            <option value="viewer">Viewer (read)</option>
            <option value="data_entry">Data entry (read + write)</option>
          </select>
        </div>

        <p className="text-xs text-text-muted">
          Module <strong>Access</strong> gates the whole module; sub-permissions apply when Access is on.
        </p>

        <div className="overflow-x-auto rounded border border-border bg-white">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-subtle text-left">
                <th className="p-2 font-semibold text-text-primary">Module / area</th>
                <th className="p-2 font-semibold text-text-primary w-16">Access</th>
                {levelColumns.map((lvl) => (
                  <th key={lvl} className="p-2 font-semibold text-text-primary capitalize w-20">
                    <div className="flex flex-col gap-1">
                      <span>{lvl}</span>
                      <button
                        type="button"
                        disabled={readOnly}
                        className="text-[10px] font-normal text-brand-primary hover:underline disabled:opacity-40"
                        onClick={() => {
                          for (const mod of registry.modules) {
                            if (!moduleAccessEnabled(mod)) continue;
                            const anyOff = mod.submodules.some(
                              (s) => s.levels.includes(lvl) && !form.permissions[`${mod.id}.${s.id}.${lvl}`],
                            );
                            selectAllColumnInModule(mod, lvl, anyOff);
                          }
                        }}
                      >
                        All modules
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registry.modules.map((mod) => {
                const open = expanded[mod.id] !== false;
                const accessOn = moduleAccessEnabled(mod);
                return (
                  <Fragment key={mod.id}>
                    <tr className="border-b border-border bg-surface-subtle/80">
                      <td className="p-2">
                        <button
                          type="button"
                          className="font-semibold text-text-primary text-left hover:text-brand-primary"
                          onClick={() => setExpanded((e) => ({ ...e, [mod.id]: !open }))}
                        >
                          {open ? "▼" : "▶"} {mod.label}
                        </button>
                      </td>
                      <td className="p-2 text-center">
                        {mod.access_key ? (
                          <input
                            type="checkbox"
                            disabled={readOnly}
                            checked={!!form.permissions[mod.access_key]}
                            onChange={(e) => setModuleAccess(mod, e.target.checked)}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      {levelColumns.map((lvl) => (
                        <td key={lvl} className="p-2 text-center">
                          <button
                            type="button"
                            disabled={readOnly || !accessOn}
                            className="text-[10px] text-brand-primary hover:underline disabled:opacity-40 disabled:no-underline"
                            onClick={() => {
                              const subsWith = mod.submodules.filter((s) => s.levels.includes(lvl));
                              if (subsWith.length === 0) return;
                              const anyOff = subsWith.some((s) => !form.permissions[`${mod.id}.${s.id}.${lvl}`]);
                              selectAllColumnInModule(mod, lvl, anyOff);
                            }}
                          >
                            All
                          </button>
                        </td>
                      ))}
                    </tr>
                    {open &&
                      mod.submodules.map((sub) => (
                        <tr key={`${mod.id}-${sub.id}`} className="border-b border-border">
                          <td className="p-2 pl-6 text-text-secondary">
                            {sub.label}
                            <button
                              type="button"
                              disabled={readOnly || !accessOn}
                              className="ml-2 text-[10px] text-brand-primary hover:underline disabled:opacity-40"
                              onClick={() => {
                                const anyOff = sub.levels.some((l) => !form.permissions[`${mod.id}.${sub.id}.${l}`]);
                                selectAllSubRow(mod, sub.id, anyOff);
                              }}
                            >
                              Row all
                            </button>
                          </td>
                          <td className="p-2 text-center text-text-muted">—</td>
                          {levelColumns.map((lvl) => {
                            const has = sub.levels.includes(lvl);
                            const key = `${mod.id}.${sub.id}.${lvl}`;
                            return (
                              <td key={lvl} className="p-2 text-center">
                                {has ? (
                                  <input
                                    type="checkbox"
                                    disabled={readOnly || !accessOn}
                                    checked={!!form.permissions[key]}
                                    onChange={(e) => toggleSubLevel(mod, sub.id, lvl, e.target.checked)}
                                  />
                                ) : (
                                  <span className="text-text-muted">·</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {governanceByGroup.size > 0 ? (
          <div className="space-y-2 rounded border border-border bg-surface-subtle p-3">
            <h3 className="text-xs font-semibold text-text-primary">Material control &amp; finance governance</h3>
            <p className="text-[10px] text-text-muted">
              Extra boolean permissions stored on the role. <strong>Admin</strong> and <strong>manager</strong> roles
              always have these powers in the app; enable below for custom roles (e.g. warehouse lead, finance officer).
            </p>
            {[...governanceByGroup.entries()].map(([grp, items]) => (
              <div key={grp}>
                <div className="mb-1 text-[10px] font-medium text-text-secondary">{grp}</div>
                <ul className="space-y-1.5">
                  {items.map((g) => (
                    <li key={g.key} className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        disabled={readOnly}
                        checked={!!form.permissions[g.key]}
                        onChange={(e) => toggleGovernanceKey(g.key, e.target.checked)}
                      />
                      <span>
                        <span className="font-mono text-[10px] text-text-secondary">{g.key}</span>
                        <span className="text-text-muted"> — </span>
                        {g.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || readOnly}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : editingRoleId ? "Update role" : "Create role"}
          </button>
          {editingRoleId && (
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
          <tr className="border-b-2 border-border text-left">
            <th style={{ padding: 8 }}>Name</th>
            <th style={{ padding: 8 }}>Display name</th>
            <th style={{ padding: 8 }}>Enabled permissions</th>
            <th style={{ padding: 8 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td style={{ padding: 8 }}>{r.name}</td>
              <td style={{ padding: 8 }}>{r.display_name}</td>
              <td style={{ padding: 8 }}>{Object.keys(r.permissions || {}).length}</td>
              <td style={{ padding: 8 }}>
                <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    Actions
                  </button>
                  {openActionsId === r.id && (
                    <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(r);
                          setOpenActionsId(null);
                        }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        {r.name.toLowerCase() === "admin" ? "View" : "Edit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleDelete(r);
                          setOpenActionsId(null);
                        }}
                        disabled={r.name.toLowerCase() === "admin"}
                        title={r.name.toLowerCase() === "admin" ? "Admin role cannot be deleted" : undefined}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger-foreground hover:bg-status-danger-subtle disabled:opacity-50 disabled:pointer-events-none"
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
