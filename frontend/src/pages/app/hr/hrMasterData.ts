/**
 * Load complete HR master lists. The list endpoints return at most 500 rows per call
 * (100 by default), so these page through until everything is loaded.
 */
import { api } from "@/api/client";
import { fetchAllPages } from "./hrEmployeesListLogic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;

export async function fetchAllHrDepartments(opts?: { activeOnly?: boolean }) {
  const { rows } = await fetchAllPages(
    (limit, offset) => api.listHrDepartments({ active_only: opts?.activeOnly ?? false, limit, offset }),
    PAGE_SIZE,
    MAX_PAGES,
  );
  return rows;
}

export async function fetchAllHrDesignations(opts?: { activeOnly?: boolean }) {
  const { rows } = await fetchAllPages(
    (limit, offset) => api.listHrDesignations({ active_only: opts?.activeOnly ?? false, limit, offset }),
    PAGE_SIZE,
    MAX_PAGES,
  );
  return rows;
}

/** Every employee (not only the first 100). Use for screens that really need the whole list. */
export async function fetchAllHrEmployees(opts?: { activeOnly?: boolean }) {
  const { rows } = await fetchAllPages(
    (limit, offset) => api.listHrEmployees({ active_only: opts?.activeOnly ?? false, limit, offset }),
    PAGE_SIZE,
    MAX_PAGES,
  );
  return rows;
}
