import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

export function FacilityCreatePage() {
  const nav = useNavigate();
  const [principals, setPrincipals] = useState<{ id: number; full_name: string | null; email: string | null }[]>([]);
  const [err, setErr] = useState("");
  const [facilityType, setFacilityType] = useState("term_loan");
  const [financierPartyId, setFinancierPartyId] = useState("");
  const [financierName, setFinancierName] = useState("");
  const [sanctioned, setSanctioned] = useState("1000000");
  const [currency, setCurrency] = useState("BDT");
  const [interestRate, setInterestRate] = useState("12");
  const [interestType, setInterestType] = useState("reducing_balance");
  const [liabilityGl, setLiabilityGl] = useState("");
  const [expenseGl, setExpenseGl] = useState("");
  const [payableGl, setPayableGl] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setPrincipals(await api.listFinancierPrincipalsForFacility());
      } catch (e) {
        logApiError("FacilityCreatePage.principals", e);
      }
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const pid = financierPartyId.trim() ? Number(financierPartyId) : null;
      const body: Record<string, unknown> = {
        facility_type: facilityType,
        financier_name: financierName.trim() || null,
        sanctioned_amount: Number(sanctioned) || 0,
        currency,
        interest_rate: Number(interestRate) || 0,
        interest_type: interestType,
      };
      if (pid != null && Number.isFinite(pid)) body.financier_party_id = pid;
      if (liabilityGl.trim()) body.gl_liability_account_id = Number(liabilityGl);
      if (expenseGl.trim()) body.gl_interest_expense_account_id = Number(expenseGl);
      if (payableGl.trim()) body.gl_interest_payable_account_id = Number(payableGl);
      const fac = await api.createFacility(body);
      nav(`/app/finance/facilities/${fac.id}`);
    } catch (e) {
      logApiError("FacilityCreatePage.submit", e);
      setErr((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/app/finance/facilities" className="text-sm text-brand-primary">
          ← All facilities
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-text-primary">New facility</h1>
        <p className="text-sm text-text-muted">Create a draft line; add GL accounts before activating utilizations.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
        <label className="block text-sm">
          <span className="text-text-muted">Facility type</span>
          <select
            className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
            value={facilityType}
            onChange={(e) => setFacilityType(e.target.value)}
          >
            <option value="term_loan">term_loan</option>
            <option value="working_capital">working_capital</option>
            <option value="btb_lc_facility">btb_lc_facility</option>
            <option value="overdraft">overdraft</option>
            <option value="one_time_settlement">one_time_settlement</option>
            <option value="custom">custom</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Financier (external principal)</span>
          <select
            className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
            value={financierPartyId}
            onChange={(e) => setFinancierPartyId(e.target.value)}
          >
            <option value="">— None —</option>
            {principals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email || p.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-text-muted">Financier display name</span>
          <input
            className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
            value={financierName}
            onChange={(e) => setFinancierName(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Sanctioned amount</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={sanctioned}
              onChange={(e) => setSanctioned(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Currency</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Interest % (annual)</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Interest type</span>
            <select
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={interestType}
              onChange={(e) => setInterestType(e.target.value)}
            >
              <option value="reducing_balance">reducing_balance</option>
              <option value="flat">flat</option>
              <option value="fixed">fixed</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-text-muted">Chart of accounts IDs (from your COA):</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-text-muted">Liability GL</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={liabilityGl}
              onChange={(e) => setLiabilityGl(e.target.value.replace(/\D/g, ""))}
              placeholder="id"
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Interest expense GL</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={expenseGl}
              onChange={(e) => setExpenseGl(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Interest payable GL</span>
            <input
              className={`mt-1 w-full rounded-lg border border-border px-3 py-2 ${erpControlFocusClass}`}
              value={payableGl}
              onChange={(e) => setPayableGl(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white">
          Save draft facility
        </button>
      </form>
    </div>
  );
}
