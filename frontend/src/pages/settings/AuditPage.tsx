import { useEffect, useState } from "react";
import { api, type AuditLogResponse } from "@/api/client";

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAuditLogs({ limit: 50 })
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading audit log…</p>;
  if (error) return <p style={{ color: "#dc2626" }}>{error}</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Audit log</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
            <th style={{ padding: 8 }}>Time</th>
            <th style={{ padding: 8 }}>Action</th>
            <th style={{ padding: 8 }}>Resource</th>
            <th style={{ padding: 8 }}>Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: 8 }}>{new Date(log.created_at).toLocaleString()}</td>
              <td style={{ padding: 8 }}>{log.action}</td>
              <td style={{ padding: 8 }}>{log.resource ?? "—"}</td>
              <td style={{ padding: 8 }}>{log.details ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
