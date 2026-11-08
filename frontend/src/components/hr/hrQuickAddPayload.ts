/**
 * Pure helpers for HR master quick-add (department / designation / section).
 *
 * Codes are never sent on create: the backend assigns them automatically.
 * Kept free of React so it is easy to unit test.
 */
import type { HrDepartmentCreate, HrDesignationCreate } from "@/api/models";

export type HrMasterKind = "department" | "designation" | "section";

/** Minimum valid body for POST /api/v1/hr/sections (matches HrSectionsPage). */
export type HrSectionQuickCreate = {
  name: string;
  section_type: "SECTION";
  is_active: true;
};

export const HR_MASTER_LABELS: Record<HrMasterKind, string> = {
  department: "department",
  designation: "designation",
  section: "section",
};

/** Returns an error message, or "" when the name is acceptable. */
export function validateQuickAddName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required.";
  if (trimmed.length > 128) return "Name must be 128 characters or fewer.";
  return "";
}

export function buildDepartmentQuickPayload(name: string): HrDepartmentCreate {
  return { name: name.trim(), is_active: true };
}

export function buildDesignationQuickPayload(
  title: string,
  departmentId: number | null | undefined,
): HrDesignationCreate {
  return {
    title: title.trim(),
    department_id: departmentId ?? null,
    is_active: true,
  };
}

export function buildSectionQuickPayload(name: string): HrSectionQuickCreate {
  return { name: name.trim(), section_type: "SECTION", is_active: true };
}

/**
 * Prepares a full-page create/edit payload.
 * - Create: `code` is always dropped (backend assigns it).
 * - Edit: `code` is kept only when non-blank (backend PATCH accepts it, min length 1).
 */
export function prepareHrMasterPayload<T extends { code?: string | null }>(
  form: T,
  isEditing: boolean,
): T {
  const next = { ...form };
  const code = typeof next.code === "string" ? next.code.trim() : "";
  if (isEditing && code) {
    next.code = code;
  } else {
    delete next.code;
  }
  return next;
}
