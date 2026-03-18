import { useEffect, useMemo, useState } from "react";
import { api, type StockGroupCreate, type StockGroupResponse } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, Plus, X, Search } from "lucide-react";

type TreeNode = StockGroupResponse & { children: TreeNode[] };

function buildTree(items: StockGroupResponse[]): TreeNode[] {
  const byId = new Map<number, TreeNode>(
    items.map((i) => [i.id, { ...i, children: [] }])
  );
  const roots: TreeNode[] = [];
  for (const item of items) {
    const node = byId.get(item.id)!;
    if (item.parent_id == null) {
      roots.push(node);
    } else {
      const parent = byId.get(item.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  return roots;
}

type RowWithMeta = StockGroupResponse & { level: number; path: string };

function flattenTreeWithMeta(
  nodes: TreeNode[],
  level: number,
  idToItem: Map<number, StockGroupResponse>
): RowWithMeta[] {
  const result: RowWithMeta[] = [];
  const getPath = (item: StockGroupResponse): string => {
    const parts: string[] = [];
    let cur: StockGroupResponse | undefined = item;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parent_id != null ? idToItem.get(cur.parent_id) : undefined;
    }
    return parts.join(" > ");
  };
  for (const node of nodes) {
    result.push({ ...node, level, path: getPath(node) });
    result.push(...flattenTreeWithMeta(node.children, level + 1, idToItem));
  }
  return result;
}

export function StockGroupsPage() {
  const [items, setItems] = useState<StockGroupResponse[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<StockGroupCreate>({ group_code: "", name: "", parent_id: null });
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<StockGroupResponse | null>(null);
  const [editForm, setEditForm] = useState<StockGroupCreate | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const idToItem = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        i.group_code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q)
    );
  }, [items, search]);

  const tree = useMemo(() => buildTree(filteredItems), [filteredItems]);
  const orderedRows = useMemo(
    () => flattenTreeWithMeta(tree, 0, idToItem),
    [tree, idToItem]
  );

  const load = async () => {
    try {
      setItems(await api.listStockGroups());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock groups");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const closeActions = () => setOpenActionsId(null);
    document.addEventListener("click", closeActions);
    return () => document.removeEventListener("click", closeActions);
  }, []);

  const openEdit = (row: StockGroupResponse) => {
    setEditing(row);
    setEditForm({
      group_code: row.group_code,
      name: row.name,
      parent_id: row.parent_id,
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    try {
      await api.updateStockGroup(editing.id, editForm);
      closeEdit();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update group");
    }
  };

  const deleteGroup = async (row: StockGroupResponse) => {
    const usedAsParent = items.some((i) => i.parent_id === row.id);
    if (usedAsParent) {
      setError("Cannot delete: this group is used as a parent. Remove or reassign children first.");
      return;
    }
    if (!window.confirm(`Delete group "${row.group_code} – ${row.name}"?`)) return;
    try {
      await api.deleteStockGroup(row.id);
      setError("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">Stock Groups</h1>
        <p className="mt-1 text-sm text-text-muted">
          Maintain stock group hierarchy for reporting. Groups can have a parent for tree structure.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4 text-text-muted" />
            Add Stock Group
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await api.createStockGroup(form);
              setForm({ group_code: "", name: "", parent_id: null });
              await load();
            }}
            className="grid grid-cols-1 gap-3 md:grid-cols-4 md:gap-4"
          >
            <input
              className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
              placeholder="Group code *"
              value={form.group_code}
              onChange={(e) => setForm((p) => ({ ...p, group_code: e.target.value }))}
              required
            />
            <input
              className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
              placeholder="Group name *"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
            <select
              className="rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
              value={form.parent_id ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, parent_id: e.target.value ? Number(e.target.value) : null }))
              }
            >
              <option value="">No parent (top level)</option>
              {items.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.group_code} – {row.name}
                </option>
              ))}
            </select>
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Add Group
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">All groups</CardTitle>
              <p className="mt-0.5 text-xs text-text-muted">
                Tree order with level and path. Search by code or name.
              </p>
            </div>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Search by code or name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface-raised py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="border-b border-border bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Name
                  </th>
                  <th className="w-16 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Level
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Path
                  </th>
                  <th className="w-24 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orderedRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">
                      No stock groups yet. Add one using the form above.
                    </td>
                  </tr>
                )}
                {orderedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-subtle/50">
                    <td
                      className="px-4 py-3 text-sm font-medium text-text-primary"
                      style={{ paddingLeft: 16 + row.level * 24 }}
                    >
                      {row.group_code}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.level}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-sm text-text-secondary" title={row.path}>
                      {row.path || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setOpenActionsId((prev) => (prev === row.id ? null : row.id)); }}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === row.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => { openEdit(row); setOpenActionsId(null); }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => { await deleteGroup(row); setOpenActionsId(null); }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
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
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editing && editForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeEdit}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-group-title"
        >
          <Card className="w-full max-w-md rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
              <CardTitle id="edit-group-title" className="text-lg">
                Edit Stock Group
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeEdit}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={saveEdit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Code</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={editForm.group_code}
                    onChange={(e) => setEditForm((p) => p && { ...p, group_code: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Name</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => p && { ...p, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-muted">Parent</label>
                  <select
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    value={editForm.parent_id ?? ""}
                    onChange={(e) =>
                      setEditForm((p) =>
                        p && { ...p, parent_id: e.target.value ? Number(e.target.value) : null }
                      )
                    }
                  >
                    <option value="">No parent</option>
                    {items
                      .filter((i) => i.id !== editing.id)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.group_code} – {i.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={closeEdit}>
                    Cancel
                  </Button>
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
