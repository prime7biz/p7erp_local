import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeCreate,
  type HrEmployeeResponse,
  type HrEmployeeUpdate,
  type HrSectionResponse,
  type UserWithRoleResponse,
} from "@/api/client";
import { hrBangladeshApi } from "@/api/hrBangladesh";
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
import { EmployeeAvatar } from "@/components/hr/EmployeeAvatar";
import { EmployeeBadges, EmployeeCard } from "@/components/hr/employeeList/EmployeeListParts";
import { KpiCard, RowActionsMenu, SortableTh, type RowAction } from "@/components/hr/HrListParts";
import { downloadBlob } from "@/components/hr/workspace/recordTabs/shared";
import { useAuth } from "@/context/AuthContext";
import { useDebouncedValue, useLatestRequest } from "@/hooks/useDebouncedValue";
import { downloadXlsx } from "@/lib/reportExport";
import { canExportHrData } from "@/lib/roles";
import { logApiError } from "@/utils/logApiError";
import {
  QUICK_CHIPS,
  activeFilterCount,
  computeStats,
  distinctValues,
  emptyFilters,
  fetchAllPages,
  filterEmployees,
  formatShortDate,
  formatTenure,
  fullName,
  sortEmployees,
  type EmployeeFilters,
  type QuickChip,
  type SortDir,
  type SortKey,
  type StatusFilter,
} from "./hrEmployeesListLogic";
import { fetchAllHrDepartments, fetchAllHrDesignations } from "./hrMasterData";

/** The list endpoint returns at most 500 rows per call, so we page through it. */
const FETCH_PAGE_SIZE = 500;
const MAX_FETCH_PAGES = 40;
const VIEW_STORAGE_KEY = "p7.hr.employees.view";
const PAGE_SIZES = [25, 50, 100, 200];
const MANY_FILES_CONFIRM = 10;

type ViewMode = "table" | "cards";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "code:asc", label: "Code (A-Z)" },
  { value: "code:desc", label: "Code (Z-A)" },
  { value: "name:asc", label: "Name (A-Z)" },
  { value: "name:desc", label: "Name (Z-A)" },
  { value: "department:asc", label: "Department" },
  { value: "joining:desc", label: "Newest joiners" },
  { value: "joining:asc", label: "Longest serving" },
];

function fetchAllEmployees() {
  return fetchAllPages((limit, offset) => api.listHrEmployees({ active_only: false, limit, offset }), FETCH_PAGE_SIZE, MAX_FETCH_PAGES);
}

function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

