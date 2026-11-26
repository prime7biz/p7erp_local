import { useCallback, useEffect, useState } from "react";
import type { HrDepartmentResponse, HrDesignationResponse, HrEmployeeResponse } from "@/api/client";
import { fetchAllHrDepartments, fetchAllHrDesignations, fetchAllHrEmployees } from "@/pages/app/hr/hrMasterData";

/** Load departments, designations, and employees for HR forms (every row, loaded page by page). */
export function useHrMasters(activeEmployeesOnly = true) {
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [employees, setEmployees] = useState<HrEmployeeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, g, e] = await Promise.all([
        fetchAllHrDepartments(),
        fetchAllHrDesignations(),
        fetchAllHrEmployees({ activeOnly: activeEmployeesOnly }),
      ]);
      setDepartments(d);
      setDesignations(g);
      setEmployees(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load HR masters");
    } finally {
      setLoading(false);
    }
  }, [activeEmployeesOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { departments, designations, employees, loading, error, refresh };
}
