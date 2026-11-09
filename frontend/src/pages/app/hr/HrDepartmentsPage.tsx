import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type HrDepartmentCreate,
  type HrDepartmentResponse,
  type HrDepartmentUpdate,
  type HrDesignationResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageChipActiveClass,
  listPageChipInactiveClass,
  listPageChipRowClass,
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { ActiveBadge, KpiCard, RowActionsMenu, SortableTh, type RowAction } from "@/components/hr/HrListParts";
import { prepareHrMasterPayload } from "@/components/hr/hrQuickAddPayload";
import { useAuth } from "@/context/AuthContext";
import { downloadXlsx } from "@/lib/reportExport";
import { canExportHrData } from "@/lib/roles";
import { logApiError } from "@/utils/logApiError";
import type { SortDir, StatusFilter } from "./hrEmployeesListLogic";
import { fetchAllHrDepartments, fetchAllHrDesignations } from "./hrMasterData";
import {
  computeDepartmentStats,
  countDesignationsByDepartment,
  emptyMasterFilters,
  filterDepartments,
  masterFilterCount,
  sortDepartments,
  type MasterFilters,
  type MasterSortKey,
} from "./hrMasterListLogic";

export function HrDepartmentsPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const canExport = canExportHrData(me?.role_name);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  // True when designations could not be loaded, so counts would be wrong (not zero).
  const [countsUnavailable, setCountsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [filters, setFilters] = useState<MasterFilters>(emptyMasterFilters);
  const [sortKey, setSortKey] = useState<MasterSortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrDepartmentResponse | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<HrDepartmentCreate>({ code: "", name: "", is_active: true });

  /** `keepMessages`: refresh after an action without wiping its success / failure message. */
  const load = useCallback(async (keepMessages = false) => {
    setLoading(true);
    if (!keepMessages) {
      setError("");
      setInfo("");
    }
    try {
      const [depRows, desRows] = await Promise.all([
        fetchAllHrDepartments(),
        fetchAllHrDesignations().catch((e) => {
          logApiError("HrDepartmentsPage.designations", e);
          return null;
        }),
      ]);
      setDepartments(depRows);
      setDesignations(desRows ?? []);
      setCountsUnavailable(desRows === null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeMenus = useCallback(() => setOpenActionsId(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenus();
    };
    document.addEventListener("click", closeMenus);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", closeMenus);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeMenus]);

  const designationCounts = useMemo(() => countDesignationsByDepartment(designations), [designations]);
  // Stats ignore the status filter so the Active / Inactive cards always show both numbers.
  const stats = useMemo(
    () => computeDepartmentStats(filterDepartments(departments, { ...filters, status: "all" }), designationCounts),
    [departments, filters, designationCounts],
  );
  const rows = useMemo(
    () => sortDepartments(filterDepartments(departments, filters), sortKey, sortDir),
    [departments, filters, sortKey, sortDir],
  );
  const filterCount = masterFilterCount(filters);

  const setStatus = (status: StatusFilter) => setFilters((prev) => ({ ...prev, status }));
  const toggleStatusChip = (status: StatusFilter) => setStatus(filters.status === status ? "all" : status);
  const onSort = (k: MasterSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: HrDepartmentResponse) => {
    setEditing(row);
    setForm({ code: row.code, name: row.name, is_active: row.is_active });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError("");
    setInfo("");
    try {
      const payload = prepareHrMasterPayload(form, editing !== null);
      if (editing) {
        const updatePayload: HrDepartmentUpdate = payload;
        await api.updateHrDepartment(editing.id, updatePayload);
      } else {
        await api.createHrDepartment(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onDelete = async (row: HrDepartmentResponse) => {
    const ok = window.confirm(
      `Delete department "${row.code} - ${row.name}"?\n\nIf this department has linked records, deletion will be blocked.`
    );
    if (!ok) return;
    setError("");
    setInfo("");
    try {
      await api.deleteHrDepartment(row.id);
      setInfo(`Department ${row.code} deleted.`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onToggleActive = async (row: HrDepartmentResponse) => {
    const activate = !row.is_active;
    if (!activate && !window.confirm(`Deactivate department "${row.code} - ${row.name}"? It will no longer be offered for new records.`)) return;
    setError("");
    setInfo("");
    try {
      await api.updateHrDepartment(row.id, { is_active: activate });
      setInfo(`Department ${row.code} ${activate ? "activated" : "deactivated"}.`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const exportRows = async () => {
    setError("");
    setInfo("");
    try {
      await downloadXlsx(
        ["Code", "Department", "Designations", "Status"],
        rows.map((d) => [d.code, d.name, countsUnavailable ? null : designationCounts.get(d.id) ?? 0, d.is_active ? "Active" : "Inactive"]),
        "hr_departments",
      );
      setInfo(`Exported ${rows.length} department(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const rowActions = (row: HrDepartmentResponse): RowAction[] => {
    const done = (fn: () => void) => () => {
      setOpenActionsId(null);
      fn();
    };
    return [
      { label: "Edit", onClick: done(() => openEdit(row)) },
      { label: "View designations", onClick: done(() => navigate(`/app/hr/designations?department=${row.id}`)) },
      { label: row.is_active ? "Deactivate" : "Activate", onClick: done(() => void onToggleActive(row)) },
      { label: "Delete", danger: true, onClick: done(() => void onDelete(row)) },
    ];
  };

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="HR Departments"
        description="Create and manage department masters used on every employee."
        actions={
          <>
            {canExport && (
              <button
                type="button"
                onClick={() => void exportRows()}
                disabled={rows.length === 0}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                Export (Excel)
              </button>
            )}
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90"
            >
              + Add department
            </button>
          </>
        }
      />

      {error && <div className={listPageErrorClass}>{error}</div>}
      {countsUnavailable && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-2 text-sm text-text-secondary">
          Designation counts are unavailable right now. Click Refresh to try again.
        </div>
      )}
      {info && (
        <div role="status" className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total" value={stats.total} hint="Matching search" active={filters.status === "all"} onClick={() => setStatus("all")} />
        <KpiCard label="Active" value={stats.active} active={filters.status === "active"} onClick={() => setStatus("active")} />
        <KpiCard label="Inactive" value={stats.inactive} active={filters.status === "inactive"} onClick={() => setStatus("inactive")} />
        <KpiCard
          label="No designations"
          value={countsUnavailable ? "-" : stats.withoutDesignations}
          hint={countsUnavailable ? "Designation counts unavailable" : "Departments without job titles"}
        />
      </div>

      <div className={listPageFilterBarClass}>
        <input
          className={listPageToolbarInputClass}
          placeholder="Search code or name"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          aria-label="Search departments"
        />
        <select className={listPageToolbarSelectClass} value={filters.status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <button type="button" className={listPageToolbarButtonClass} onClick={() => setFilters(emptyMasterFilters)} disabled={filterCount === 0}>
          Clear{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className={listPageChipRowClass}>
          {(["active", "inactive"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.status === s}
              onClick={() => toggleStatusChip(s)}
              className={filters.status === s ? listPageChipActiveClass : listPageChipInactiveClass}
            >
              {s === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {rows.length.toLocaleString()} of {departments.length.toLocaleString()}
          </span>
          <button
            type="button"
            className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && departments.length === 0 ? (
        <div className={listPageTableCardClass}>
          <div className="divide-y divide-border-subtle" aria-busy="true" aria-label="Loading departments">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
                <div className="h-3 w-20 rounded bg-surface-subtle" />
                <div className="h-3 w-48 rounded bg-surface-subtle" />
                <div className="ml-auto h-3 w-16 rounded bg-surface-subtle" />
              </div>
            ))}
          </div>
        </div>
      ) : departments.length === 0 ? (
        <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>
          <p className="text-base font-medium text-text-primary">No departments yet</p>
          <p className="mt-1 text-sm">Add departments such as Production, Merchandising or Human Resources.</p>
          <button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">
            + Add department
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>
          <p className="text-base font-medium text-text-primary">No departments match these filters</p>
          <button type="button" onClick={() => setFilters(emptyMasterFilters)} className={`mt-3 ${listPageToolbarButtonClass}`}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className={listPageTableCardClass}>
          <div className="overflow-x-auto">
            <table className={`${listTableBaseClass} min-w-[640px]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <SortableTh label="Code" column="code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Department" column="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className={listTableThClass}>Designations</th>
                  <th className={listTableThClass}>Status</th>
                  <th className={listTableThRightClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const count = designationCounts.get(row.id) ?? 0;
                  return (
                    <tr key={row.id} className={listTableTrClass}>
                      <td className={`${listTableTdPrimaryClass} whitespace-nowrap`}>{row.code}</td>
                      <td className={`${listTableTdClass} font-medium text-text-primary`}>{row.name}</td>
                      <td className={listTableTdClass}>
                        {countsUnavailable ? (
                          <span className="text-text-muted">Unavailable</span>
                        ) : count > 0 ? (
                          <Link to={`/app/hr/designations?department=${row.id}`} className="font-medium text-brand-primary hover:underline">
                            {count.toLocaleString()} designation{count === 1 ? "" : "s"}
                          </Link>
                        ) : (
                          <span className="text-text-muted">None yet</span>
                        )}
                      </td>
                      <td className={listTableTdClass}>
                        <ActiveBadge active={row.is_active} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <RowActionsMenu
                          open={openActionsId === row.id}
                          onToggle={() => setOpenActionsId(openActionsId === row.id ? null : row.id)}
                          onClose={closeMenus}
                          actions={rowActions(row)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit department" : "Add department"}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              {editing ? (
                <input
                  className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  placeholder="Department code"
                  aria-label="Department code"
                  value={form.code ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                />
              ) : (
                <p className="text-xs text-text-muted">Code assigned automatically</p>
              )}
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Department name"
                aria-label="Department name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
