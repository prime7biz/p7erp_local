import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationCreate,
  type HrDesignationResponse,
  type HrDesignationUpdate,
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
import { QuickAddSelect } from "@/components/hr/QuickAddSelect";
import { prepareHrMasterPayload } from "@/components/hr/hrQuickAddPayload";
import { useAuth } from "@/context/AuthContext";
import { downloadXlsx } from "@/lib/reportExport";
import { canExportHrData } from "@/lib/roles";
import type { SortDir, StatusFilter } from "./hrEmployeesListLogic";
import { fetchAllHrDepartments, fetchAllHrDesignations } from "./hrMasterData";
import {
  computeDesignationStats,
  emptyMasterFilters,
  filterDesignations,
  masterFilterCount,
  sortDesignations,
  type DepartmentFilter,
  type DesignationFilters,
  type DesignationSortKey,
  type MasterFilters,
} from "./hrMasterListLogic";

/** `?department=12` or `?department=none` from the Departments page. */
function departmentFromParam(value: string | null): DepartmentFilter {
  if (value === "none") return "none";
  const id = Number(value);
  return value && Number.isInteger(id) && id > 0 ? id : null;
}

export function HrDesignationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { me } = useAuth();
  const canExport = canExportHrData(me?.role_name);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [baseFilters, setFilters] = useState<MasterFilters>(emptyMasterFilters);
  // The department filter lives in the address (`?department=`), so links and the sidebar always agree with the list.
  const department = departmentFromParam(searchParams.get("department"));
  const filters: DesignationFilters = useMemo(() => ({ ...baseFilters, department }), [baseFilters, department]);
  const [sortKey, setSortKey] = useState<DesignationSortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrDesignationResponse | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<HrDesignationCreate>({
    code: "",
    title: "",
    department_id: null,
    is_active: true,
  });

  const departmentMap = useMemo(
    () => new Map(departments.map((d) => [d.id, `${d.code} - ${d.name}`])),
    [departments]
  );
  const departmentNameMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ id: d.id, label: `${d.code} - ${d.name}` })),
    [departments]
  );

  /** `keepMessages`: refresh after an action without wiping its success / failure message. */
  const load = useCallback(async (keepMessages = false) => {
    setLoading(true);
    if (!keepMessages) {
      setError("");
      setInfo("");
    }
    try {
      const [depRows, desRows] = await Promise.all([fetchAllHrDepartments(), fetchAllHrDesignations()]);
      setDepartments(depRows);
      setDesignations(desRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load designations");
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

  const departmentName = useCallback(
    (id: number | null) => (id == null ? "" : departmentNameMap.get(id) ?? "Unknown"),
    [departmentNameMap],
  );
  // Stats ignore the status filter so the Active / Inactive cards always show both numbers.
  const stats = useMemo(
    () => computeDesignationStats(filterDesignations(designations, { ...filters, status: "all" })),
    [designations, filters],
  );
  const rows = useMemo(
    () => sortDesignations(filterDesignations(designations, filters), sortKey, sortDir, departmentName),
    [designations, filters, sortKey, sortDir, departmentName],
  );
  const filterCount = masterFilterCount(filters);

  const setStatus = (status: StatusFilter) => setFilters((prev) => ({ ...prev, status }));
  const setDepartment = useCallback(
    (next: DepartmentFilter) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next == null) params.delete("department");
          else params.set("department", String(next));
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const clearFilters = () => {
    setFilters(emptyMasterFilters);
    setDepartment(null);
  };

  // An unknown id in the address (deleted department, old link) would hide everything; fall back to all.
  useEffect(() => {
    if (typeof department === "number" && departments.length > 0 && !departments.some((d) => d.id === department)) {
      setDepartment(null);
      setInfo("That department was not found, so all designations are shown.");
    }
  }, [department, departments, setDepartment]);
  const onSort = (k: DesignationSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: "",
      title: "",
      // Pre-select the department being viewed, so adding a job title for it takes one step.
      department_id: typeof filters.department === "number" ? filters.department : null,
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (row: HrDesignationResponse) => {
    setEditing(row);
    setForm({
      code: row.code,
      title: row.title,
      department_id: row.department_id,
      is_active: row.is_active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm({ code: "", title: "", department_id: null, is_active: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setError("");
    setInfo("");
    try {
      const payload = prepareHrMasterPayload(form, editing !== null);
      if (editing) {
        const updatePayload: HrDesignationUpdate = payload;
        await api.updateHrDesignation(editing.id, updatePayload);
      } else {
        await api.createHrDesignation(payload);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onDelete = async (row: HrDesignationResponse) => {
    const ok = window.confirm(
      `Delete designation "${row.code} - ${row.title}"?\n\nIf employees are linked, deletion will be blocked.`
    );
    if (!ok) return;
    setError("");
    setInfo("");
    try {
      await api.deleteHrDesignation(row.id);
      setInfo(`Designation ${row.code} deleted.`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onToggleActive = async (row: HrDesignationResponse) => {
    const activate = !row.is_active;
    if (!activate && !window.confirm(`Deactivate designation "${row.code} - ${row.title}"? It will no longer be offered for new records.`)) return;
    setError("");
    setInfo("");
    try {
      await api.updateHrDesignation(row.id, { is_active: activate });
      setInfo(`Designation ${row.code} ${activate ? "activated" : "deactivated"}.`);
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
        ["Code", "Designation", "Department", "Description", "Status"],
        rows.map((d) => [d.code, d.title, departmentName(d.department_id), d.description ?? "", d.is_active ? "Active" : "Inactive"]),
        "hr_designations",
      );
      setInfo(`Exported ${rows.length} designation(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const rowActions = (row: HrDesignationResponse): RowAction[] => {
    const done = (fn: () => void) => () => {
      setOpenActionsId(null);
      fn();
    };
    return [
      { label: "Edit", onClick: done(() => openEdit(row)) },
      { label: row.is_active ? "Deactivate" : "Activate", onClick: done(() => void onToggleActive(row)) },
      { label: "Delete", danger: true, onClick: done(() => void onDelete(row)) },
    ];
  };

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="HR Designations"
        description="Manage designation / position masters and map them to departments. Fields marked with ** are mandatory."
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
              + Add designation
            </button>
          </>
        }
      />

      {error && <div className={listPageErrorClass}>{error}</div>}
      {info && (
        <div role="status" className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total" value={stats.total} hint="Matching filters" active={filters.status === "all"} onClick={() => setStatus("all")} />
        <KpiCard label="Active" value={stats.active} active={filters.status === "active"} onClick={() => setStatus("active")} />
        <KpiCard label="Inactive" value={stats.inactive} active={filters.status === "inactive"} onClick={() => setStatus("inactive")} />
        <KpiCard
          label="No department"
          value={stats.unassigned}
          hint="Not mapped to a department"
          active={filters.department === "none"}
          onClick={() => setDepartment(filters.department === "none" ? null : "none")}
        />
      </div>

      <div className={listPageFilterBarClass}>
        <input
          className={listPageToolbarInputClass}
          placeholder="Search code, name or description"
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          aria-label="Search designations"
        />
        <select className={listPageToolbarSelectClass} value={filters.status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status">
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <select
          className={`${listPageToolbarSelectClass} sm:w-52`}
          value={filters.department ?? ""}
          onChange={(e) => setDepartment(departmentFromParam(e.target.value || null))}
          aria-label="Department"
        >
          <option value="">All departments</option>
          <option value="none">No department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} - {d.name}
            </option>
          ))}
        </select>
        <button type="button" className={listPageToolbarButtonClass} onClick={clearFilters} disabled={filterCount === 0}>
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
              onClick={() => setStatus(filters.status === s ? "all" : s)}
              className={filters.status === s ? listPageChipActiveClass : listPageChipInactiveClass}
            >
              {s === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {rows.length.toLocaleString()} of {designations.length.toLocaleString()}
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

      {loading && designations.length === 0 ? (
        <div className={listPageTableCardClass}>
          <div className="divide-y divide-border-subtle" aria-busy="true" aria-label="Loading designations">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
                <div className="h-3 w-20 rounded bg-surface-subtle" />
                <div className="h-3 w-48 rounded bg-surface-subtle" />
                <div className="ml-auto h-3 w-16 rounded bg-surface-subtle" />
              </div>
            ))}
          </div>
        </div>
      ) : designations.length === 0 ? (
        <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>
          <p className="text-base font-medium text-text-primary">No designations yet</p>
          <p className="mt-1 text-sm">Add job titles such as Sewing Operator, Line Incharge or HR Manager.</p>
          <button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">
            + Add designation
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>
          <p className="text-base font-medium text-text-primary">No designations match these filters</p>
          <button type="button" onClick={clearFilters} className={`mt-3 ${listPageToolbarButtonClass}`}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className={listPageTableCardClass}>
          <div className="overflow-x-auto">
            <table className={`${listTableBaseClass} min-w-[720px]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <SortableTh label="Code" column="code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Designation" column="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Department" column="department" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className={listTableThClass}>Status</th>
                  <th className={listTableThRightClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={listTableTrClass}>
                    <td className={`${listTableTdPrimaryClass} whitespace-nowrap`}>{row.code}</td>
                    <td className={listTableTdClass}>
                      <p className="font-medium text-text-primary">{row.title}</p>
                      {row.description && <p className="max-w-md truncate text-xs text-text-muted">{row.description}</p>}
                    </td>
                    <td className={listTableTdClass}>
                      {row.department_id != null ? (
                        <button
                          type="button"
                          onClick={() => setDepartment(row.department_id)}
                          className="text-left hover:text-brand-primary"
                          title="Show only this department"
                        >
                          {departmentMap.get(row.department_id) ?? "Unknown"}
                        </button>
                      ) : (
                        <span className="text-text-muted">Unassigned</span>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit designation" : "Add designation"}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              {editing ? (
                <input
                  className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                  placeholder="Designation code"
                  aria-label="Designation code"
                  value={form.code ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                />
              ) : (
                <p className="text-xs text-text-muted">Code assigned automatically</p>
              )}
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Designation name **"
                aria-label="Designation name"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                required
              />
              <QuickAddSelect
                kind="department"
                label="Department"
                emptyLabel="No department"
                value={form.department_id ?? null}
                options={departmentOptions}
                onChange={(id) => setForm((prev) => ({ ...prev, department_id: id }))}
                onCreated={(record) => {
                  // Add the new department to the list; QuickAddSelect then selects it.
                  setDepartments((prev) =>
                    prev.some((d) => d.id === record.id) ? prev : [...prev, record as HrDepartmentResponse],
                  );
                }}
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
