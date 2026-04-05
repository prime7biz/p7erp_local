import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import type { ExternalAuditRow } from "@/types/externalAccess";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

export function ExternalAccessAuditPage() {
  const [rows, setRows] = useState<ExternalAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await api.listExternalAccessAudit({ limit: 100 });
        if (ok) {
          setRows(r.items);
          setTotal(r.total);
        }
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  return (
    <div>
      <AppPageHeader title="External access audit" description={`${total} events (portal + admin actions).`} />
      <p className="text-sm mb-4">
        <Link to="/app/settings/external-access" className="text-brand-primary">
          ← Overview
        </Link>
      </p>
      {err ? <div className={listPageErrorClass}>{err}</div> : null}
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={listTableHeadCellClass}>When</th>
            <th className={listTableHeadCellClass}>Action</th>
            <th className={listTableHeadCellClass}>Resource</th>
            <th className={listTableHeadCellClass}>Principal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={listTableRowClass}>
              <td className="px-3 py-2 text-text-muted whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-3 py-2">{r.action}</td>
              <td className="px-3 py-2 text-xs">
                {r.resource_type} {r.resource_id != null ? `#${r.resource_id}` : ""}
              </td>
              <td className="px-3 py-2 text-xs text-text-muted">{r.external_principal_id ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
