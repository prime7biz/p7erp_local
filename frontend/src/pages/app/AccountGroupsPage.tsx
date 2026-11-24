import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type AccountGroupCreate,
  type AccountGroupResponse,
  type AccountGroupHierarchyNode,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection } from "@/components/finance/kit";
import { StatementClassField } from "@/components/finance/statements/StatementClassField";
import { classLabel, effectiveStatementClass } from "@/components/finance/statements/statementClassLogic";
import { useStatementsEnabled } from "@/hooks/useFinanceStatements";
import { logApiError } from "@/utils/logApiError";
import { useConfirm } from "@/components/app/useConfirm";

const NATURES = ["Asset", "Liability", "Income", "Expense", "Equity"] as const;
const NORMAL_BALANCE = ["debit", "credit"] as const;

type ViewMode = "list" | "hierarchy" | "design";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

const emptyForm: AccountGroupCreate = {
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
};

export function AccountGroupsPage() {
  const confirm = useConfirm();
  const statementsOn = useStatementsEnabled();
  const [rows, setRows] = useState<AccountGroupResponse[]>([]);
  const [hierarchy, setHierarchy] = useState<AccountGroupHierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  const [selectedGroupIdForImpact, setSelectedGroupIdForImpact] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterNature, setFilterNature] = useState("");
  const [form, setForm] = useState<AccountGroupCreate>({ ...emptyForm });

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
  const parentSelectOptions = useMemo(
    () => parentOptions.map((r) => ({ value: r.id, label: r.name })),
    [parentOptions],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterNature && r.nature !== filterNature) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.code || "").toLowerCase().includes(q);
    });
  }, [rows, search, filterNature]);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
    setShowAdvancedForm(false);
    setForm({ ...emptyForm });
  }

  function openAdd() {
    setEditingId(null);
    setFormError(null);
    setShowAdvancedForm(false);
    setForm({ ...emptyForm });
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
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
      closeDrawer();
      await load();
      if (viewMode === "hierarchy" || viewMode === "design") await loadHierarchy();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: AccountGroupResponse) {
    setEditingId(row.id);
    setFormError(null);
    setShowAdvancedForm(false);
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
    setDrawerOpen(true);
  }

  async function remove(id: number) {
    if (
      !(await confirm({
        title: "Delete this account group? Child groups must be removed or reparented first.",
        danger: true,
      }))
    )
      return;
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
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Account Groups"
        description="Manage chart of accounts hierarchy: Group → Type → Main Account. Use Standard form for daily use; Advanced for reporting and governance."
        actions={
          <>
            <button type="button" onClick={() => void seedDefaults()} className={listPageToolbarButtonClass}>
              Seed default groups
            </button>
            <div className="flex rounded-lg border border-border bg-surface-subtle p-0.5">
              {(["list", "hierarchy", "design"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                    viewMode === mode
                      ? "bg-surface-raised text-text-primary shadow"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {mode === "design" ? "Advance design" : mode}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className={listPageFilterBarClass}>
        {viewMode === "list" ? (
          <>
            <input
              type="search"
              aria-label="Search groups"
              placeholder="Search name or code…"
              className={listPageToolbarInputClass}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter by nature"
              className={listPageToolbarSelectClass}
              value={filterNature}
              onChange={(e) => setFilterNature(e.target.value)}
            >
              <option value="">All natures</option>
              {NATURES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="text-sm text-text-muted">Tree view — use Add group or Actions → Edit to change a group.</span>
        )}
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add group
        </button>
      </div>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      {viewMode === "list" && (
        <div className={listPageTableCardClass}>
          <div className="max-h-[calc(100dvh-18rem)] overflow-auto">
            <table className={`${listTableBaseClass} min-w-[48rem]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass}>Code</th>
                  <th className={listTableThClass}>Name</th>
                  <th className={listTableThClass}>Nature</th>
                  <th className={listTableThClass}>Parent</th>
                  <th className={listTableThClass}>Flags</th>
                  {statementsOn ? <th className={listTableThClass}>Statement class</th> : null}
                  <th className={listTableThClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className={listPageLoadingClass} colSpan={statementsOn ? 7 : 6}>
                      Loading account groups…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className={listPageEmptyClass} colSpan={statementsOn ? 7 : 6}>
                      {rows.length === 0
                        ? "No account groups yet. Add one or seed default groups."
                        : "No groups match your search or nature filter."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.id} className={listTableTrClass}>
                      <td className={`${listTableTdClass} font-mono`}>{r.code}</td>
                      <td className={listTableTdPrimaryClass}>{r.name}</td>
                      <td className={listTableTdClass}>{r.nature}</td>
                      <td className={listTableTdClass}>
                        {rows.find((x) => x.id === r.parent_group_id)?.name ?? "—"}
                      </td>
                      <td className={`${listTableTdClass} text-xs text-text-muted`}>
                        {r.affects_gross_profit ? "GP " : ""}
                        {r.is_bank_group ? "Bank " : ""}
                        {r.is_active ? "Active" : "Inactive"}
                      </td>
                      {statementsOn ? (
                        <td className={`${listTableTdClass} text-xs`}>
                          {(() => {
                            const eff = effectiveStatementClass(rows, r.id);
                            if (!eff.effective)
                              return <span className="text-status-warning-foreground">Unclassified</span>;
                            return (
                              <span className="text-text-secondary">
                                {classLabel(eff.effective)}
                                {eff.inherited ? <span className="text-text-muted"> (inherited)</span> : null}
                              </span>
                            );
                          })()}
                        </td>
                      ) : null}
                      <td className={listTableTdClass}>
                        <RowActionsMenu
                          rowId={r.id}
                          openId={openActionsId}
                          onOpenChange={setOpenActionsId}
                          menuPortal
                          items={[
                            { key: "edit", label: "Edit", onClick: () => startEdit(r) },
                            { key: "delete", label: "Delete", danger: true, onClick: () => void remove(r.id) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading ? (
            <div className="border-t border-border px-4 py-2 text-xs text-text-muted">
              Showing {filteredRows.length} of {rows.length} group{rows.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      )}

      {viewMode === "hierarchy" && (
        <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-text-primary">Group hierarchy (tree)</h2>
          {hierarchyLoading ? (
            <p className="text-text-muted">Loading hierarchy…</p>
          ) : hierarchy.length === 0 ? (
            <p className="text-text-muted">No groups. Add groups or seed defaults.</p>
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
                  openActionsId={openActionsId}
                  onOpenChange={setOpenActionsId}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {viewMode === "design" && (
        <section className="space-y-6">
          <div className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
            <h2 className="mb-2 text-lg font-medium text-text-primary">Advance design — structure preview</h2>
            <p className="mb-4 text-sm text-text-muted">
              Full Group → Type → Account hierarchy. Use Reparent to move a group; changing nature or reporting code may
              affect reports (see impact below when a group is selected).
            </p>
            {hierarchyLoading ? (
              <p className="text-text-muted">Loading…</p>
            ) : hierarchy.length === 0 ? (
              <p className="text-text-muted">No groups. Add groups or seed defaults.</p>
            ) : (
              <div className="rounded-lg border border-border-subtle bg-surface-subtle/50 p-4 font-mono text-sm">
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
                    openActionsId={openActionsId}
                    onOpenChange={setOpenActionsId}
                    showAdvanced
                    showAccountCount
                  />
                ))}
              </div>
            )}
          </div>
          {selectedGroupIdForImpact != null && (
            <ReportingImpactPanel
              groupId={selectedGroupIdForImpact}
              onClose={() => setSelectedGroupIdForImpact(null)}
            />
          )}
          <div className="rounded-xl border border-status-warning/30 bg-status-warning-subtle/50 p-4">
            <h3 className="text-sm font-medium text-status-warning-foreground">Reporting impact</h3>
            <p className="mt-1 text-sm text-status-warning-foreground">
              Click a group in the tree to see which reports use it. Account groups feed into Trial Balance, Financial
              Statements, Group Summary, and Ratio Analysis.
            </p>
          </div>
        </section>
      )}

      <FinanceFormDrawer
        open={drawerOpen}
        title={editingId ? "Edit account group" : "Add group"}
        description="Code is optional (auto-generated when blank). Advanced fields cover reporting and governance."
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel={editingId ? "Update" : "Create"}
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Group details">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ag-name">
            Name *
          </label>
          <input
            id="ag-name"
            className={fieldClass}
            placeholder="e.g. Current Assets"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ag-code">
            Code (optional, else auto)
          </label>
          <input
            id="ag-code"
            className={fieldClass}
            placeholder="e.g. CA"
            value={form.code ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ag-nature">
            Nature
          </label>
          <select
            id="ag-nature"
            className={fieldClass}
            value={form.nature}
            onChange={(e) => setForm((p) => ({ ...p, nature: e.target.value }))}
          >
            {NATURES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ag-parent">
            Parent group
          </label>
          <LocalSearchSelect
            id="ag-parent"
            value={form.parent_group_id ?? ""}
            options={parentSelectOptions}
            onChange={(next) =>
              setForm((p) => ({ ...p, parent_group_id: next === "" ? null : Number(next) }))
            }
            placeholder="No parent"
            allowClear
            aria-label="Parent group"
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ag-sort">
            Sort order
          </label>
          <input
            id="ag-sort"
            type="number"
            className={fieldClass}
            value={form.sort_order ?? 0}
            onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) || 0 }))}
          />
        </div>
        <div className="flex flex-wrap gap-4 rounded-lg border border-border px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.affects_gross_profit}
              onChange={(e) => setForm((p) => ({ ...p, affects_gross_profit: e.target.checked }))}
            />
            Affects gross profit
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_bank_group}
              onChange={(e) => setForm((p) => ({ ...p, is_bank_group: e.target.checked }))}
            />
            Bank group
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <button
          type="button"
          className="text-sm text-brand-primary hover:underline"
          onClick={() => setShowAdvancedForm((a) => !a)}
        >
          {showAdvancedForm ? "Hide advanced fields" : "Show advanced fields"}
        </button>
        {showAdvancedForm ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface-subtle/50 p-3">
            <div className="space-y-1">
              <label className={labelClass} htmlFor="ag-desc">
                Description
              </label>
              <input
                id="ag-desc"
                className={fieldClass}
                placeholder="Audit and documentation note"
                value={form.description ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="ag-reporting">
                Reporting code
              </label>
              <input
                id="ag-reporting"
                className={fieldClass}
                placeholder="Statutory / group reporting"
                value={form.reporting_code ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, reporting_code: e.target.value || null }))}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="ag-balance">
                Default normal balance
              </label>
              <select
                id="ag-balance"
                className={fieldClass}
                value={form.default_normal_balance ?? "debit"}
                onChange={(e) =>
                  setForm((p) => ({ ...p, default_normal_balance: e.target.value as "debit" | "credit" }))
                }
              >
                {NORMAL_BALANCE.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="ag-reviewed">
                Last reviewed (date)
              </label>
              <input
                id="ag-reviewed"
                type="date"
                className={fieldClass}
                value={form.last_reviewed_at ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, last_reviewed_at: e.target.value || null }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.allow_posting}
                onChange={(e) => setForm((p) => ({ ...p, allow_posting: e.target.checked }))}
              />
              Allow posting to this group
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.is_summary_group}
                onChange={(e) => setForm((p) => ({ ...p, is_summary_group: e.target.checked }))}
              />
              Summary group (aggregate only)
            </label>
          </div>
        ) : null}
        {statementsOn ? (
          editingId ? (
            <StatementClassField
              groupId={editingId}
              groupNameOf={(id) => rows.find((x) => x.id === id)?.name}
              onSaved={() => void load()}
            />
          ) : (
            <p className="text-xs text-text-muted">
              Statement class: save the group first, then open it with Edit to choose where it appears in the statements.
            </p>
          )
        ) : null}
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}

function ReportingImpactPanel({ groupId, onClose }: { groupId: number; onClose: () => void }) {
  const [impact, setImpact] = useState<{ reports: { id: string; label: string }[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    api
      .getAccountGroupReportingImpact(groupId)
      .then((data) => {
        if (!cancelled) setImpact(data);
      })
      .catch((e) => {
        logApiError("ReportingImpactPanel.getAccountGroupReportingImpact", e);
        if (!cancelled) {
          setImpact({ reports: [] });
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Reports using this group</h3>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-secondary">
          Close
        </button>
      </div>
      {loading ? (
        <p className="mt-2 text-sm text-text-muted">Loading…</p>
      ) : loadError ? (
        <p className="mt-2 text-sm text-status-warning-foreground">Could not load reporting impact for this group.</p>
      ) : impact?.reports?.length ? (
        <ul className="mt-2 list-inside list-disc text-sm text-text-secondary">
          {impact.reports.map((r) => (
            <li key={r.id}>{r.label}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No report mapping found.</p>
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
  openActionsId: number | string | null;
  onOpenChange: (id: number | string | null) => void;
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
  openActionsId,
  onOpenChange,
  showAccountCount,
  showAdvanced,
}: TreeNodeProps) {
  const [open, setOpen] = useState(true);
  const [reparentParent, setReparentParent] = useState<number | "">("");
  const hasChildren = node.children.length > 0;
  const reparentSelectOptions = [
    { value: 0, label: "Root (no parent)" },
    ...allRows.filter((r) => r.id !== node.id).map((r) => ({ value: r.id, label: r.name })),
  ];

  const handleReparent = () => {
    if (!onReparent) return;
    if (reparentParent === "") return;
    const parentId = reparentParent === 0 ? null : Number(reparentParent);
    onReparent(node.id, parentId, node.sort_order ?? 0);
    setReparentParent("");
  };

  return (
    <li className="list-none">
      <div className="flex flex-wrap items-center gap-2 py-1.5 pr-2" style={{ paddingLeft: depth * 20 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-text-muted hover:text-text-secondary"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-medium text-text-primary">{node.name}</span>
        <span className="text-text-muted">({node.code})</span>
        <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-text-secondary">{node.nature}</span>
        {showAdvanced && node.reporting_code && (
          <span className="text-xs text-text-muted">Rpt: {node.reporting_code}</span>
        )}
        {showAdvanced && node.allow_posting === false && (
          <span className="rounded bg-status-warning-subtle px-1.5 py-0.5 text-xs text-status-warning-foreground">
            No posting
          </span>
        )}
        {showAdvanced && node.is_summary_group && (
          <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs text-text-secondary">Summary</span>
        )}
        {showAdvanced && node.last_reviewed_at && (
          <span className="text-xs text-text-muted">Reviewed: {node.last_reviewed_at}</span>
        )}
        {showAccountCount && <span className="text-xs text-text-muted">{node.account_count} account(s)</span>}
        {!node.is_active && (
          <span className="rounded bg-status-warning-subtle px-1.5 py-0.5 text-xs text-status-warning-foreground">
            Inactive
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-1">
          {onReparent && (
            <>
              <LocalSearchSelect
                value={reparentParent}
                options={reparentSelectOptions}
                onChange={(next) => setReparentParent(next === "" ? "" : Number(next))}
                placeholder="— Reparent —"
                allowClear
                className="min-w-[10rem]"
                aria-label={`Reparent ${node.name}`}
              />
              <button
                type="button"
                onClick={handleReparent}
                disabled={reparentParent === ""}
                className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                Move
              </button>
            </>
          )}
          {onViewImpact && (
            <button
              type="button"
              onClick={() => onViewImpact(node.id)}
              className="rounded px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-subtle"
            >
              View impact
            </button>
          )}
          <RowActionsMenu
            rowId={node.id}
            openId={openActionsId}
            onOpenChange={onOpenChange}
            menuPortal
            items={[
              { key: "edit", label: "Edit", onClick: () => onEdit(node.id) },
              { key: "delete", label: "Delete", danger: true, onClick: () => onDelete(node.id) },
            ]}
          />
        </div>
      </div>
      {open && hasChildren && (
        <ul className="ml-2 space-y-0 border-l border-border">
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
              openActionsId={openActionsId}
              onOpenChange={onOpenChange}
              showAccountCount={showAccountCount}
              showAdvanced={showAdvanced}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
