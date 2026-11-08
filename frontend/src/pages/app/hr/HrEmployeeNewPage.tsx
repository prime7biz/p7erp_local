import { Navigate } from "react-router-dom";
import { EmployeeWorkspace } from "@/components/hr/workspace/EmployeeWorkspace";
import { useAuth } from "@/context/AuthContext";

/** /app/hr/employees/new — the unified add-employee workspace (tenant flag `hr_onboarding_workspace_v2`). */
export function HrEmployeeNewPage() {
  const { me } = useAuth();
  if (me?.feature_flags?.hr_onboarding_workspace_v2 !== true) return <Navigate to="/app/hr/employees" replace />;
  return <EmployeeWorkspace mode="create" />;
}
