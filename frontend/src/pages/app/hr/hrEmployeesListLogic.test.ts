import { describe, expect, it, vi } from "vitest";
import type { HrEmployeeResponse } from "@/api/models";
import {
  activeFilterCount,
  addMonths,
  computeStats,
  distinctValues,
  emptyFilters,
  fetchAllPages,
  filterEmployees,
  formatShortDate,
  formatTenure,
  getInitials,
  isOnProbation,
  joinedWithinDays,
  sortEmployees,
} from "./hrEmployeesListLogic";

const TODAY = new Date(2026, 10, 9); // 9 Nov 2026

function emp(overrides: Partial<HrEmployeeResponse>): HrEmployeeResponse {
  return {
    id: 1,
    tenant_id: 1,
    employee_code: "EMP-00001",
    first_name: "Rahim",
    last_name: "Uddin",
    email: null,
    phone: null,
    reporting_manager_id: null,
    user_id: null,
    department_id: null,
    designation_id: null,
    section_id: null,
    employee_category: null,
    joining_date: null,
    date_of_birth: null,
    gender: null,
    marital_status: null,
    blood_group: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    address_line: null,
    city: null,
    country: null,
    national_id: null,
    employment_type: null,
    confirmation_date: null,
    exit_date: null,
    is_active: true,
    ...overrides,
  };
}

describe("getInitials", () => {
  it("uses first and last word", () => {
    expect(getInitials("Shahariyar Khan")).toBe("SK");
    expect(getInitials("Md Abdul Karim")).toBe("MK");
  });
  it("handles single and empty names", () => {
    expect(getInitials("Rahim")).toBe("RA");
    expect(getInitials("  ")).toBe("?");
  });
});

describe("formatShortDate", () => {
  it("formats ISO dates and blanks missing ones", () => {
    expect(formatShortDate("2026-11-01")).toBe("01 Nov 2026");
    expect(formatShortDate(null)).toBe("");
  });
});

describe("formatTenure", () => {
  it("formats years and months", () => {
    expect(formatTenure("2024-08-01", TODAY)).toBe("2y 3m");
    expect(formatTenure("2025-11-09", TODAY)).toBe("1y");
    expect(formatTenure("2026-06-10", TODAY)).toBe("4m");
  });
  it("uses days under a month and blanks future/unknown dates", () => {
    expect(formatTenure("2026-10-30", TODAY)).toBe("10d");
    expect(formatTenure("2027-01-01", TODAY)).toBe("");
    expect(formatTenure(null, TODAY)).toBe("");
  });
});

describe("isOnProbation", () => {
  it("uses joining date + probation months", () => {
    expect(isOnProbation(emp({ joining_date: "2026-09-01", probation_months: 6 }), TODAY)).toBe(true);
    expect(isOnProbation(emp({ joining_date: "2026-01-01", probation_months: 6 }), TODAY)).toBe(false);
  });
  it("prefers the confirmation date when set", () => {
    expect(isOnProbation(emp({ joining_date: "2026-01-01", probation_months: 6, confirmation_date: "2026-12-01" }), TODAY)).toBe(true);
    expect(isOnProbation(emp({ joining_date: "2026-09-01", probation_months: 6, confirmation_date: "2026-10-01" }), TODAY)).toBe(false);
  });
  it("is false for inactive employees or missing data", () => {
    expect(isOnProbation(emp({ joining_date: "2026-09-01", probation_months: 6, is_active: false }), TODAY)).toBe(false);
    expect(isOnProbation(emp({ joining_date: "2026-09-01" }), TODAY)).toBe(false);
  });
});

describe("filterEmployees", () => {
  const rows = [
    emp({ id: 1, employee_code: "EMP-1", first_name: "Rahim", department_id: 10, gender: "Male", joining_date: "2026-11-01", user_id: 5 }),
    emp({ id: 2, employee_code: "EMP-2", first_name: "Karima", department_id: 20, gender: "Female", phone: "01712345678" }),
    emp({ id: 3, employee_code: "EMP-3", first_name: "Old", is_active: false, has_photo: true }),
  ];

  it("defaults to active only", () => {
    expect(filterEmployees(rows, emptyFilters, TODAY).map((e) => e.id)).toEqual([1, 2]);
  });
  it("filters by status, department, gender and search", () => {
    expect(filterEmployees(rows, { ...emptyFilters, status: "inactive" }, TODAY).map((e) => e.id)).toEqual([3]);
    expect(filterEmployees(rows, { ...emptyFilters, departmentId: 20 }, TODAY).map((e) => e.id)).toEqual([2]);
    expect(filterEmployees(rows, { ...emptyFilters, gender: "Male" }, TODAY).map((e) => e.id)).toEqual([1]);
    expect(filterEmployees(rows, { ...emptyFilters, search: "0171" }, TODAY).map((e) => e.id)).toEqual([2]);
  });
  it("combines quick chips", () => {
    expect(filterEmployees(rows, { ...emptyFilters, chips: ["new30"] }, TODAY).map((e) => e.id)).toEqual([1]);
    expect(filterEmployees(rows, { ...emptyFilters, chips: ["noUser"] }, TODAY).map((e) => e.id)).toEqual([2]);
    expect(filterEmployees(rows, { ...emptyFilters, status: "all", chips: ["hasPhoto", "noDepartment"] }, TODAY).map((e) => e.id)).toEqual([3]);
  });
  it("counts active filters", () => {
    expect(activeFilterCount(emptyFilters)).toBe(0);
    expect(activeFilterCount({ ...emptyFilters, status: "all", gender: "Male", chips: ["new30"] })).toBe(3);
  });
});

