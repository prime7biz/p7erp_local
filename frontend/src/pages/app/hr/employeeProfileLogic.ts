/**
 * Pure helpers for the read-only employee information center (no React, easy to unit test).
 */
import type { HrEmployeeOverview, HrEmployeeResponse } from "@/api/models";

export const UNDEFINED_LABEL = "Undefined";
export const HIDDEN_LABEL = "Hidden for your role";

export type ProfileTab =
  | "summary"
  | "leave"
  | "attendance"
  | "discipline"
  | "salary"
  | "bonuses"
  | "payslips"
  | "documents"
  | "history";

export const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "leave", label: "Leave" },
  { id: "attendance", label: "Attendance & late" },
  { id: "discipline", label: "Discipline" },
  { id: "salary", label: "Salary & increments" },
  { id: "bonuses", label: "Bonuses & allowances" },
  { id: "payslips", label: "Payslips" },
  { id: "documents", label: "Documents" },
  { id: "history", label: "History" },
];

/** Shown value for an empty field: "—" (or the given fallback); masked fields say so. */
export function show(value: string | number | null | undefined, opts: { masked?: boolean; fallback?: string } = {}): string {
  if (opts.masked) return HIDDEN_LABEL;
  if (value === null || value === undefined || String(value).trim() === "") return opts.fallback ?? "—";
  return String(value);
}

/** "0.5000" -> "0.5", "11.0000" -> "11" (days and plain decimals). */
export function trimDecimal(value: string | null | undefined): string {
  if (!value) return "0";
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  const [whole = "0", frac = ""] = value.split(".");
  const f = frac.replace(/0+$/, "");
  return f ? `${whole}.${f}` : whole;
}

/** Money for display with thousand separators; the API value stays the source. */
export function money(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fullName(e: Pick<HrEmployeeResponse, "first_name" | "last_name">): string {
  return [e.first_name, e.last_name].filter(Boolean).join(" ");
}

export function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}

export function isShown<T extends { allowed: boolean }>(block: T): block is Extract<T, { allowed: true }> {
  return block.allowed === true;
}

export type TimelineEvent = { date: string; kind: string; text: string };

/** One list of every dated event, newest first (ties keep a stable kind order). */
export function buildTimeline(o: HrEmployeeOverview, e: Pick<HrEmployeeResponse, "joining_date" | "confirmation_date" | "exit_date">): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const add = (date: string | null | undefined, kind: string, text: string) => {
    if (date) out.push({ date: date.slice(0, 10), kind, text });
  };
  add(e.joining_date, "Joining", "Joined the company");
  add(e.confirmation_date, "Confirmation", "Confirmed (probation ended)");
  add(e.exit_date, "Exit", "Exit date");
  if (isShown(o.leave)) {
    for (const r of o.leave.requests) add(r.from_date, "Leave", `${r.leave_type_name}: ${trimDecimal(r.days)} day(s), ${r.status}`);
  }
  if (isShown(o.attendance)) {
    for (const l of o.attendance.recent_late) add(l.date, "Late", `Late by ${l.late_minutes} min`);
  }
  if (isShown(o.discipline)) {
    for (const c of o.discipline.cases) add(c.issue_date, "Discipline", `${c.case_type.replace("_", " ")}: ${c.subject} (${c.status})`);
  }
  if (isShown(o.salary)) {
    for (const s of o.salary.history) add(s.effective_from, "Salary", `${s.change_type ?? "Salary"}: basic ${money(s.basic)} (${s.structure_code})`);
  }
  if (isShown(o.gate_passes)) {
    for (const p of o.gate_passes.passes) add(p.valid_from, "Gate pass", `${p.pass_code} (${p.status})`);
  }
  if (isShown(o.separations)) {
    for (const s of o.separations.separations) add(s.request_date, "Separation", `${s.separation_type} (${s.status})`);
  }
  if (isShown(o.status_history)) {
    for (const s of o.status_history.entries) add(s.effective_date, "Status", s.remarks ? `${s.status}: ${s.remarks}` : s.status);
  }
  return out.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

/** Read a Blob as a data: URL so the photo also prints reliably (blob: URLs can be blank in print preview). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the photo"));
    reader.readAsDataURL(blob);
  });
}
