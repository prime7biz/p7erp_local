/**
 * Pure helpers for the HR master lists (Departments, Designations): filters, stats, sorting.
 * No React here, so everything is easy to unit test.
 */
import type { HrDepartmentResponse, HrDesignationResponse } from "@/api/models";
import type { SortDir, StatusFilter } from "./hrEmployeesListLogic";

/** Department filter value: a department id, "none" (no department) or null (any). */
export type DepartmentFilter = number | "none" | null;

export interface MasterFilters {
  search: string;
  status: StatusFilter;
}

export interface DesignationFilters extends MasterFilters {
  department: DepartmentFilter;
}

export const emptyMasterFilters: MasterFilters = { search: "", status: "all" };
export const emptyDesignationFilters: DesignationFilters = { search: "", status: "all", department: null };

export function masterFilterCount(f: MasterFilters | DesignationFilters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.status !== "all") n++;
  if ("department" in f && f.department != null) n++;
  return n;
}

function matchesStatus(isActive: boolean, status: StatusFilter): boolean {
  if (status === "active") return isActive;
  if (status === "inactive") return !isActive;
  return true;
}

function matchesSearch(q: string, values: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return values.some((v) => (v ?? "").toLowerCase().includes(needle));
}

export function filterDepartments(rows: HrDepartmentResponse[], f: MasterFilters): HrDepartmentResponse[] {
  return rows.filter((d) => matchesStatus(d.is_active, f.status) && matchesSearch(f.search, [d.code, d.name]));
}

export function filterDesignations(rows: HrDesignationResponse[], f: DesignationFilters): HrDesignationResponse[] {
  return rows.filter((d) => {
    if (!matchesStatus(d.is_active, f.status)) return false;
    if (f.department === "none" && d.department_id != null) return false;
    if (typeof f.department === "number" && d.department_id !== f.department) return false;
    return matchesSearch(f.search, [d.code, d.title, d.description]);
  });
}

export interface MasterStats {
  total: number;
  active: number;
  inactive: number;
}

export function computeMasterStats(rows: { is_active: boolean }[]): MasterStats {
  const active = rows.filter((r) => r.is_active).length;
  return { total: rows.length, active, inactive: rows.length - active };
}

export interface DepartmentStats extends MasterStats {
  /** Departments that have no designation mapped to them. */
  withoutDesignations: number;
}

export function computeDepartmentStats(rows: HrDepartmentResponse[], designationCounts: Map<number, number>): DepartmentStats {
  return {
    ...computeMasterStats(rows),
    withoutDesignations: rows.filter((d) => !designationCounts.get(d.id)).length,
  };
}

export interface DesignationStats extends MasterStats {
  unassigned: number;
}

export function computeDesignationStats(rows: HrDesignationResponse[]): DesignationStats {
  return { ...computeMasterStats(rows), unassigned: rows.filter((d) => d.department_id == null).length };
}

/** How many designations each department has (all statuses). */
export function countDesignationsByDepartment(designations: HrDesignationResponse[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const d of designations) {
    if (d.department_id != null) counts.set(d.department_id, (counts.get(d.department_id) ?? 0) + 1);
  }
  return counts;
}

export type MasterSortKey = "code" | "name";

function compareText(a: string, b: string, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  return sign * a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortDepartments(rows: HrDepartmentResponse[], key: MasterSortKey, dir: SortDir): HrDepartmentResponse[] {
  return [...rows].sort((a, b) => compareText(key === "code" ? a.code : a.name, key === "code" ? b.code : b.name, dir));
}

export type DesignationSortKey = MasterSortKey | "department";

/** Designations without a department always sort last when sorting by department. */
export function sortDesignations(
  rows: HrDesignationResponse[],
  key: DesignationSortKey,
  dir: SortDir,
  departmentName: (id: number | null) => string,
): HrDesignationResponse[] {
  const value = (d: HrDesignationResponse) => (key === "code" ? d.code : key === "name" ? d.title : departmentName(d.department_id));
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (!va && vb) return 1;
    if (va && !vb) return -1;
    return compareText(va, vb, dir);
  });
}