describe("computeStats and distinctValues", () => {
  it("summarises rows", () => {
    const rows = [
      emp({ id: 1, department_id: 10, joining_date: "2026-11-01", probation_months: 6, employment_type: "Permanent" }),
      emp({ id: 2, department_id: 10, employment_type: "Contract" }),
      emp({ id: 3, department_id: 20, is_active: false, employment_type: "Permanent" }),
    ];
    expect(computeStats(rows, TODAY)).toEqual({ total: 3, active: 2, inactive: 1, departments: 2, onProbation: 1, newLast30: 1 });
    expect(distinctValues(rows, "employment_type")).toEqual(["Contract", "Permanent"]);
  });
});

describe("more filters", () => {
  const rows = [
    emp({ id: 1, designation_id: 7, section_id: 3, employment_type: "Permanent", employee_category: "WORKER", gender: "male", last_name: "Hossain", email: "r@x.com" }),
    emp({ id: 2, designation_id: 8, employment_type: "Contract", employee_category: "STAFF", gender: "Male", joining_date: "2026-10-10", probation_months: 3 }),
  ];
  it("filters by designation, section, type and category", () => {
    expect(filterEmployees(rows, { ...emptyFilters, designationId: 8 }, TODAY).map((e) => e.id)).toEqual([2]);
    expect(filterEmployees(rows, { ...emptyFilters, sectionId: 3 }, TODAY).map((e) => e.id)).toEqual([1]);
    expect(filterEmployees(rows, { ...emptyFilters, employmentType: "Contract" }, TODAY).map((e) => e.id)).toEqual([2]);
    expect(filterEmployees(rows, { ...emptyFilters, category: "WORKER" }, TODAY).map((e) => e.id)).toEqual([1]);
    expect(filterEmployees(rows, { ...emptyFilters, chips: ["probation"] }, TODAY).map((e) => e.id)).toEqual([2]);
  });
  it("matches text values without caring about case and searches last name and email", () => {
    expect(distinctValues(rows, "gender")).toEqual(["male"]);
    expect(filterEmployees(rows, { ...emptyFilters, gender: "MALE" }, TODAY).map((e) => e.id)).toEqual([1, 2]);
    expect(filterEmployees(rows, { ...emptyFilters, search: "hossain" }, TODAY).map((e) => e.id)).toEqual([1]);
    expect(filterEmployees(rows, { ...emptyFilters, search: "r@x" }, TODAY).map((e) => e.id)).toEqual([1]);
  });
  it("counts exactly 30 days as new", () => {
    expect(joinedWithinDays(emp({ joining_date: "2026-10-10" }), 30, TODAY)).toBe(true);
    expect(joinedWithinDays(emp({ joining_date: "2026-10-09" }), 30, TODAY)).toBe(false);
  });
});

describe("addMonths", () => {
  it("clamps to the month end instead of rolling over", () => {
    const d = addMonths(new Date(2026, 0, 31), 1);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 1, 28]);
  });
});

describe("fetchAllPages", () => {
  it("stops at a short page and removes duplicate ids", async () => {
    const pages: Record<number, { id: number }[]> = { 0: [{ id: 1 }, { id: 2 }], 2: [{ id: 2 }] };
    const fetchPage = vi.fn((_limit: number, offset: number) => Promise.resolve(pages[offset] ?? []));
    const result = await fetchAllPages(fetchPage, 2, 5);
    expect(result).toEqual({ rows: [{ id: 1 }, { id: 2 }], truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
  it("reports truncation only when more rows exist past the cap", async () => {
    const full = vi.fn((limit: number, offset: number) =>
      Promise.resolve(Array.from({ length: limit }, (_, i) => ({ id: offset + i }))),
    );
    expect((await fetchAllPages(full, 2, 2)).truncated).toBe(true);
    const exact = vi.fn((limit: number, offset: number) =>
      Promise.resolve(offset >= 4 ? [] : Array.from({ length: limit }, (_, i) => ({ id: offset + i }))),
    );
    const result = await fetchAllPages(exact, 2, 2);
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(4);
  });
});

describe("sortEmployees", () => {
  it("sorts by code numerically and puts blanks last", () => {
    const rows = [emp({ id: 1, employee_code: "EMP-10" }), emp({ id: 2, employee_code: "EMP-2" })];
    expect(sortEmployees(rows, "code", "asc", () => "").map((e) => e.id)).toEqual([2, 1]);
    const dated = [emp({ id: 1, joining_date: null }), emp({ id: 2, joining_date: "2025-01-01" })];
    expect(sortEmployees(dated, "joining", "desc", () => "").map((e) => e.id)).toEqual([2, 1]);
  });
});
