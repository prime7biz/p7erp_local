import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type AccountGroupCreate,
  type AccountGroupResponse,
  type AccountGroupHierarchyNode,
} from "@/api/client";

const NATURES = ["Asset", "Liability", "Income", "Expense", "Equity"] as const;
const NORMAL_BALANCE = ["debit", "credit"] as const;

type ViewMode = "list" | "hierarchy" | "design";

export function AccountGroupsPage() {
  const [rows, setRows] = useState<AccountGroupResponse[]>([]);
  const [hierarchy, setHierarchy] = useState<AccountGroupHierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  const [selectedGroupIdForImpact, setSelectedGroupIdForImpact] = useState<number | null>(null);
  const [form, setForm] = useState<AccountGroupCreate>({
    name: "",
    code: "",
    parent_group_id: null,
    nature: "Asset",
    affects_gross_profit: false,
    is_bank_group: false,
    sort_order: 0,
    is_active: true,
    description: null,
    reporting_code: null,
    default_normal_balance: "debit",
    allow_posting: true,
    is_summary_group: false,
    last_reviewed_at: null,
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.listAccountGroups());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHierarchy() {
    setHierarchyLoading(true);
    try {
      setHierarchy(await api.listAccountGroupsHierarchy());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setHierarchyLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (viewMode === "hierarchy" || viewMode === "design") void loadHierarchy();
  }, [viewMode]);

  const parentOptions = useMemo(
    () =>
      rows
        .filter((r) => r.id !== editingId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [rows, editingId],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!form.name.trim()) throw new Error("Name is required");
      const payload: AccountGroupCreate = {
        ...form,
        code: form.code?.trim() || undefined,
        description: form.description?.trim() || null,
        reporting_code: form.reporting_code?.trim() || null,
        last_reviewed_at: form.last_reviewed_at || null,
      };
      if (editingId) {
        await api.updateAccountGroup(editingId, payload);
      } else {
        await api.createAccountGroup(payload);
      }
      setEditingId(null);
      resetForm();
      await load();
      if (viewMode === "hierarchy" || viewMode === "design") await loadHierarchy();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function resetForm() {
    setForm({
      name: "",
      code: "",
      parent_group_id: null,
      nature: "Asset",
      affects_gross_profit: false,
      is_bank_group: false,
      sort_order: 0,
      is_active: true,
      description: null,
      reporting_code: null,
      default_normal_balance: "debit",
      allow_posting: true,
      is_summary_group: false,
      last_reviewed_at: null,
    });
  }

  function startEdit(row: AccountGroupResponse) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      code: row.code,
      parent_group_id: row.parent_group_id ?? null,
      nature: row.nature,
      affects_gross_profit: row.affects_gross_profit ?? false,
      is_bank_group: row.is_bank_group ?? false,
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active ?? true,
      description: row.description ?? null,
      reporting_code: row.reporting_code ?? null,
      default_normal_balance: (row.default_normal_balance as "debit" | "credit") ?? "debit",
      allow_posting: row.allow_posting ?? true,
      is_summary_group: row.is_summary_group ?? false,
      last_reviewed_at: row.last_reviewed_at ?? null,
    });
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this account group? Child groups must be removed or reparented first.")) return;
    try {
      await api.deleteAccountGroup(id);
      await load();
      if (viewMode === "hierarchy" || viewMode === "design") await loadHierarchy();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function seedDefaults() {
    setError(null);
    try {
      await api.seedAccountGroups();
      await load();
      if (viewMode === "hierarchy" || viewMode === "design") await loadHierarchy();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function reparentGroup(id: number, parentId: number | null, sortOrder: number) {
    setError(null);
    try {
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      await api.updateAccountGroup(id, {
        ...row,
        name: row.name,
        code: row.code,
        nature: row.nature,
        parent_group_id: parentId,
        sort_order: sortOrder,
        affects_gross_profit: row.affects_gross_profit ?? false,
        is_bank_group: row.is_bank_group ?? false,
        is_active: row.is_active ?? true,
        description: row.description ?? null,
        reporting_code: row.reporting_code ?? null,
        default_normal_balance: (row.default_normal_balance as "debit" | "credit") ?? "debit",
        allow_posting: row.allow_posting ?? true,
        is_summary_group: row.is_summary_group ?? false,
        last_reviewed_at: row.last_reviewed_at ?? null,
      });
      await load();
      await loadHierarchy();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Account Groups</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage chart of accounts hierarchy: Group → Type → Main Account. Use Standard form for daily use; Advanced for reporting and governance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void seedDefaults()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Seed default groups
          </button>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(["list", "hierarchy", "design"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                  viewMode === mode ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {mode === "design" ? "Advance design" : mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Form: Standard + Advanced */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-medium text-slate-800">
          {editingId ? "Edit account group" : "Add account group"}
        </h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name *</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="e.g. Current Assets"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Code (optional, else auto)</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="e.g. CA"
                value={form.code ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Nature</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.nature}
                onChange={(e) => setForm((p) => ({ ...p, nature: e.target.value }))}
              >
                {NATURES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Parent group</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.parent_group_id ?? ""}
                onChange={(e) =>
                  setForm((p) => ({ ...p, parent_group_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No parent</option>
                {parentOptions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Sort order</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={form.sort_order ?? 0}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.affects_gross_profit}
                  onChange={(e) => setForm((p) => ({ ...p, affects_gross_profit: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Affects gross profit
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.is_bank_group}
                  onChange={(e) => setForm((p) => ({ ...p, is_bank_group: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Bank group
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Active
              </label>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedForm(!showAdvancedForm)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              {showAdvancedForm ? "− Hide advanced fields" : "+ Show advanced fields"}
            </button>
            {showAdvancedForm && (
              <div className="mt-3 grid gap-4 rounded-lg border border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Audit and documentation note"
                    value={form.description ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Reporting code</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="Statutory / group reporting"
                    value={form.reporting_code ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, reporting_code: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Default normal balance</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={form.default_normal_balance ?? "debit"}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, default_normal_balance: e.target.value as "debit" | "credit" }))
                    }
                  >
                    {NORMAL_BALANCE.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Last reviewed (date)</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    value={form.last_reviewed_at ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, last_reviewed_at: e.target.value || null }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.allow_posting}
                    onChange={(e) => setForm((p) => ({ ...p, allow_posting: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Allow posting to this group
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!form.is_summary_group}
                    onChange={(e) => setForm((p) => ({ ...p, is_summary_group: e.target.checked }))}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Summary group (aggregate only)
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              {editingId ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </section>

      {/* List view */}
      {viewMode === "list" && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Nature</th>
                <th className="px-4 py-3 font-medium">Parent</th>
                <th className="px-4 py-3 font-medium">Flags</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    Loading account groups…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    No account groups yet. Add one above or seed default groups.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono text-slate-700">{r.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.nature}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {rows.find((x) => x.id === r.parent_group_id)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.affects_gross_profit ? "GP " : ""}
                      {r.is_bank_group ? "Bank " : ""}
                      {r.is_active ? "Active" : "Inactive"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(r.id)}
                          className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Hierarchy tree view */}
      {viewMode === "hierarchy" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-slate-800">Group hierarchy (tree)</h2>
          {hierarchyLoading ? (
            <p className="text-slate-500">Loading hierarchy…</p>
          ) : hierarchy.length === 0 ? (
            <p className="text-slate-500">No groups. Add groups or seed defaults.</p>
          ) : (
            <ul className="space-y-0">
              {hierarchy.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  onEdit={(id) => {
                    const r = rows.find((x) => x.id === id);
                    if (r) startEdit(r);
                  }}
                  onDelete={(id) => void remove(id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Advance design view: tree + reporting impact + reparent */}
      {viewMode === "design" && (
        <section className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-medium text-slate-800">Advance design — structure preview</h2>
            <p className="mb-4 text-sm text-slate-500">
              Full Group → Type → Account hierarchy. Use Reparent to move a group; changing nature or reporting code may affect reports (see impact below when a group is selected).
            </p>
            {hierarchyLoading ? (
              <p className="text-slate-500">Loading…</p>
            ) : hierarchy.length === 0 ? (
              <p className="text-slate-500">No groups. Add groups or seed defaults.</p>
            ) : (
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 font-mono text-sm">
                {hierarchy.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    allRows={rows}
                    onEdit={(id) => {
                      const r = rows.find((x) => x.id === id);
                      if (r) startEdit(r);
                    }}
                    onDelete={(id) => void remove(id)}
                    onReparent={(id, parentId, sortOrder) => void reparentGroup(id, parentId, sortOrder)}
                    onViewImpact={(id) => setSelectedGroupIdForImpact(id)}
                    showAdvanced
                    showAccountCount
                  />
                ))}
              </div>
            )}
          </div>
          {selectedGroupIdForImpact != null && (
            <ReportingImpactPanel groupId={selectedGroupIdForImpact} onClose={() => setSelectedGroupIdForImpact(null)} />
          )}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h3 className="text-sm font-medium text-amber-800">Reporting impact</h3>
            <p className="mt-1 text-sm text-amber-700">
              Click a group in the tree to see which reports use it. Account groups feed into Trial Balance, Financial Statements, Group Summary, and Ratio Analysis.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function ReportingImpactPanel({ groupId, onClose }: { groupId: number; onClose: () => void }) {
  const [impact, setImpact] = useState<{ reports: { id: string; label: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    api.getAccountGroupReportingImpact(groupId).then((data) => {
      if (!cancelled) setImpact(data);
    }).catch(() => { if (!cancelled) setImpact({ reports: [] }); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-800">Reports using this group</h3>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700">Close</button>
      </div>
      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      ) : impact?.reports?.length ? (
        <ul className="mt-2 list-inside list-disc text-sm text-slate-600">
          {impact.reports.map((r) => (
            <li key={r.id}>{r.label}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No report mapping found.</p>
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: AccountGroupHierarchyNode;
  depth?: number;
  allRows?: AccountGroupResponse[];
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onReparent?: (id: number, parentId: number | null, sortOrder: number) => void;
  onViewImpact?: (id: number) => void;
  showAccountCount?: boolean;
  showAdvanced?: boolean;
}

function TreeNode({
  node,
  depth = 0,
  allRows = [],
  onEdit,
  onDelete,
  onReparent,
  onViewImpact,
  showAccountCount,
  showAdvanced,
}: TreeNodeProps) {
  const [open, setOpen] = useState(true);
  const [reparentParent, setReparentParent] = useState<string>("");
  const hasChildren = node.children.length > 0;
  const parentOptions = allRows.filter((r) => r.id !== node.id);

  const handleReparent = () => {
    if (!onReparent) return;
    const parentId = reparentParent === "" || reparentParent === "0" ? null : Number(reparentParent);
    onReparent(node.id, parentId, node.sort_order ?? 0);
    setReparentParent("");
  };

  return (
    <li className="list-none">
      <div
        className="flex flex-wrap items-center gap-2 py-1.5 pr-2"
        style={{ paddingLeft: depth * 20 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-slate-400 hover:text-slate-600"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-medium text-slate-800">{node.name}</span>
        <span className="text-slate-500">({node.code})</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{node.nature}</span>
        {showAdvanced && node.reporting_code && (
          <span className="text-xs text-slate-500">Rpt: {node.reporting_code}</span>
        )}
        {showAdvanced && node.allow_posting === false && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">No posting</span>
        )}
        {showAdvanced && node.is_summary_group && (
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">Summary</span>
        )}
        {showAdvanced && node.last_reviewed_at && (
          <span className="text-xs text-slate-400">Reviewed: {node.last_reviewed_at}</span>
        )}
        {showAccountCount && (
          <span className="text-xs text-slate-400">{node.account_count} account(s)</span>
        )}
        {!node.is_active && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Inactive</span>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          {onReparent && (
            <>
              <select
                value={reparentParent}
                onChange={(e) => setReparentParent(e.target.value)}
                className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
              >
                <option value="">— Reparent —</option>
                <option value="0">Root (no parent)</option>
                {parentOptions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleReparent}
                disabled={reparentParent === ""}
                className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Move
              </button>
            </>
          )}
          {onViewImpact && (
            <button
              type="button"
              onClick={() => onViewImpact(node.id)}
              className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              View impact
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(node.id)}
            className="rounded px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      </div>
      {open && hasChildren && (
        <ul className="ml-2 space-y-0 border-l border-slate-200">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              allRows={allRows}
              onEdit={onEdit}
              onDelete={onDelete}
              onReparent={onReparent}
              onViewImpact={onViewImpact}
              showAccountCount={showAccountCount}
              showAdvanced={showAdvanced}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
