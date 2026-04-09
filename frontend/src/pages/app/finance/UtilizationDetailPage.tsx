import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type FacilityUtilizationRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function rowClass(status: string) {
  if (status === "paid") return "bg-emerald-50";
  if (status === "overdue") return "bg-red-50";
  if (status === "due" || status === "partially_paid") return "bg-amber-50";
  return "bg-surface-base";
}

export function UtilizationDetailPage() {
  const { utilizationId } = useParams<{ utilizationId: string }>();
  const id = Number(utilizationId);
  const [util, setUtil] = useState<FacilityUtilizationRow | null>(null);
  const [schedule, setSchedule] = useState<Record<string, unknown>[]>([]);
  const [facilityId, setFacilityId] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void (async () => {
      try {
        const r = await api.getFacilityUtilization(id);
        setUtil(r.utilization);
        setSchedule(r.schedule);
        const fid = r.facility && typeof (r.facility as { id?: number }).id === "number" ? (r.facility as { id: number }).id : null;
        setFacilityId(fid);
        setErr("");
      } catch (e) {
        logApiError("UtilizationDetailPage.load", e);
        setErr((e as Error).message);
      }
    })();
  }, [id]);

  async function activate() {
    if (!Number.isFinite(id)) return;
    setBusy(true);
    try {
      const activateRes = await api.activateFacilityUtilization(id);
      const vid = (activateRes as { disbursement_voucher_id?: number }).disbursement_voucher_id;
      if (vid) window.alert(`Disbursement draft voucher #${vid} created. Post it from Vouchers to draw down.`);
      const detail = await api.getFacilityUtilization(id);
      setUtil(detail.utilization);
      setSchedule(detail.schedule);
    } catch (e) {
      logApiError("UtilizationDetailPage.activate", e);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!Number.isFinite(id)) return <p className="text-sm text-red-600">Invalid utilization</p>;

  return (
    <div className="space-y-6">
      {facilityId != null ? (
        <Link to={`/app/finance/facilities/${facilityId}`} className="text-sm text-brand-primary">
          ← Facility
        </Link>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {util ? (
        <>
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <h1 className="text-xl font-semibold">{String(util.utilization_code)}</h1>
            <p className="text-sm text-text-muted">
              Status {String(util.status)} · Principal {String(util.principal_amount)} · Outstanding{" "}
              {String(util.outstanding_principal)}
            </p>
            {String(util.status) === "draft" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void activate()}
                className="mt-3 rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Create disbursement draft &amp; activate
              </button>
            ) : null}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Repayment schedule</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-xs text-text-muted">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Due</th>
                    <th className="px-2 py-2">EMI</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((ln) => (
                    <tr
                      key={String(ln.id ?? ln.installment_number)}
                      className={`border-b border-border ${rowClass(String(ln.status ?? ""))}`}
                    >
                      <td className="px-2 py-1">{String(ln.installment_number ?? "")}</td>
                      <td className="px-2 py-1">{String(ln.due_date ?? "")}</td>
                      <td className="px-2 py-1">{String(ln.emi_amount ?? "")}</td>
                      <td className="px-2 py-1">{String(ln.status ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        !err && <p className="text-sm text-text-muted">Loading…</p>
      )}
    </div>
  );
}
