import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import type { RecordTabProps } from "./shared";

export function ProductionTab({ employee }: RecordTabProps) {
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof api.getEmployeeProductionProfile>> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setProfile(await api.getEmployeeProductionProfile(employee.id, 30));
      } catch (e) {
        logApiError("ProductionTab.profile", e);
        setProfile(null);
      }
    })();
  }, [employee.id]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-raised p-4 text-sm">
      <p className="font-medium text-text-primary">Production profile</p>
      {!profile ? (
        <p className="text-text-secondary">Loading…</p>
      ) : (
        <>
          <div>
            <p className="text-xs uppercase text-text-muted">Line assignment</p>
            {profile.line_assignment ? (
              <p>
                {profile.line_assignment.line_code} (last crew date {profile.line_assignment.last_date})
              </p>
            ) : (
              <p className="text-text-secondary">No recent line crew assignment.</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase text-text-muted">Skills</p>
            {profile.skills.length === 0 ? (
              <p className="text-text-secondary">No IE skills recorded.</p>
            ) : (
              <ul className="list-disc pl-5">
                {profile.skills.map((s) => (
                  <li key={`${s.operation_code}-${s.skill_level}`}>
                    {s.operation_code} — {s.name} ({s.skill_level})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs uppercase text-text-muted">Attendance trend (30d)</p>
            <p className="text-text-secondary">{profile.attendance_trend.length} days with records</p>
          </div>
        </>
      )}
    </div>
  );
}
