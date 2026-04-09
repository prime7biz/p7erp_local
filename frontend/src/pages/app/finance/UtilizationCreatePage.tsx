import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type EmiPreviewResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function UtilizationCreatePage() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const fid = Number(facilityId);
  const nav = useNavigate();
  const [principal, setPrincipal] = useState("500000");
  const [numInst, setNumInst] = useState("12");
  const [policy, setPolicy] = useState("emi_reducing");
  const [rate, setRate] = useState("12");
  const [moratorium, setMoratorium] = useState("0");
  const [freq, setFreq] = useState("monthly");
  const [disbDate, setDisbDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<EmiPreviewResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const p = await api.calculateFacilityEmi({
            principal: Number(principal) || 0,
            annual_interest_rate_percent: Number(rate) || 0,
            repayment_policy: policy,
            num_installments: Number(numInst) || undefined,
            installment_frequency: freq,
            moratorium_months: Number(moratorium) || 0,
            interest_type: policy === "flat_interest" ? "flat" : "reducing_balance",
          });
          setPreview(p);
        } catch (e) {
          logApiError("UtilizationCreatePage.preview", e);
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [principal, numInst, policy, rate, moratorium, freq]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(fid)) return;
    setErr("");
    try {
      const u = await api.createFacilityUtilization(fid, {
        principal_amount: Number(principal) || 0,
        repayment_policy: policy,
        num_installments: Number(numInst) || null,
        installment_frequency: freq,
        moratorium_months: Number(moratorium) || 0,
        interest_rate: Number(rate) || 0,
        disbursement_date: disbDate,
        first_repayment_date: disbDate,
      });
      nav(`/app/finance/utilizations/${u.id}`);
    } catch (e) {
      logApiError("UtilizationCreatePage.submit", e);
      setErr((e as Error).message);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
      <div>
        <Link to={`/app/finance/facilities/${facilityId}`} className="text-sm text-brand-primary">
          ← Facility
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-text-primary">New utilization</h1>
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-border bg-surface-raised p-4">
          <label className="block text-sm">
            <span className="text-text-muted">Principal</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Annual rate %</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Repayment policy</span>
            <select
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
            >
              <option value="emi_reducing">emi_reducing</option>
              <option value="flat_interest">flat_interest</option>
              <option value="one_time_settlement">one_time_settlement</option>
              <option value="manual_schedule">manual_schedule</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-text-muted">Installments</span>
              <input
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
                value={numInst}
                onChange={(e) => setNumInst(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Frequency</span>
              <select
                className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
                value={freq}
                onChange={(e) => setFreq(e.target.value)}
              >
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-text-muted">Moratorium months</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={moratorium}
              onChange={(e) => setMoratorium(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Disbursement date</span>
            <input
              type="date"
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={disbDate}
              onChange={(e) => setDisbDate(e.target.value)}
            />
          </label>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm text-white">
            Create draft utilization
          </button>
        </form>
      </div>
      <div className="rounded-xl border border-dashed border-border bg-surface-base p-4">
        <h2 className="text-sm font-semibold text-text-primary">Live EMI preview</h2>
        <pre className="mt-2 max-h-[480px] overflow-auto text-xs text-text-muted">
          {preview ? JSON.stringify(preview, null, 2) : "…"}
        </pre>
      </div>
    </div>
  );
}
