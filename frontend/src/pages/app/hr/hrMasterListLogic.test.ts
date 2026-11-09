import { describe, expect, it } from "vitest";
import type { HrDepartmentResponse, HrDesignationResponse } from "@/api/models";
import {
  computeDepartmentStats,
  computeDesignationStats,
  countDesignationsByDepartment,
  emptyDesignationFilters,
  emptyMasterFilters,
  filterDepartments,
  filterDesignations,
  masterFilterCount,
  sortDepartments,
  sortDesignations,
} from "./hrMasterListLogic";

function dept(id: number, code: string, name: string, is_active = true): HrDepartmentResponse {
  return { id, tenant_id: 1, code, name, is_active };
}

function desig(id: number, code: string, title: string, department_id: number | null, is_active = true): HrDesignationResponse {
  return { id, tenant_id: 1, code, title, description: null, department_id, is_active };
}

const departments = [dept(1, "DEPT-2", "Sewing"), dept(2, "DEPT-10", "Cutting", false), dept(3, "DEPT-1", "Admin")];
const designations = [
  desig(1, "DES-1", "Operator", 1),
  desig(2, "DES-2", "Supervisor", 1, false),
  desig(3, "DES-3", "Cutter", 2),
  desig(4, "DES-4", "Driver", null),
];

describe("filterDepartments", () => {
  it("filters by status and searches code or name", () => {
    expect(filterDepartments(departments, emptyMasterFilters).map((d) => d.id)).toEqual([1, 2, 3]);
    expect(filterDepartments(departments, { search: "", status: "inactive" }).map((d) => d.id)).toEqual([2]);
    expect(filterDepartments(departments, { search: "sew", status: "all" }).map((d) => d.id)).toEqual([1]);
    expect(filterDepartments(departments, { search: "dept-1", status: "active" }).map((d) => d.id)).toEqual([3]);
  });
});

describe("filterDesignations", () => {
  it("filters by department, no department, status and search", () => {
    expect(filterDesignations(designations, { ...emptyDesignationFilters, department: 1 }).map((d) => d.id)).toEqual([1, 2]);
    expect(filterDesignations(designations, { ...emptyDesignationFilters, department: "none" }).map((d) => d.id)).toEqual([4]);
    expect(filterDesignations(designations, { ...emptyDesignationFilters, status: "active", department: 1 }).map((d) => d.id)).toEqual([1]);
    expect(filterDesignations(designations, { ...emptyDesignationFilters, search: "cut" }).map((d) => d.id)).toEqual([3]);
  });
  it("counts active filters", () => {
    expect(masterFilterCount(emptyDesignationFilters)).toBe(0);
    expect(masterFilterCount({ search: "x", status: "active", department: "none" })).toBe(3);
  });
});

describe("stats", () => {
  it("summarises departments with designation counts", () => {
    const counts = countDesignationsByDepartment(designations);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(3)).toBeUndefined();
    expect(computeDepartmentStats(departments, counts)).toEqual({ total: 3, active: 2, inactive: 1, withoutDesignations: 1 });
  });
  it("summarises designations", () => {
    expect(computeDesignationStats(designations)).toEqual({ total: 4, active: 3, inactive: 1, unassigned: 1 });
  });
});

describe("sorting", () => {
  it("sorts department codes numerically", () => {
    expect(sortDepartments(departments, "code", "asc").map((d) => d.code)).toEqual(["DEPT-1", "DEPT-2", "DEPT-10"]);
    expect(sortDepartments(departments, "name", "desc").map((d) => d.name)).toEqual(["Sewing", "Cutting", "Admin"]);
  });
  it("puts designations without a department last", () => {
    const names = new Map([[1, "Sewing"], [2, "Cutting"]]);
    const name = (id: number | null) => (id == null ? "" : names.get(id) ?? "");
    expect(sortDesignations(designations, "department", "asc", name).map((d) => d.id)).toEqual([3, 1, 2, 4]);
    expect(sortDesignations(designations, "department", "desc", name).map((d) => d.id)).toEqual([1, 2, 3, 4]);
  });
});
