import { EmployeeBiometricsPanel } from "@/components/hr/bd/EmployeeBiometricsPanel";
import { EmployeePhotoCapture } from "@/components/hr/bd/EmployeePhotoCapture";
import type { RecordTabProps } from "./shared";

export function IdentityTab({ employee, onPhotoChanged }: RecordTabProps & { onPhotoChanged: (hasPhoto: boolean) => void }) {
  return (
    <div className="space-y-4">
      <EmployeePhotoCapture employeeId={employee.id} hasPhoto={Boolean(employee.has_photo)} onChanged={onPhotoChanged} />
      <EmployeeBiometricsPanel employeeId={employee.id} />
    </div>
  );
}
