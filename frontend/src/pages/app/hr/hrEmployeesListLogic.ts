/**
 * Pure helpers for the HR Employees list page (filters, quick chips, stats, sorting).
 * No React here, so everything is easy to unit test.
 */
import type { HrEmployeeResponse } from "@/api/models";

export type StatusFilter = "active" | "inactive" | "all";

export type QuickChip = "probation" | "new30" | "noDepartment" | "noUser" | "hasPhoto";

export const QUICK_CHIPS: { id: QuickChip; label: string }[] = [
  { id: "probation", label: "On probation" },
  { id: "new30", label: "Joined last 30 days" },
  { id: "noDepartment", label: "No department" },
  { id: "noUser", label: "No linked app user" },
  { id: "hasPhoto", label: "Has photo" },
];

export interface EmployeeFilters {
  search: string;
  status: StatusFilter;
  departmentId: number | null;
  designationId: number | null;
  sectionId: number | null;
  employmentType: string;
  category: string;
  gender: string;
  chips: QuickChip[];
}

export const emptyFilters: EmployeeFilters = {
  search: "",
  status: "active",
  departmentId: null,
  designationId: null,
  sectionId: null,
  employmentType: "",
  category: "",
  gender: "",
  chips: [],
};

/** Number of filters that differ from the defaults (shown next to "Clear filters"). */
export function activeFilterCount(f: EmployeeFilters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.status !== emptyFilters.status) n++;
  if (f.departmentId != null) n++;
  if (f.designationId != null) n++;
  if (f.sectionId != null) n++;
  if (f.employmentType) n++;
  if (f.category) n++;
  if (f.gender) n++;
  return n + f.chips.length;
}

export function fullName(e: Pick<HrEmployeeResponse, "first_name" | "last_name">): string {
  return [e.first_name, e.last_name].filter(Boolean).join(" ");
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Parse a "YYYY-MM-DD" date as a local calendar date (avoids timezone shifts). */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 31 Jan + 1 month = 28/29 Feb (clamped to the month end, never rolls into March). */
export function addMonths(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-01" -> "01 Nov 2026"; empty when unknown. */
export function formatShortDate(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

/** Tenure since joining, e.g. "2y 3m", "5m", "12d". Empty when unknown or in the future. */
export function formatTenure(joiningDate: string | null | undefined, today: Date = new Date()): string {
  const start = parseDate(joiningDate);
  if (!start) return "";
  const now = startOfDay(today);
  if (start > now) return "";
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 1) {
    const days = Math.round((now.getTime() - start.getTime()) / 86_400_000);
    return `${days}d`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest}m`;
  return rest === 0 ? `${years}y` : `${years}y ${rest}m`;
}

/**
 * Active employee still inside probation: a future confirmation date, or (with no
 * confirmation date) joining date + probation months is still ahead.
 */
export function isOnProbation(e: HrEmployeeResponse, today: Date = new Date()): boolean {
  if (!e.is_active) return false;
  const now = startOfDay(today);
  const confirmation = parseDate(e.confirmation_date);
  if (confirmation) return confirmation > now;
  const joining = parseDate(e.joining_date);
  if (!joining || !e.probation_months || e.probation_months <= 0) return false;
  return addMonths(joining, e.probation_months) > now;
}

export function joinedWithinDays(e: HrEmployeeResponse, days: number, today: Date = new Date()): boolean {
  const joining = parseDate(e.joining_date);
  if (!joining) return false;
  const now = startOfDay(today);
  const diff = (now.getTime() - joining.getTime()) / 86_400_000;
  return diff >= 0 && diff <= days;
}

function sameText(a: string | null | undefined, b: string): boolean {
  return (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();
}

/** Sorted distinct non-empty values of a text field (case-insensitive), for drop-down options. */
export function distinctValues(rows: HrEmployeeResponse[], key: "employment_type" | "employee_category" | "gender"): string[] {
  const byLower = new Map<string, string>();
  for (const r of rows) {
    const v = r[key]?.trim();
    if (v && !byLower.has(v.toLowerCase())) byLower.set(v.toLowerCase(), v);
  }
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

function matchesChip(e: HrEmployeeResponse, chip: QuickChip, today: Date): boolean {
  switch (chip) {
    case "probation":
      return isOnProbation(e, today);
    case "new30":
      return joinedWithinDays(e, 30, today);
    case "noDepartment":
      return e.department_id == null;
    case "noUser":
      return e.user_id == null;
    case "hasPhoto":
      return Boolean(e.has_photo);
  }
}

export function filterEmployees(rows: HrEmployeeResponse[], f: EmployeeFilters, today: Date = new Date()): HrEmployeeResponse[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((e) => {
    if (f.status === "active" && !e.is_active) return false;
    if (f.status === "inactive" && e.is_active) return false;
    if (f.departmentId != null && e.department_id !== f.departmentId) return false;
    if (f.designationId != null && e.designation_id !== f.designationId) return false;
    if (f.sectionId != null && e.section_id !== f.sectionId) return false;
    if (f.employmentType && !sameText(e.employment_type, f.employmentType)) return false;
    if (f.category && !sameText(e.employee_category, f.category)) return false;
    if (f.gender && !sameText(e.gender, f.gender)) return false;
    for (const chip of f.chips) {
      if (!matchesChip(e, chip, today)) return false;
    }
    if (q) {
      const haystack = [e.employee_code, fullName(e), e.email, e.phone].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export interface EmployeeStats {
  total: number;
  active: number;
  inactive: number;
  departments: number;
  onProbation: number;
  newLast30: number;
}

export function computeStats(rows: HrEmployeeResponse[], today: Date = new Date()): EmployeeStats {
  const departments = new Set<number>();
  let active = 0;
  let onProbation = 0;
  let newLast30 = 0;
  for (const e of rows) {
    if (e.is_active) active++;
    if (e.department_id != null) departments.add(e.department_id);
    if (isOnProbation(e, today)) onProbation++;
    if (joinedWithinDays(e, 30, today)) newLast30++;
  }
  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    departments: departments.size,
    onProbation,
    newLast30,
  };
}

/**
 * Load every page from an offset-paged endpoint. Rows are de-duplicated by id (records can
 * shift between pages while loading). `truncated` is true only when rows exist past `maxPages`.
 */
export async function fetchAllPages<T extends { id: number }>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  pageSize: number,
  maxPages: number,
): Promise<{ rows: T[]; truncated: boolean }> {
  const byId = new Map<number, T>();
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage(pageSize, page * pageSize);
    for (const row of batch) if (!byId.has(row.id)) byId.set(row.id, row);
    if (batch.length < pageSize) return { rows: [...byId.values()], truncated: false };
  }
  const more = await fetchPage(1, maxPages * pageSize);
  return { rows: [...byId.values()], truncated: more.length > 0 };
}

export type SortKey = "code" | "name" | "department" | "joining";
export type SortDir = "asc" | "desc";

export function sortEmployees(
  rows: HrEmployeeResponse[],
  key: SortKey,
  dir: SortDir,
  departmentName: (id: number | null) => string,
): HrEmployeeResponse[] {
  const value = (e: HrEmployeeResponse): string => {
    switch (key) {
      case "code":
        return e.employee_code;
      case "name":
        return fullName(e);
      case "department":
        return departmentName(e.department_id);
      case "joining":
        return e.joining_date ?? "";
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    // Empty values always go last, whichever direction.
    if (!va && vb) return 1;
    if (va && !vb) return -1;
    return sign * va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
  });
}
