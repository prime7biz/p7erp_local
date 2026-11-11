import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type HrPayrollAutoCalcComponent,
  type HrPayrollAutoCalcEmployee,
  type HrPayrollAutoCalcEmployeeWithOt,
  type HrPayrollAutoCalcPreview,
  type HrPayrollPeriodResponse,
  type HrPayrollRunCreate,
  type HrPayrollRunResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { useAuth } from "@/context/AuthContext";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { todayLocalISO } from "@/lib/dates";
import { saveBlob } from "@/lib/fileSave";
import { formatMoney } from "@/lib/money";
import { canExportHrData } from "@/lib/roles";
import { payrollRunRowActions, type PayrollRunActionKey } from "./payrollRunActions";

const PREFIX = "/app/hr";

function isStatutoryComponent(c: HrPayrollAutoCalcComponent): boolean {
  return c.is_statutory === true || c.component_code.startsWith("STAT_");
}

function groupPreviewComponents(components: HrPayrollAutoCalcComponent[]) {
  const earnings = components.filter(
    (c) => c.component_type !== "DEDUCTION" && c.component_type !== "EMPLOYER" && !isStatutoryComponent(c),
  );
  const statutoryLines = components.filter(
    (c) => isStatutoryComponent(c) || c.component_type === "EMPLOYER",
  );
  const statutoryDeductions = statutoryLines.filter((c) => c.component_type === "DEDUCTION");
  const otherDeductions = components.filter(
    (c) => c.component_type === "DEDUCTION" && !isStatutoryComponent(c),
  );
  const hasStatutory = statutoryLines.length > 0;
  return { earnings, statutoryLines, statutoryDeductions, otherDeductions, hasStatutory };
}

function OvertimeFromSalaryNote({ employee }: { employee: HrPayrollAutoCalcEmployeeWithOt }) {
  if (!employee.ot_from_salary || Number(employee.ot_paid_hours ?? 0) <= 0) return null;
  return (
    <div className="text-[11px] text-text-muted">
      OT {Number(employee.ot_paid_hours)} h · rate {Number(employee.ot_hourly_rate ?? 0).toFixed(2)}/h ·{" "}
      {Number(employee.ot_amount ?? 0).toFixed(2)}
    </div>
  );
}

function PayrollEmployeeBreakdown({ employee }: { employee: HrPayrollAutoCalcEmployee }) {
  const { earnings, statutoryLines, statutoryDeductions, otherDeductions, hasStatutory } = groupPreviewComponents(
    employee.components ?? [],
  );

  if (!hasStatutory) return null;

  const line = (c: HrPayrollAutoCalcComponent) => (
    <div key={`${c.component_code}-${c.component_id}`} className="flex justify-between gap-2 text-xs">
      <span>{c.component_name || c.component_code}</span>
      <span className="tabular-nums">{c.amount}</span>
    </div>
  );

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border-subtle bg-surface-subtle p-2 text-left">
      <div>
        <p className="text-xs font-semibold uppercase text-text-muted">Earnings</p>
        {earnings.length ? earnings.map(line) : <p className="text-xs text-text-muted">—</p>}
      </div>
      <div className="rounded border border-blue-200 bg-blue-50 p-2">
        <p className="text-xs font-semibold uppercase text-blue-800">Statutory</p>
        {statutoryLines.length ? statutoryLines.map(line) : <p className="text-xs text-blue-700">—</p>}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-text-muted">Statutory Deductions</p>
        {statutoryDeductions.length ? statutoryDeductions.map(line) : <p className="text-xs text-text-muted">—</p>}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-text-muted">Other Deductions</p>
        {otherDeductions.length ? otherDeductions.map(line) : <p className="text-xs text-text-muted">—</p>}
      </div>
      <div className="border-t border-border pt-1">
        <p className="text-xs font-semibold uppercase text-text-primary">Net Pay</p>
        <p className="text-sm font-semibold tabular-nums">{employee.net_pay}</p>
      </div>
    </div>
  );
}

