/**
 * Load complete HR master lists. The list endpoints return at most 500 rows per call
 * (100 by default), so these page through until everything is loaded.
 */
import { api } from "@/api/client";
import { fetchAllPages } from "./hrEmployeesListLogic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;

export async function fetchAllHrDepartments() {
  const { rows } = await fetchAllPages(
    (limit, offset) => api.listHrDepartments({ active_only: false, limit, offset }),
    PAGE_SIZE,
    MAX_PAGES,
  );
  return rows;
}

export async function fetchAllHrDesignations() {
  const { rows } = await fetchAllPages(
    (limit, offset) => api.listHrDesignations({ active_only: false, limit, offset }),
    PAGE_SIZE,
    MAX_PAGES,
  );
  return rows;
}