export function HrEmployeesPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  // Unified employee workspace replaces the add / quick-edit dialog when the tenant flag is on.
  const workspaceV2 = me?.feature_flags?.hr_onboarding_workspace_v2 === true;
  const canExport = canExportHrData(me?.role_name);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [sections, setSections] = useState<HrSectionResponse[]>([]);
  const [employees, setEmployees] = useState<HrEmployeeResponse[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [filters, setFilters] = useState<EmployeeFilters>(emptyFilters);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployeeResponse | null>(null);
  const [tenantUsers, setTenantUsers] = useState<UserWithRoleResponse[]>([]);
  const [nextCode, setNextCode] = useState("");
  const [form, setForm] = useState<HrEmployeeCreate>({
    employee_code: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    national_id: "",
    birth_registration_no: "",
    department_id: null,
    designation_id: null,
    joining_date: "",
    user_id: null,
  });

  const departmentMap = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const designationMap = useMemo(() => new Map(designations.map((d) => [d.id, d.title])), [designations]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const departmentName = useCallback((id: number | null) => (id == null ? "" : departmentMap.get(id) ?? "Unknown"), [departmentMap]);
  const designationName = (id: number | null) => (id == null ? "" : designationMap.get(id) ?? "Unknown");
  const sectionName = (id: number | null) => (id == null ? "" : sectionMap.get(id) ?? "Unknown");

  const { begin, isCurrent } = useLatestRequest();

  /** `keepMessages`: refresh after an action without wiping its success / failure message. */
  const load = useCallback(async (keepMessages = false) => {
    const token = begin();
    setLoading(true);
    if (!keepMessages) setError("");
    try {
      const [depRows, desRows, secRows, empResult] = await Promise.all([
        fetchAllHrDepartments(),
        fetchAllHrDesignations(),
        api.listHrSections({ active_only: false }).catch((e) => {
          logApiError("HrEmployeesPage.listHrSections", e);
          return [] as HrSectionResponse[];
        }),
        fetchAllEmployees(),
      ]);
      if (!isCurrent(token)) return;
      setDepartments(depRows);
      setDesignations(desRows);
      setSections(secRows);
      setEmployees(empResult.rows);
      setTruncated(empResult.truncated);
    } catch (e) {
      if (!isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [begin, isCurrent]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api
      .listUsers()
      .then(setTenantUsers)
      .catch((e) => logApiError("HrEmployeesPage.listUsers", e));
  }, []);

  const closeMenus = useCallback(() => {
    setOpenActionsId(null);
    setToolsOpen(false);
  }, []);

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

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Private browsing can block storage; the toggle still works for this visit.
    }
  }, [view]);

  // ---------- Filtering, stats, sorting, paging ----------
  const debouncedSearch = useDebouncedValue(filters.search);
  const effectiveFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [filters, debouncedSearch]);
  const filtered = useMemo(() => filterEmployees(employees, effectiveFilters), [employees, effectiveFilters]);
  // Stats ignore the status filter so the Active / Inactive cards always show both numbers.
  const stats = useMemo(
    () => computeStats(filterEmployees(employees, { ...effectiveFilters, status: "all" })),
    [employees, effectiveFilters],
  );
  const sorted = useMemo(() => sortEmployees(filtered, sortKey, sortDir, departmentName), [filtered, sortKey, sortDir, departmentName]);
  const employmentTypes = useMemo(() => distinctValues(employees, "employment_type"), [employees]);
  const categories = useMemo(() => distinctValues(employees, "employee_category"), [employees]);
  const genders = useMemo(() => distinctValues(employees, "gender"), [employees]);
  const filterCount = activeFilterCount(filters);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // A filter change starts a fresh selection, so hidden rows never come back selected.
  const updateFilters = (patch: Partial<EmployeeFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(0);
    setSelected(new Set());
  };
  const toggleChip = (chip: QuickChip) => {
    setFilters((prev) => ({
      ...prev,
      chips: prev.chips.includes(chip) ? prev.chips.filter((c) => c !== chip) : [...prev.chips, chip],
    }));
    setPage(0);
    setSelected(new Set());
  };
  const clearFilters = () => {
    setFilters(emptyFilters);
    setPage(0);
    setSelected(new Set());
  };
  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "joining" ? "desc" : "asc");
    }
    setPage(0);
  };

  // ---------- Selection ----------
  const selectedRows = useMemo(() => sorted.filter((r) => selected.has(r.id)), [sorted, selected]);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const pageSomeSelected = pageRows.some((r) => selected.has(r.id));

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) pageRows.forEach((r) => next.delete(r.id));
      else pageRows.forEach((r) => next.add(r.id));
      return next;
    });
  const selectAllFiltered = () => setSelected(new Set(sorted.map((r) => r.id)));
  const clearSelection = () => setSelected(new Set());

  // ---------- Actions ----------
  const openCreate = () => {
    if (workspaceV2) {
      navigate("/app/hr/employees/new");
      return;
    }
    setEditing(null);
    setForm({
      employee_code: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      national_id: "",
      birth_registration_no: "",
      department_id: null,
      designation_id: null,
      joining_date: "",
      user_id: null,
    });
    setNextCode("");
    hrBangladeshApi
      .employeeNumberFormat()
      .then((f) => setNextCode(f.next_code))
      .catch((e) => logApiError("HrEmployeesPage.employeeNumberFormat", e));
    setModalOpen(true);
  };

  const openEdit = (row: HrEmployeeResponse) => {
    setEditing(row);
    setForm({
      employee_code: row.employee_code,
      first_name: row.first_name,
      last_name: row.last_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      national_id: row.national_id ?? "",
      birth_registration_no: row.birth_registration_no ?? "",
      department_id: row.department_id,
      designation_id: row.designation_id,
      joining_date: row.joining_date ?? "",
      user_id: row.user_id ?? null,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name?.trim()) return;
    setError("");
    try {
      if (editing) {
        const payload: HrEmployeeUpdate = {
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          national_id: form.national_id || null,
          birth_registration_no: form.birth_registration_no || null,
          department_id: form.department_id ?? null,
          designation_id: form.designation_id ?? null,
          joining_date: form.joining_date || null,
          user_id: form.user_id ?? null,
        };
        await api.updateHrEmployee(editing.id, payload);
      } else {
        await api.createHrEmployee({
          first_name: form.first_name,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone || null,
          national_id: form.national_id || null,
          birth_registration_no: form.birth_registration_no || null,
          department_id: form.department_id ?? null,
          designation_id: form.designation_id ?? null,
          joining_date: form.joining_date || null,
          user_id: form.user_id ?? null,
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const exportAll = async () => {
    setInfo("");
    setError("");
    try {
      const blob = await api.exportHrEmployees();
      downloadBlob(blob, "employees.xlsx");
      setInfo("Export started.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  };

  /** Excel of the rows on screen, using only the columns the list already shows. */
  const exportRows = async (rows: HrEmployeeResponse[], baseName: string) => {
    setInfo("");
    setError("");
    if (rows.length === 0) {
      setError("Nothing to export.");
      return;
    }
    try {
      await downloadXlsx(
        ["Code", "Name", "Department", "Section", "Designation", "Category", "Employment type", "Joining date", "Tenure", "Status", "Phone", "Email"],
        rows.map((r) => [
          r.employee_code,
          fullName(r),
          departmentName(r.department_id),
          sectionName(r.section_id),
          designationName(r.designation_id),
          r.employee_category ?? "",
          r.employment_type ?? "",
          r.joining_date ?? "",
          formatTenure(r.joining_date),
          r.is_active ? "Active" : "Inactive",
          r.phone ?? "",
          r.email ?? "",
        ]),
        baseName,
      );
      setInfo(`Exported ${rows.length} employee(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  };

  const printAllIdCards = async () => {
    setInfo("");
    setError("");
    try {
      const blob = await api.generateHrBulkIdCards();
      downloadBlob(blob, "id-cards.zip");
      setInfo("ID cards downloaded (with photo and QR). Each print is recorded in the ID card issue register.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ID card generation failed");
    }
  };

  const onImportFile = async (file: File) => {
    setError("");
    setInfo("");
    try {
      const r = await api.importHrEmployees(file);
      setInfo(`Imported: ${r.created} created, ${r.updated} updated.`);
      if (r.errors?.length) setError(`${r.errors.length} row(s) skipped: ${r.errors.slice(0, 3).join("; ")}${r.errors.length > 3 ? " ..." : ""}`);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  };

  const printIdCards = async (rows: HrEmployeeResponse[]) => {
    if (rows.length === 0) return;
    if (rows.length > MANY_FILES_CONFIRM && !window.confirm(`This downloads ${rows.length} separate ID card files. Continue?`)) return;
    setError("");
    setInfo("");
    let ok = 0;
    const failures: string[] = [];
    for (const [i, r] of rows.entries()) {
      setBulkBusy(`Printing ID card ${i + 1} of ${rows.length}...`);
      try {
        const blob = await api.generateHrIdCard(r.id);
        downloadBlob(blob, `${r.employee_code}-id-card.pdf`);
        ok++;
      } catch (e) {
        failures.push(`${r.employee_code}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setBulkBusy("");
    if (ok) setInfo(`${ok} ID card(s) downloaded. Each print is recorded in the ID card issue register.`);
    if (failures.length) setError(`${failures.length} ID card(s) failed. ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? " ..." : ""}`);
  };

  const setActive = async (rows: HrEmployeeResponse[], activate: boolean) => {
    const targets = rows.filter((r) => r.is_active !== activate);
    const verb = activate ? "Activate" : "Deactivate";
    if (targets.length === 0) {
      setInfo(`Selected employee(s) are already ${activate ? "active" : "inactive"}.`);
      return;
    }
    if (!window.confirm(`${verb} ${targets.length} employee(s)?`)) return;
    setError("");
    setInfo("");
    const done = new Set<number>();
    const failures: string[] = [];
    for (const [i, r] of targets.entries()) {
      setBulkBusy(`${activate ? "Activating" : "Deactivating"} ${i + 1} of ${targets.length}...`);
      try {
        if (activate) await api.activateHrEmployee(r.id);
        else await api.deactivateHrEmployee(r.id);
        done.add(r.id);
      } catch (e) {
        failures.push(`${r.employee_code}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    setBulkBusy("");
    setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))));
    if (done.size) setInfo(`${done.size} employee(s) ${activate ? "activated" : "deactivated"}.`);
    if (failures.length) setError(`${failures.length} failed. ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? " ..." : ""}`);
    await load(true);
  };

  const rowActions = (row: HrEmployeeResponse): RowAction[] => {
    const done = (fn: () => void) => () => {
      setOpenActionsId(null);
      fn();
    };
    return [
      { label: "View", onClick: done(() => navigate(`/app/hr/employees/${row.id}`)) },
      { label: "Edit", onClick: done(() => (workspaceV2 ? navigate(`/app/hr/employees/${row.id}`) : openEdit(row))) },
      { label: "Print ID card", onClick: done(() => void printIdCards([row])) },
      row.is_active
        ? { label: "Deactivate", danger: true, onClick: done(() => void setActive([row], false)) }
        : { label: "Activate", onClick: done(() => void setActive([row], true)) },
    ];
  };

  const busy = Boolean(bulkBusy);

  const renderActions = (row: HrEmployeeResponse) => (
    <RowActionsMenu
      open={openActionsId === row.id}
      onToggle={() => {
        setToolsOpen(false);
        setOpenActionsId(openActionsId === row.id ? null : row.id);
      }}
      onClose={closeMenus}
      actions={rowActions(row)}
      disabled={busy}
    />
  );
  const toolsItemClass = "block w-full rounded-md px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-subtle";

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="HR Employees"
        description="Find, filter and manage every employee record in one place."
        actions={
          <>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setOpenActionsId(null);
                  setToolsOpen((o) => !o);
                }}
                aria-expanded={toolsOpen}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
              >
                Import / Export ▾
              </button>
              {toolsOpen && (
                <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                  <button type="button" className={toolsItemClass} onClick={() => { setToolsOpen(false); void exportAll(); }}>
                    Export all employees (Excel)
                  </button>
                  {canExport && (
                    <button type="button" className={toolsItemClass} onClick={() => { setToolsOpen(false); void exportRows(sorted, "employees_filtered"); }}>
                      Export current view ({sorted.length})
                    </button>
                  )}
                  <button type="button" className={toolsItemClass} onClick={() => { setToolsOpen(false); importInputRef.current?.click(); }}>
                    Import from Excel
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button type="button" className={toolsItemClass} onClick={() => { setToolsOpen(false); void printAllIdCards(); }}>
                    Print all ID cards (ZIP)
                  </button>
                </div>
              )}
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onImportFile(file);
              }}
            />
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              + Add employee
            </button>
          </>
        }
      />

      {error && <div className={listPageErrorClass}>{error}</div>}
      {info && <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">{info}</div>}
      {truncated && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-2 text-sm text-text-secondary">
          Only the first {(FETCH_PAGE_SIZE * MAX_FETCH_PAGES).toLocaleString()} employees are loaded. Use the filters or Export all for the full list.
        </div>
      )}

      {/* KPI cards: click one to filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total" value={stats.total} hint="Matching filters" active={filters.status === "all"} onClick={() => updateFilters({ status: "all" })} />
        <KpiCard label="Active" value={stats.active} active={filters.status === "active"} onClick={() => updateFilters({ status: "active" })} />
        <KpiCard label="Inactive" value={stats.inactive} active={filters.status === "inactive"} onClick={() => updateFilters({ status: "inactive" })} />
        <KpiCard label="Departments" value={stats.departments} hint="With employees" />
        <KpiCard label="On probation" value={stats.onProbation} active={filters.chips.includes("probation")} onClick={() => toggleChip("probation")} />
        <KpiCard label="New (30 days)" value={stats.newLast30} active={filters.chips.includes("new30")} onClick={() => toggleChip("new30")} />
      </div>

      {/* Filters */}
      <div className={listPageFilterBarClass}>
        <input
          className={listPageToolbarInputClass}
          placeholder="Search code, name, email or phone"
          value={filters.search}
          onChange={(e) => updateFilters({ search: e.target.value })}
          aria-label="Search employees"
        />
        <select className={listPageToolbarSelectClass} value={filters.status} onChange={(e) => updateFilters({ status: e.target.value as StatusFilter })} aria-label="Status">
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All statuses</option>
        </select>
        <select
          className={listPageToolbarSelectClass}
          value={filters.departmentId ?? ""}
          onChange={(e) => updateFilters({ departmentId: e.target.value ? Number(e.target.value) : null })}
          aria-label="Department"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <select
          className={listPageToolbarSelectClass}
          value={filters.designationId ?? ""}
          onChange={(e) => updateFilters({ designationId: e.target.value ? Number(e.target.value) : null })}
          aria-label="Designation"
        >
          <option value="">All designations</option>
          {designations.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
        {sections.length > 0 && (
          <select
            className={listPageToolbarSelectClass}
            value={filters.sectionId ?? ""}
            onChange={(e) => updateFilters({ sectionId: e.target.value ? Number(e.target.value) : null })}
            aria-label="Section or line"
          >
            <option value="">All sections / lines</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {employmentTypes.length > 0 && (
          <select className={listPageToolbarSelectClass} value={filters.employmentType} onChange={(e) => updateFilters({ employmentType: e.target.value })} aria-label="Employment type">
            <option value="">All employment types</option>
            {employmentTypes.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        {categories.length > 0 && (
          <select className={listPageToolbarSelectClass} value={filters.category} onChange={(e) => updateFilters({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        {genders.length > 0 && (
          <select className={listPageToolbarSelectClass} value={filters.gender} onChange={(e) => updateFilters({ gender: e.target.value })} aria-label="Gender">
            <option value="">All genders</option>
            {genders.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}
        <button type="button" className={listPageToolbarButtonClass} onClick={clearFilters} disabled={filterCount === 0}>
          Clear{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
      </div>

      {/* Quick chips + view controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className={listPageChipRowClass}>
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={filters.chips.includes(c.id)}
              onClick={() => toggleChip(c.id)}
              className={filters.chips.includes(c.id) ? listPageChipActiveClass : listPageChipInactiveClass}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-text-muted">
            {sorted.length.toLocaleString()} of {employees.length.toLocaleString()}
          </span>
          <select
            className="rounded-lg border border-border-strong bg-surface-raised px-2 py-1.5 text-xs text-text-primary"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [SortKey, SortDir];
              setSortKey(k);
              setSortDir(d);
              setPage(0);
            }}
            aria-label="Sort by"
          >
            {!SORT_OPTIONS.some((o) => o.value === `${sortKey}:${sortDir}`) && <option value={`${sortKey}:${sortDir}`}>Custom sort</option>}
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="inline-flex overflow-hidden rounded-lg border border-border-strong" role="group" aria-label="View">
            {(["table", "cards"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium ${view === v ? "bg-brand-primary text-white" : "text-text-secondary hover:bg-surface-subtle"}`}
              >
                {v === "table" ? "Table" : "Cards"}
              </button>
            ))}
          </div>
          <button type="button" className="rounded-lg border border-border-strong px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {bulkBusy && (
        <div role="status" className="rounded-lg border border-border bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
          {bulkBusy}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedRows.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-brand-primary/40 bg-surface-raised px-3 py-2 shadow-md">
          <span className="text-sm font-semibold text-text-primary">{selectedRows.length} selected</span>
          {selectedRows.length < sorted.length && (
            <button type="button" className="text-xs font-medium text-brand-primary hover:underline" onClick={selectAllFiltered} disabled={busy}>
              Select all {sorted.length} matching
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canExport && (
              <button type="button" className={listPageToolbarButtonClass} disabled={busy} onClick={() => void exportRows(selectedRows, "employees_selected")}>
                Export selected
              </button>
            )}
            <button type="button" className={listPageToolbarButtonClass} disabled={busy} onClick={() => void printIdCards(selectedRows)}>
              Print ID cards
            </button>
            <button type="button" className={listPageToolbarButtonClass} disabled={busy} onClick={() => void setActive(selectedRows, true)}>
              Activate
            </button>
            <button
              type="button"
              className="rounded-lg border border-status-danger/40 px-3 py-2 text-sm text-status-danger hover:bg-status-danger-subtle"
              disabled={busy}
              onClick={() => void setActive(selectedRows, false)}
            >
              Deactivate
            </button>
            <button type="button" className="px-2 py-2 text-sm text-text-muted hover:text-text-primary" disabled={busy} onClick={clearSelection}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className={listPageTableCardClass}>
          <div className="divide-y divide-border-subtle" aria-busy="true" aria-label="Loading employees">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-surface-subtle" />
                <div className="h-3 w-40 rounded bg-surface-subtle" />
                <div className="ml-auto h-3 w-24 rounded bg-surface-subtle" />
              </div>
            ))}
          </div>
        </div>
      ) : employees.length === 0 ? (
        <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>
          <p className="text-base font-medium text-text-primary">No employees yet</p>
          <p className="mt-1 text-sm">Add your first employee or import a list from Excel.</p>
          <button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            + Add employee
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className={`${listPageTableCardClass} ${listPageEmptyClass}`}>
          <p className="text-base font-medium text-text-primary">No employees match these filters</p>
          <button type="button" onClick={clearFilters} className={`mt-3 ${listPageToolbarButtonClass}`}>
            Clear filters
          </button>
        </div>
      ) : view === "table" ? (
        <div className={listPageTableCardClass}>
          <div className="overflow-x-auto">
            <table className={`${listTableBaseClass} min-w-[1100px]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={pageAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = pageSomeSelected && !pageAllSelected;
                      }}
                      onChange={togglePage}
                    />
                  </th>
                  <SortableTh label="Code" column="code" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <SortableTh label="Employee" column="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className={listTableThClass}>Contact</th>
                  <SortableTh label="Department / Section" column="department" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className={listTableThClass}>Designation</th>
                  <SortableTh label="Joined" column="joining" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <th className={listTableThClass}>Status</th>
                  <th className={listTableThRightClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const name = fullName(row);
                  const isSelected = selected.has(row.id);
                  const tenure = formatTenure(row.joining_date);
                  return (
                    <tr key={row.id} className={`${listTableTrClass} ${isSelected ? "bg-brand-primary/5" : ""}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(row.id)} aria-label={`Select ${name}`} />
                      </td>
                      <td className={`${listTableTdPrimaryClass} whitespace-nowrap`}>{row.employee_code}</td>
                      <td className={listTableTdClass}>
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar name={name} inactive={!row.is_active} />
                          <div className="min-w-0">
                            <Link to={`/app/hr/employees/${row.id}`} className="block truncate font-medium text-text-primary hover:text-brand-primary">
                              {name}
                            </Link>
                            {row.email && <p className="truncate text-xs text-text-muted">{row.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className={`${listTableTdClass} whitespace-nowrap`}>
                        {row.phone ? (
                          <a href={`tel:${row.phone}`} className="hover:text-brand-primary">{row.phone}</a>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                        {row.mobile_is_bkash && <p className="text-[11px] text-text-muted">bKash</p>}
                      </td>
                      <td className={listTableTdClass}>
                        <p>{departmentName(row.department_id) || <span className="text-text-muted">Unassigned</span>}</p>
                        {row.section_id != null && <p className="text-xs text-text-muted">{sectionName(row.section_id)}</p>}
                      </td>
                      <td className={listTableTdClass}>
                        <p>{designationName(row.designation_id) || <span className="text-text-muted">Unassigned</span>}</p>
                        {(row.employee_category || row.employment_type) && (
                          <p className="text-xs text-text-muted">{[row.employee_category, row.employment_type].filter(Boolean).join(" · ")}</p>
                        )}
                      </td>
                      <td className={`${listTableTdClass} whitespace-nowrap`}>
                        {row.joining_date ? (
                          <>
                            <p>{formatShortDate(row.joining_date)}</p>
                            {tenure && <p className="text-xs text-text-muted">{tenure}</p>}
                          </>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className={listTableTdClass}>
                        <EmployeeBadges employee={row} />
                      </td>
                      <td className="px-4 py-3 text-right">{renderActions(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={pageAllSelected}
              ref={(el) => {
                if (el) el.indeterminate = pageSomeSelected && !pageAllSelected;
              }}
              onChange={togglePage}
            />
            Select all on this page
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageRows.map((row) => (
              <EmployeeCard
                key={row.id}
                employee={row}
                departmentName={departmentName(row.department_id) || "Unassigned"}
                designationName={designationName(row.designation_id) || "No designation"}
                sectionName={sectionName(row.section_id) || "-"}
                selected={selected.has(row.id)}
                onToggleSelect={() => toggleOne(row.id)}
                actions={renderActions(row)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pager */}
      {!loading && sorted.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-2 text-sm text-text-secondary sm:flex-row">
          <span>
            Showing {(safePage * pageSize + 1).toLocaleString()}-{Math.min(sorted.length, (safePage + 1) * pageSize).toLocaleString()} of{" "}
            {sorted.length.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-text-muted">
              Rows
              <select
                className="rounded border border-border-strong bg-surface-raised px-2 py-1 text-xs text-text-primary"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button type="button" className={listPageToolbarButtonClass} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              Previous
            </button>
            <span className="text-xs text-text-muted">
              Page {safePage + 1} of {totalPages}
            </span>
            <button type="button" className={listPageToolbarButtonClass} disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
              Next
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-lg rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit employee" : "Add employee"}</h2>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary" aria-label="Employee number">
                {editing ? (
                  <>
                    <span className="font-medium text-text-primary">{editing.employee_code}</span>
                    <span className="block text-xs text-text-muted">Permanent number, cannot change</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-text-primary">{nextCode || "Assigned automatically"}</span>
                    <span className="block text-xs text-text-muted">New number on save, never reused</span>
                  </>
                )}
              </div>
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="First name"
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                required
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Last name"
                value={form.last_name ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Email"
                value={form.email ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Mobile (e.g. 01712345678)"
                inputMode="tel"
                value={form.phone ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="NID (10, 13 or 17 digits)"
                inputMode="numeric"
                value={form.national_id ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, national_id: e.target.value }))}
              />
              <input
                className="rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Birth registration no. (17 digits)"
                inputMode="numeric"
                value={form.birth_registration_no ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, birth_registration_no: e.target.value }))}
              />
              <select
                className="rounded border border-border-strong px-3 py-2 text-sm"
                value={form.department_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, department_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-border-strong px-3 py-2 text-sm"
                value={form.designation_id ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, designation_id: e.target.value ? Number(e.target.value) : null }))
                }
              >
                <option value="">No designation</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.title}
                  </option>
                ))}
              </select>
              <label className="sm:col-span-2 flex flex-col gap-1 text-xs text-text-muted">
                Linked app user (ESS / login)
                <select
                  className="rounded border border-border-strong px-3 py-2 text-sm text-text-primary"
                  value={form.user_id ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, user_id: e.target.value ? Number(e.target.value) : null }))
                  }
                >
                  <option value="">None</option>
                  {tenantUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} {u.email ? `(${u.email})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="date"
                className="rounded border border-border-strong px-3 py-2 text-sm sm:col-span-2"
                value={form.joining_date ?? ""}
                onChange={(e) => setForm((prev) => ({ ...prev, joining_date: e.target.value }))}
              />
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">
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