export function HrPayrollRunsPage() {
  const [runs, setRuns] = useState<HrPayrollRunResponse[]>([]);
  /** Open periods only: the create-run form must not offer locked periods. */
  const [periods, setPeriods] = useState<HrPayrollPeriodResponse[]>([]);
  /** Every period (also locked), so finished runs still show their period code. */
  const [allPeriods, setAllPeriods] = useState<HrPayrollPeriodResponse[]>([]);
  const { me } = useAuth();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<HrPayrollRunCreate>({
    period_id: 0,
    run_date: todayLocalISO(),
    run_code: "",
  });
  const [formBaseline, setFormBaseline] = useState(0);
  const formDirty = useFormDirty(form, formBaseline);
  useUnsavedChangesGuard(formDirty);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [preview, setPreview] = useState<HrPayrollAutoCalcPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());
  const [forceOverwrite, setForceOverwrite] = useState(false);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, p] = await Promise.all([api.listHrPayrollRuns(), api.listHrPayrollPeriods()]);
      setRuns(r);
      setAllPeriods(p);
      setPeriods(p.filter((x) => !x.is_locked));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRuns([]);
      setAllPeriods([]);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.period_id) {
      setMsg("Select a payroll period.");
      return;
    }
    setSubmitting(true);
    setMsg("");
    try {
      const payload: HrPayrollRunCreate = {
        period_id: form.period_id,
        run_date: form.run_date,
        run_code: form.run_code?.trim() ? form.run_code.trim() : undefined,
      };
      await api.createHrPayrollRun(payload);
      setMsg("Payroll run created.");
      setForm((f) => ({ ...f, run_code: "" }));
      setFormBaseline((n) => n + 1);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    // A second click while a run action is in flight is ignored (the server also locks the run).
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg("");
    try {
      const r = await fn();
      setMsg(`${label} OK.`);
      if (r && typeof r === "object" && "voucher_id" in r) {
        setMsg(`${label} — voucher ${String((r as { voucher_id?: unknown }).voucher_id ?? "")}`);
      }
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const downloadBankFile = async (run: HrPayrollRunResponse) => {
    setMsg("");
    try {
      const blob = await api.downloadHrPayrollRunBankFile(run.id);
      void saveBlob(blob, `payroll-run-${run.id}-bank.csv`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Download failed");
    }
  };

  const onRunAction = (run: HrPayrollRunResponse, key: PayrollRunActionKey) => {
    if (busyRef.current) return;
    switch (key) {
      case "autocalc":
        void openAutoCalc(run.id);
        return;
      case "finalize":
        if (!window.confirm(`Finalize payroll run ${run.run_code}? It is sent for approval and can no longer be auto-calculated.`)) return;
        void runAction("Finalize", () => api.finalizeHrPayrollRun(run.id));
        return;
      case "approve":
        void runAction("Approve", () => api.approveHrPayrollRun(run.id, {}));
        return;
      case "post": {
        const question =
          run.status === "POSTED"
            ? `Payroll run ${run.run_code} is already posted. Show its voucher?`
            : `Post payroll run ${run.run_code} to the general ledger?`;
        if (!window.confirm(question)) return;
        void runAction("Post to GL", () => api.postHrPayrollRun(run.id, {}));
        return;
      }
      case "payslips":
        void runAction("Payslips", () => api.generateHrPayrollPayslips(run.id));
        return;
      case "bank":
        void downloadBankFile(run);
    }
  };

  const periodCode = (id: number) => allPeriods.find((p) => p.id === id)?.period_code ?? `#${id}`;
  const money = (v: string) => formatMoney(v);
  const runColumns: HrTableColumn<HrPayrollRunResponse>[] = [
    { key: "run", header: "Run", render: (r) => <span className="font-medium text-text-primary">{r.run_code}</span>, value: (r) => r.run_code },
    { key: "period", header: "Period", render: (r) => periodCode(r.period_id), value: (r) => periodCode(r.period_id) },
    { key: "date", header: "Date", render: (r) => r.run_date, value: (r) => r.run_date },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
    // Amounts: formatted for display only; sorting and CSV use the raw decimal strings from the API.
    { key: "gross", header: "Gross", align: "right", hideOnMobile: true, render: (r) => <span className="tabular-nums">{money(r.gross_total)}</span>, value: (r) => r.gross_total },
    { key: "deductions", header: "Deductions", align: "right", hideOnMobile: true, render: (r) => <span className="tabular-nums">{money(r.deduction_total)}</span>, value: (r) => r.deduction_total },
    { key: "net", header: "Net", align: "right", render: (r) => <span className="tabular-nums font-semibold">{money(r.net_total)}</span>, value: (r) => r.net_total },
  ];

  const openAutoCalc = async (runId: number) => {
    setSelectedRunId(runId);
    setPreview(null);
    setPreviewLoading(true);
    setForceOverwrite(false);
    setSelectedEmployeeIds(new Set());
    setMsg("");
    try {
      const p = await api.previewHrPayrollAutoCalculate(runId);
      setPreview(p);
      const ready = p.employees.filter((e) => !e.skipped).map((e) => e.employee_id);
      setSelectedEmployeeIds(new Set(ready));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Preview failed");
      setSelectedRunId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const applyAutoCalc = async () => {
    if (!selectedRunId || !preview) return;
    if (selectedEmployeeIds.size === 0) {
      setMsg("Select at least one employee to apply.");
      return;
    }
    const hasManual = preview.employees.some(
      (e) => selectedEmployeeIds.has(e.employee_id) && e.has_manual_override
    );
    if (hasManual && !forceOverwrite) {
      const ok = window.confirm(
        "Some selected employees have MANUAL overrides and will be skipped unless you enable Force overwrite. Continue with skips?"
      );
      if (!ok) return;
    }
    if (forceOverwrite && hasManual) {
      const ok = window.confirm("Force overwrite will replace MANUAL payroll lines. Continue?");
      if (!ok) return;
    }
    setApplyLoading(true);
    setMsg("");
    try {
      const result = await api.applyHrPayrollAutoCalculate(selectedRunId, {
        employee_ids: Array.from(selectedEmployeeIds),
        force: forceOverwrite,
        overwrite_confirm: forceOverwrite,
      });
      setMsg(`Auto-calculate applied: ${result.applied} line(s), skipped ${result.skipped}. Net ${result.net_total}`);
      setPreview(null);
      setSelectedRunId(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplyLoading(false);
    }
  };

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const allPreviewEmployees = preview?.employees ?? [];

  const toggleEmployee = (id: number) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReady = () => {
    if (!preview) return;
    setSelectedEmployeeIds(new Set(preview.employees.filter((e) => !e.skipped).map((e) => e.employee_id)));
  };

  const deselectAll = () => setSelectedEmployeeIds(new Set());

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll runs"
        description="Create a run for an open period, auto-calculate from structure assignments (optional), then finalize, approve, post to GL, and generate payslips."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Runs" }]}
      />
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {msg && <div className="text-sm text-text-secondary">{msg}</div>}

      <form onSubmit={(e) => void createRun(e)} className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">New payroll run</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-text-secondary">
            Payroll period
            <select
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.period_id || ""}
              onChange={(e) => setForm((f) => ({ ...f, period_id: Number(e.target.value) }))}
              required
            >
              <option value="">Select period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.period_code} ({p.start_date} – {p.end_date})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-secondary">
            Run date
            <input
              type="date"
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.run_date}
              onChange={(e) => setForm((f) => ({ ...f, run_date: e.target.value }))}
              required
            />
          </label>
          <label className="text-xs text-text-secondary">
            Run code (optional)
            <input
              className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              value={form.run_code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, run_code: e.target.value }))}
              placeholder="Auto if empty"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create run"}
            </button>
          </div>
        </div>
      </form>

      <HrDataTable
        rows={runs}
        rowKey={(r) => r.id}
        columns={runColumns}
        loading={loading}
        emptyTitle="No payroll runs yet."
        emptyHint="Create a run for an open payroll period above."
        searchPlaceholder="Search run, period or status…"
        statusOf={(r) => r.status}
        exportFileName="payroll-runs"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => payrollRunRowActions(r.status, (key) => onRunAction(r, key), busy)}
      />

      {(selectedRunId != null || previewLoading) && (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              Auto-calculate preview{selectedRun ? ` — ${selectedRun.run_code}` : ""}
            </h3>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs text-text-secondary"
              onClick={() => {
                setSelectedRunId(null);
                setPreview(null);
              }}
            >
              Close
            </button>
          </div>
          {previewLoading ? (
            <p className="text-sm text-text-muted">Calculating preview…</p>
          ) : preview ? (
            <>
              {preview.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-text-secondary space-y-0.5">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" className="rounded border px-2 py-1" onClick={selectAllReady}>
                  Select all
                </button>
                <button type="button" className="rounded border px-2 py-1" onClick={deselectAll}>
                  Deselect all
                </button>
                <label className="inline-flex items-center gap-1.5 rounded border px-2 py-1">
                  <input
                    type="checkbox"
                    checked={forceOverwrite}
                    onChange={(e) => setForceOverwrite(e.target.checked)}
                  />
                  Force overwrite manual
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-surface-subtle">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Sel</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Employee</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Base</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Earnings</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Deductions</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Gross</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Net</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Status</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Warnings</th>
                      <th className="px-3 py-1.5 text-left text-xs uppercase">Breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPreviewEmployees.map((e) => {
                      const hasStatutory = groupPreviewComponents(e.components ?? []).hasStatutory;
                      return (
                      <tr key={e.employee_id} className="border-t border-border-subtle align-top">
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            disabled={e.skipped}
                            checked={selectedEmployeeIds.has(e.employee_id)}
                            onChange={() => toggleEmployee(e.employee_id)}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          {e.employee_name || e.employee_code}
                          <div className="text-xs text-text-muted">{e.employee_code}</div>
                          {expandedEmployeeId === e.employee_id && hasStatutory ? (
                            <PayrollEmployeeBreakdown employee={e} />
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">
                          {e.base_salary}
                          {e.pay_basis && e.pay_basis !== "SALARY" ? (
                            <div className="text-[11px] text-text-muted">
                              {e.pay_basis === "PIECE"
                                ? `Piece rate · ${Number(e.pieces ?? 0)} pcs · ${Number(e.earned_minutes ?? 0)} SAM min`
                                : `Daily wage · ${Number(e.days_present)} days`}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5">{e.gross_pay}</td>
                        <td className="px-3 py-1.5">{e.deductions}</td>
                        <td className="px-3 py-1.5">
                          {e.gross_pay}
                          <OvertimeFromSalaryNote employee={e} />
                        </td>
                        <td className="px-3 py-1.5">{e.net_pay}</td>
                        <td className="px-3 py-1.5">{e.status ?? (e.skipped ? "Missing Assignment" : "Ready")}</td>
                        <td className="px-3 py-1.5 text-xs text-text-muted">
                          {(e.warnings || []).join("; ") || "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {hasStatutory ? (
                            <button
                              type="button"
                              className="rounded border px-2 py-0.5 text-xs"
                              onClick={() =>
                                setExpandedEmployeeId(expandedEmployeeId === e.employee_id ? null : e.employee_id)
                              }
                            >
                              {expandedEmployeeId === e.employee_id ? "Hide" : "Show"}
                            </button>
                          ) : (
                            <span className="text-xs text-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );})}
                    {allPreviewEmployees.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-4 text-center text-sm text-text-muted">
                          No active employees found for this tenant.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={applyLoading || selectedEmployeeIds.size === 0}
                  onClick={() => void applyAutoCalc()}
                >
                  {applyLoading ? "Applying…" : "Apply"}
                </button>
                <p className="text-xs text-text-muted self-center">
                  Requires Settings → Configuration → Payroll auto-calculate enabled.
                </p>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
