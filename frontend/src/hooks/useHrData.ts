import { useCallback, useEffect, useState } from "react";
import { api, type HrDepartmentResponse, type HrDesignationResponse, type HrEmployeeResponse } from "@/api/client";

/** Load departments, designations, and employees for HR forms (cached per mount). */
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
        api.listHrDepartments({ active_only: false }),
        api.listHrDesignations({ active_only: false }),
        api.listHrEmployees({ active_only: activeEmployeesOnly }),
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
