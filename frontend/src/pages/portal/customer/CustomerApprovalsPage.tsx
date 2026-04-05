import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { customerPortalApi } from "@/hooks/useCustomerPortal";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Badge } from "@/components/ui/badge";

type Row = {
  order_id: number;
  order_code: string;
  id: number;
  title: string;
  phase: string;
  status: string;
  planned_date?: string | null;
};

export function CustomerApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoading(true);
      try {
        const r = (await customerPortalApi.approvalsAll()) as Row[];
        if (ok) setRows(r);
      } catch (e) {
        if (ok) setErr(e instanceof Error ? e.message : "Failed");
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div>
      <AppPageHeader title="Approvals" description="Items waiting on approval or in progress." />
      {loading ? <p className="text-sm text-text-muted py-8">Loading approvals…</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="text-sm text-text-muted py-8">No pending approval steps.</p>
      ) : !loading ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={`${r.order_id}-${r.id}`} className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link className="font-medium text-brand-primary hover:underline" to={`/portal/customer/orders/${r.order_id}`}>
                  {r.order_code}
                </Link>
                <Badge variant="warning">{r.status}</Badge>
              </div>
              <p className="text-sm text-text-primary mt-2">{r.title}</p>
              <p className="text-xs text-text-muted mt-1">
                Phase: {r.phase}
                {r.planned_date ? ` · Planned ${r.planned_date}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
