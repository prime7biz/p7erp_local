import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type FacilityRow, type FacilityUtilizationRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function FacilityDetailPage() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const id = Number(facilityId);
  const [fac, setFac] = useState<FacilityRow | null>(null);
  const [utils, setUtils] = useState<FacilityUtilizationRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void (async () => {
      setLoading(true);
      try {
        const r = await api.getFacility(id);
        setFac(r.facility);
        setUtils(r.utilizations);
        setErr("");
      } catch (e) {
        logApiError("FacilityDetailPage.load", e);
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (!Number.isFinite(id)) return <p className="text-sm text-red-600">Invalid facility</p>;

  return (
    <div className="space-y-6">
      <Link to="/app/finance/facilities" className="text-sm text-brand-primary">
        ← All facilities
      </Link>
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : fac ? (
        <>
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <h1 className="text-xl font-semibold text-text-primary">{String(fac.facility_code)}</h1>
            <p className="text-sm text-text-muted">
              {String(fac.facility_type)} · {String(fac.status)} · Sanctioned {String(fac.currency)}{" "}
              {typeof fac.sanctioned_amount === "number" ? fac.sanctioned_amount.toLocaleString() : "—"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={`/app/finance/facilities/${id}/utilizations/new`}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white"
              >
                New utilization
              </Link>
              <Link to={`/app/accounts/vouchers`} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                Open vouchers
              </Link>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-text-primary">Utilizations</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-surface-base text-xs text-text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Principal</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {utils.map((u) => (
                    <tr key={u.id} className="border-b border-border">
                      <td className="px-3 py-2">
                        <Link className="text-brand-primary hover:underline" to={`/app/finance/utilizations/${u.id}`}>
                          {String(u.utilization_code ?? u.id)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{String(u.principal_amount ?? "—")}</td>
                      <td className="px-3 py-2">{String(u.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {utils.length === 0 ? <p className="p-3 text-sm text-text-muted">No utilizations yet.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
