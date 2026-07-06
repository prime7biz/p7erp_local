import { useCallback, useEffect, useState } from "react";

import {
  api,
  type BondedWarehouseEntryRow,
  type PayrollStatutoryCalcResponse,
  type StatutoryTaxConfigRow,
  type StatutoryTaxLineCalcResponse,
} from "@/api/client";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";
import { Button } from "@/components/ui/button";

type ComplianceTab = "tax" | "bonded" | "payroll";

const TAX_PRESETS = ["VAT", "VDS", "TDS"] as const;

export function StatutoryCompliancePage() {
  const [tab, setTab] = useState<ComplianceTab>("tax");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [taxRows, setTaxRows] = useState<StatutoryTaxConfigRow[]>([]);
  const [taxForm, setTaxForm] = useState({
    tax_code: "VAT",
    rate_pct: "15",
    registration_no: "",
    is_active: true,
    notes: "",
  });
  const [taxSaving, setTaxSaving] = useState(false);

  const [lineAmount, setLineAmount] = useState("1000");
  const [applyVat, setApplyVat] = useState(true);
  const [applyVds, setApplyVds] = useState(false);
  const [applyTds, setApplyTds] = useState(false);
  const [lineCalc, setLineCalc] = useState<StatutoryTaxLineCalcResponse | null>(null);
  const [lineCalcBusy, setLineCalcBusy] = useState(false);

  const [bondedRows, setBondedRows] = useState<BondedWarehouseEntryRow[]>([]);
  const [bondedForm, setBondedForm] = useState({
    reference_no: "",
    entry_type: "IMPORT",
    ud_no: "",
    up_no: "",
    item_description: "",
    quantity: "",
    value_bdt: "",
    status: "OPEN",
    entry_date: "",
    notes: "",
  });
  const [bondedSaving, setBondedSaving] = useState(false);

  const [payrollForm, setPayrollForm] = useState({
    gross_pay: "50000",
    ait_rate_pct: "0",
    pf_employee_rate_pct: "0",
    pf_employer_rate_pct: "0",
    period_year: new Date().getFullYear(),
    period_month: new Date().getMonth() + 1,
    persist: false,
  });
  const [payrollResult, setPayrollResult] = useState<PayrollStatutoryCalcResponse | null>(null);
  const [payrollBusy, setPayrollBusy] = useState(false);

  const loadTax = useCallback(async () => {
    const data = await api.listStatutoryTaxConfig();
    setTaxRows(data.items ?? []);
  }, []);

  const loadBonded = useCallback(async () => {
    const data = await api.listBondedWarehouseEntries({ limit: 100 });
    setBondedRows(data.items ?? []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadTax(), loadBonded()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, [loadBonded, loadTax]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function saveTaxConfig(e: React.FormEvent) {
    e.preventDefault();
    setTaxSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.upsertStatutoryTaxConfig({
        tax_code: taxForm.tax_code.trim(),
        rate_pct: taxForm.rate_pct.trim(),
        registration_no: taxForm.registration_no.trim() || null,
        is_active: taxForm.is_active,
        notes: taxForm.notes.trim() || null,
      });
      setSuccess(`Saved ${taxForm.tax_code.toUpperCase()} rate.`);
      await loadTax();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tax config");
    } finally {
      setTaxSaving(false);
    }
  }

  async function runLineCalc() {
    setLineCalcBusy(true);
    setError("");
    try {
      const result = await api.calculateStatutoryTaxLine({
        line_amount: lineAmount.trim(),
        apply_vat: applyVat,
        apply_vds: applyVds,
        apply_tds: applyTds,
      });
      setLineCalc(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tax calculation failed");
    } finally {
      setLineCalcBusy(false);
    }
  }

  async function saveBondedEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!bondedForm.reference_no.trim()) {
      setError("Reference number is required.");
      return;
    }
    setBondedSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.createBondedWarehouseEntry({
        reference_no: bondedForm.reference_no.trim(),
        entry_type: bondedForm.entry_type,
        ud_no: bondedForm.ud_no.trim() || null,
        up_no: bondedForm.up_no.trim() || null,
        item_description: bondedForm.item_description.trim() || null,
        quantity: bondedForm.quantity.trim() || null,
        value_bdt: bondedForm.value_bdt.trim() || null,
        status: bondedForm.status,
        entry_date: bondedForm.entry_date || null,
        notes: bondedForm.notes.trim() || null,
      });
      setSuccess("Bonded warehouse entry created.");
      setBondedForm({
        reference_no: "",
        entry_type: "IMPORT",
        ud_no: "",
        up_no: "",
        item_description: "",
        quantity: "",
        value_bdt: "",
        status: "OPEN",
        entry_date: "",
        notes: "",
      });
      await loadBonded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bonded entry");
    } finally {
      setBondedSaving(false);
    }
  }

  async function runPayrollCalc() {
    setPayrollBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api.calculatePayrollStatutory({
        gross_pay: payrollForm.gross_pay.trim(),
        ait_rate_pct: payrollForm.ait_rate_pct.trim(),
        pf_employee_rate_pct: payrollForm.pf_employee_rate_pct.trim(),
        pf_employer_rate_pct: payrollForm.pf_employer_rate_pct.trim(),
        period_year: payrollForm.persist ? payrollForm.period_year : undefined,
        period_month: payrollForm.persist ? payrollForm.period_month : undefined,
        persist: payrollForm.persist,
      });
      setPayrollResult(result);
      if (result.summary_id) {
        setSuccess(`Saved statutory summary #${result.summary_id}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payroll statutory calculation failed");
    } finally {
      setPayrollBusy(false);
    }
  }

  if (loading) return <p>Loading statutory compliance…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Bangladesh statutory compliance</h2>
        <p className="text-sm text-text-muted">
          Configure VAT/VDS/TDS rates, bonded warehouse UD/UP register, and payroll statutory deductions.
        </p>
      </div>

      {error && <div className={listPageErrorClass}>{error}</div>}
      {success && (
        <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          {success}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["tax", "Tax rates"],
            ["bonded", "Bonded warehouse"],
            ["payroll", "Payroll statutory"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === key
                ? "bg-brand-primary text-white"
                : "border border-border text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tax" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={saveTaxConfig} className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
            <h3 className="font-semibold text-text-primary">Tax rate configuration</h3>
            <label className="block text-sm">
              <span className="text-text-muted">Tax code</span>
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={taxForm.tax_code}
                onChange={(e) => setTaxForm((f) => ({ ...f, tax_code: e.target.value }))}
              >
                {TAX_PRESETS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Rate (%)</span>
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={taxForm.rate_pct}
                onChange={(e) => setTaxForm((f) => ({ ...f, rate_pct: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Registration no.</span>
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={taxForm.registration_no}
                onChange={(e) => setTaxForm((f) => ({ ...f, registration_no: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={taxForm.is_active}
                onChange={(e) => setTaxForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Notes</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                rows={2}
                value={taxForm.notes}
                onChange={(e) => setTaxForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <Button type="submit" disabled={taxSaving}>
              {taxSaving ? "Saving…" : "Save tax rate"}
            </Button>
          </form>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-subtle border-b border-border text-left">
                  <tr>
                    <th className={listTableHeadCellClass}>Code</th>
                    <th className={listTableHeadCellClass}>Rate %</th>
                    <th className={listTableHeadCellClass}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {taxRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-text-muted">
                        No tax rates configured yet.
                      </td>
                    </tr>
                  ) : (
                    taxRows.map((r) => (
                      <tr key={r.id} className={listTableRowClass}>
                        <td className="py-2 px-4 font-medium">{r.tax_code}</td>
                        <td className="py-2 px-4">{r.rate_pct}</td>
                        <td className="py-2 px-4">{r.is_active ? "Yes" : "No"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
              <h3 className="font-semibold text-text-primary">Line tax calculator</h3>
              <label className="block text-sm">
                <span className="text-text-muted">Line amount (BDT)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={lineAmount}
                  onChange={(e) => setLineAmount(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applyVat} onChange={(e) => setApplyVat(e.target.checked)} />
                  VAT
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applyVds} onChange={(e) => setApplyVds(e.target.checked)} />
                  VDS
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applyTds} onChange={(e) => setApplyTds(e.target.checked)} />
                  TDS
                </label>
              </div>
              <Button type="button" onClick={() => void runLineCalc()} disabled={lineCalcBusy}>
                {lineCalcBusy ? "Calculating…" : "Calculate"}
              </Button>
              {lineCalc && (
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-text-muted">VAT</dt>
                  <dd>{lineCalc.vat_amount}</dd>
                  <dt className="text-text-muted">VDS</dt>
                  <dd>{lineCalc.vds_amount}</dd>
                  <dt className="text-text-muted">TDS</dt>
                  <dd>{lineCalc.tds_amount}</dd>
                  <dt className="text-text-muted">Total tax</dt>
                  <dd className="font-semibold">{lineCalc.total_tax}</dd>
                  <dt className="text-text-muted">Gross with tax</dt>
                  <dd className="font-semibold">{lineCalc.gross_with_tax}</dd>
                </dl>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "bonded" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={saveBondedEntry} className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
            <h3 className="font-semibold text-text-primary">New bonded entry</h3>
            <label className="block text-sm">
              <span className="text-text-muted">Reference no.</span>
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={bondedForm.reference_no}
                onChange={(e) => setBondedForm((f) => ({ ...f, reference_no: e.target.value }))}
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-text-muted">UD no.</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={bondedForm.ud_no}
                  onChange={(e) => setBondedForm((f) => ({ ...f, ud_no: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-text-muted">UP no.</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={bondedForm.up_no}
                  onChange={(e) => setBondedForm((f) => ({ ...f, up_no: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-text-muted">Item description</span>
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={bondedForm.item_description}
                onChange={(e) => setBondedForm((f) => ({ ...f, item_description: e.target.value }))}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-text-muted">Quantity</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={bondedForm.quantity}
                  onChange={(e) => setBondedForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-text-muted">Value (BDT)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={bondedForm.value_bdt}
                  onChange={(e) => setBondedForm((f) => ({ ...f, value_bdt: e.target.value }))}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-text-muted">Entry date</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={bondedForm.entry_date}
                onChange={(e) => setBondedForm((f) => ({ ...f, entry_date: e.target.value }))}
              />
            </label>
            <Button type="submit" disabled={bondedSaving}>
              {bondedSaving ? "Saving…" : "Add entry"}
            </Button>
          </form>

          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left">
                <tr>
                  <th className={listTableHeadCellClass}>Reference</th>
                  <th className={listTableHeadCellClass}>UD / UP</th>
                  <th className={listTableHeadCellClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {bondedRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-text-muted">
                      No bonded warehouse entries yet.
                    </td>
                  </tr>
                ) : (
                  bondedRows.map((r) => (
                    <tr key={r.id} className={listTableRowClass}>
                      <td className="py-2 px-4 font-medium">{r.reference_no}</td>
                      <td className="py-2 px-4 text-text-secondary">
                        {[r.ud_no, r.up_no].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="py-2 px-4">{r.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "payroll" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border bg-surface-raised p-4">
            <h3 className="font-semibold text-text-primary">Payroll statutory calculator</h3>
            <label className="block text-sm">
              <span className="text-text-muted">Gross pay (BDT)</span>
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={payrollForm.gross_pay}
                onChange={(e) => setPayrollForm((f) => ({ ...f, gross_pay: e.target.value }))}
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="block text-sm">
                <span className="text-text-muted">AIT %</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={payrollForm.ait_rate_pct}
                  onChange={(e) => setPayrollForm((f) => ({ ...f, ait_rate_pct: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-text-muted">PF emp %</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={payrollForm.pf_employee_rate_pct}
                  onChange={(e) => setPayrollForm((f) => ({ ...f, pf_employee_rate_pct: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-text-muted">PF er %</span>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={payrollForm.pf_employer_rate_pct}
                  onChange={(e) => setPayrollForm((f) => ({ ...f, pf_employer_rate_pct: e.target.value }))}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={payrollForm.persist}
                onChange={(e) => setPayrollForm((f) => ({ ...f, persist: e.target.checked }))}
              />
              Save summary for period
            </label>
            {payrollForm.persist && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-text-muted">Year</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={payrollForm.period_year}
                    onChange={(e) =>
                      setPayrollForm((f) => ({ ...f, period_year: Number(e.target.value) || f.period_year }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-text-muted">Month</span>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={payrollForm.period_month}
                    onChange={(e) =>
                      setPayrollForm((f) => ({ ...f, period_month: Number(e.target.value) || f.period_month }))
                    }
                  />
                </label>
              </div>
            )}
            <Button type="button" onClick={() => void runPayrollCalc()} disabled={payrollBusy}>
              {payrollBusy ? "Calculating…" : "Calculate"}
            </Button>
          </div>

          {payrollResult && (
            <dl className="rounded-xl border border-border bg-surface-raised p-4 grid grid-cols-2 gap-3 text-sm">
              <dt className="text-text-muted">Gross total</dt>
              <dd>{payrollResult.gross_total}</dd>
              <dt className="text-text-muted">AIT</dt>
              <dd>{payrollResult.ait_total}</dd>
              <dt className="text-text-muted">PF (employee)</dt>
              <dd>{payrollResult.pf_employee_total}</dd>
              <dt className="text-text-muted">PF (employer)</dt>
              <dd>{payrollResult.pf_employer_total}</dd>
              <dt className="text-text-muted font-semibold">Net payable</dt>
              <dd className="font-semibold">{payrollResult.net_payable}</dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
