import { useEffect, useState } from "react";
import { getMonitoringAudit } from "@/api/client";

export function AuditLogPage() {
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    getMonitoringAudit(1).then(setData);
  }, []);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Audit log (cross-tenant)</h1>
      <pre className="text-xs bg-white border rounded p-3 overflow-auto max-h-[70vh]">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
