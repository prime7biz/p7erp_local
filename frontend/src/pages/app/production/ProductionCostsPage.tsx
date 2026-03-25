import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ChartOfAccountResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const CM_OVERRUN_ALERT_TYPE = "production_cm_overrun";
const MERCH_CM_ALERTS_HREF = `/app/merchandising/alerts?alert_type=${encodeURIComponent(CM_OVERRUN_ALERT_TYPE)}`;

type CmAnalysisRow = {
  order_id: number | null;
  style_id: number | null;
  line_id: number | null;
  total_production_cost: number;
  total_good_output: number;
  actual_cm_per_piece: number | null;
  quoted_cm_per_piece: number | null;
  variance_pct: number | null;
  is_over_budget: boolean | null;
};

type CmAlertRow = {
  order_id: number | null;
  style_id: number | null;
};

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(decimals);
}

type WipRow = {
  id: number;
  from_department: string;
  to_department: string;
  order_id: number | null;
  total_value: number;
  material_value?: number;
  conversion_cost?: number;
  voucher_id: number | null;
  cost_center_id: number | null;
  journal_date: string;
};

type OverheadRow = Awaited<ReturnType<typeof api.listCmOverheadConfig>>[number];

export function ProductionCostsPage() {
  const [period, setPeriod] = useState(todayISO());
  const [cmItems, setCmItems] = useState<CmAnalysisRow[]>([]);
  const [alerts, setAlerts] = useState<CmAlertRow[]>([]);
  const [wip, setWip] = useState<WipRow[]>([]);
  const [dept, setDept] = useState("sewing");
  const [labor, setLabor] = useState("0");
  const [notes, setNotes] = useState("");

  const [wipFrom, setWipFrom] = useState("cutting");
  const [wipTo, setWipTo] = useState("sewing");
  const [wipMaterial, setWipMaterial] = useState("0");
  const [wipConversion, setWipConversion] = useState("0");
  const [wipJournalDate, setWipJournalDate] = useState(todayISO());
  const [wipOrderId, setWipOrderId] = useState("");
  const [glDebitId, setGlDebitId] = useState("");
  const [glCreditId, setGlCreditId] = useState("");
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [wipSubmitMsg, setWipSubmitMsg] = useState("");
  const [recalcMsg, setRecalcMsg] = useState("");
  const [overheadRows, setOverheadRows] = useState<OverheadRow[]>([]);
  const [costCenters, setCostCenters] = useState<Array<{ id: number; center_code: string; name: string }>>([]);
  const [recalcBreakdown, setRecalcBreakdown] = useState<{ labor: number; overhead: number; source: string } | null>(null);

  const postingAccounts = useMemo(
    () =>
      [...accounts]
        .filter((a) => a.is_active !== false && (a.account_type === "posting" || !a.account_type))
        .sort((a, b) => (a.account_number || "").localeCompare(b.account_number || "") || a.name.localeCompare(b.name)),
    [accounts],
  );

  const load = useCallback(async () => {
    try {
      const [cm, al, w, coa] = await Promise.all([
        api.getCmAnalysis(period),
        api.getCmAlerts(),
        api.listWipJournals(),
        api.listChartOfAccounts({ active_only: true }),
      ]);
      setCmItems((cm.items as CmAnalysisRow[]) ?? []);
      setAlerts((al.items as CmAlertRow[]) ?? []);
      setWip((w.items as WipRow[]) ?? []);
      setAccounts(coa);
      const ovh = await api.listCmOverheadConfig();
      setOverheadRows(
        ovh.length
          ? ovh
          : [
              { id: -1, tenant_id: 0, cost_category: "utility", account_id: null, cost_center_id: null, allocation_method: "headcount", is_active: true },
              { id: -2, tenant_id: 0, cost_category: "bank_charge", account_id: null, cost_center_id: null, allocation_method: "equal", is_active: true },
              { id: -3, tenant_id: 0, cost_category: "conveyance", account_id: null, cost_center_id: null, allocation_method: "headcount", is_active: true },
              { id: -4, tenant_id: 0, cost_category: "transportation", account_id: null, cost_center_id: null, allocation_method: "output_volume", is_active: true },
              { id: -5, tenant_id: 0, cost_category: "bank_interest", account_id: null, cost_center_id: null, allocation_method: "equal", is_active: true },
            ],
      );
      const cc = await api.listCostCenters({ active_only: true });
      setCostCenters((cc as Array<{ id: number; center_code: string; name: string }>) ?? []);
    } catch (e) {
      logApiError(e, "ProductionCostsPage.load");
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDaily = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.postProductionDailyCost({
        department_type: dept,
        cost_date: period,
        labor_cost: Number(labor) || 0,
        notes: notes || undefined,
      });
      await load();
    } catch (e) {
      logApiError(e, "ProductionCostsPage.saveDaily");
    }
  };

  const recalc = async () => {
    setRecalcMsg("");
    try {
      const res = (await api.recalcCm(period)) as {
        ok?: boolean;
        rows_written?: number;
        message?: string;
        total_cost_pool?: number;
        total_labor_cost?: number;
        total_overhead_cost?: number;
        cost_source?: string;
        total_good_output?: number;
        alerts_created?: number;
        alerts_updated?: number;
        alerts_resolved?: number;
      };
      await load();
      const ac = res.alerts_created ?? 0;
      const au = res.alerts_updated ?? 0;
      const ar = res.alerts_resolved ?? 0;
      const alertBits =
        ac + au + ar > 0
          ? ` Merch alerts: ${ac} new, ${au} updated, ${ar} auto-resolved.`
          : "";
      if (res.message) {
        setRecalcMsg(res.message + alertBits);
      } else if (res.rows_written != null) {
        setRecalcMsg(
          `CM recalc: ${res.rows_written} row(s). Cost pool ${res.total_cost_pool ?? "—"}, output ${res.total_good_output ?? "—"}.${alertBits}`,
        );
      }
      setRecalcBreakdown({
        labor: Number(res.total_labor_cost ?? 0),
        overhead: Number(res.total_overhead_cost ?? 0),
        source: String(res.cost_source ?? "manual_fallback"),
      });
    } catch (e) {
      logApiError(e, "ProductionCostsPage.recalc");
    }
  };

  const saveOverhead = async () => {
    try {
      await api.upsertCmOverheadConfig(
        overheadRows.map((r) => ({
          cost_category: r.cost_category,
          account_id: r.account_id,
          cost_center_id: r.cost_center_id,
          allocation_method: r.allocation_method,
          is_active: r.is_active,
        })),
      );
      setOverheadRows(await api.listCmOverheadConfig());
    } catch (e) {
      logApiError(e, "ProductionCostsPage.saveOverhead");
    }
  };

  const submitWip = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setWipSubmitMsg("");
    const debit = glDebitId.trim() ? Number(glDebitId) : null;
    const credit = glCreditId.trim() ? Number(glCreditId) : null;
    if ((debit != null) !== (credit != null)) {
      setWipSubmitMsg("Enter both debit and credit GL accounts, or leave both empty.");
      return;
    }
    try {
      const res = await api.createWipJournal({
        from_department: wipFrom,
        to_department: wipTo,
        journal_date: wipJournalDate,
        material_value: Number(wipMaterial) || 0,
        conversion_cost: Number(wipConversion) || 0,
        order_id: wipOrderId.trim() ? Number(wipOrderId) : undefined,
        gl_debit_account_id: debit ?? undefined,
        gl_credit_account_id: credit ?? undefined,
      });
      setWipSubmitMsg(
        res.voucher_id != null
          ? `Saved. Draft voucher #${res.voucher_id} created — open it in Finance to review and post.`
          : "Saved WIP journal (no GL voucher — add both accounts to auto-create a draft).",
      );
      await load();
    } catch (e) {
      logApiError(e, "ProductionCostsPage.submitWip");
      setWipSubmitMsg("Could not save WIP journal.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Cost & CM</h1>
        <p className="text-sm text-text-secondary">Daily cost input, CM analysis, alerts, and WIP journals.</p>
      </div>

      <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium">Period</h2>
        <label className="text-sm">
          Date
          <input
            type="date"
            className="ml-2 rounded-md border border-border-subtle px-2 py-1"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="ml-3 rounded-lg border border-border-subtle px-3 py-1.5 text-sm"
          onClick={() => void load()}
        >
          Refresh
        </button>
        <button type="button" className="ml-2 rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void recalc()}>
          CM recalc
        </button>
        {recalcMsg ? <p className="mt-2 text-sm text-text-secondary">{recalcMsg}</p> : null}
        {recalcBreakdown ? (
          <p className="mt-1 text-xs text-text-secondary">
            Breakdown: Labor {fmtNum(recalcBreakdown.labor)} + Overhead {fmtNum(recalcBreakdown.overhead)} (source: {recalcBreakdown.source})
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">CM overhead config</h2>
          <button type="button" className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm" onClick={() => void saveOverhead()}>
            Save overhead config
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">GL Account</th>
                <th className="py-2 pr-3">Cost center</th>
                <th className="py-2 pr-3">Allocation</th>
                <th className="py-2 pr-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {overheadRows.map((r, idx) => (
                <tr key={`${r.cost_category}-${idx}`} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3">{r.cost_category}</td>
                  <td className="py-2 pr-3">
                    <select
                      className="rounded-md border border-border-subtle px-2 py-1 text-sm"
                      value={r.account_id ?? ""}
                      onChange={(e) =>
                        setOverheadRows((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, account_id: e.target.value ? Number(e.target.value) : null } : x)),
                        )
                      }
                    >
                      <option value="">— none —</option>
                      {postingAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_number} — {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="rounded-md border border-border-subtle px-2 py-1 text-sm"
                      value={r.cost_center_id ?? ""}
                      onChange={(e) =>
                        setOverheadRows((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, cost_center_id: e.target.value ? Number(e.target.value) : null } : x)),
                        )
                      }
                    >
                      <option value="">— none —</option>
                      {costCenters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.center_code} — {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="rounded-md border border-border-subtle px-2 py-1 text-sm"
                      value={r.allocation_method}
                      onChange={(e) =>
                        setOverheadRows((prev) => prev.map((x, i) => (i === idx ? { ...x, allocation_method: e.target.value } : x)))
                      }
                    >
                      <option value="headcount">headcount</option>
                      <option value="machine_count">machine_count</option>
                      <option value="output_volume">output_volume</option>
                      <option value="equal">equal</option>
                      <option value="manual">manual</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={r.is_active}
                      onChange={(e) =>
                        setOverheadRows((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: e.target.checked } : x)))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium">Daily cost (simplified)</h2>
        <form onSubmit={saveDaily} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Department
            <input className="ml-2 w-32 rounded-md border border-border-subtle px-2 py-1" value={dept} onChange={(e) => setDept(e.target.value)} />
          </label>
          <label className="text-sm">
            Labor cost
            <input
              type="number"
              className="ml-2 w-28 rounded-md border border-border-subtle px-2 py-1"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Notes
            <input className="ml-2 min-w-[200px] rounded-md border border-border-subtle px-2 py-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated p-4">
        <h2 className="text-sm font-medium">WIP journal</h2>
        <p className="text-xs text-text-secondary">
          Material + conversion = total. Optionally pick two GL accounts to create a balanced <strong>draft</strong> journal in Finance
          (same workflow as manual vouchers — review and post when the period is open).
        </p>
        <form onSubmit={submitWip} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            From department
            <input className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1" value={wipFrom} onChange={(e) => setWipFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            To department
            <input className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1" value={wipTo} onChange={(e) => setWipTo(e.target.value)} />
          </label>
          <label className="text-sm">
            Journal date
            <input
              type="date"
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1"
              value={wipJournalDate}
              onChange={(e) => setWipJournalDate(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Order ID (optional)
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1"
              value={wipOrderId}
              onChange={(e) => setWipOrderId(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Material value
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1"
              value={wipMaterial}
              onChange={(e) => setWipMaterial(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Conversion cost
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1"
              value={wipConversion}
              onChange={(e) => setWipConversion(e.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            GL debit (WIP / asset side)
            <select
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1 text-sm"
              value={glDebitId}
              onChange={(e) => setGlDebitId(e.target.value)}
            >
              <option value="">— none —</option>
              {postingAccounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.account_number} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            GL credit (clearing / offset)
            <select
              className="mt-1 w-full rounded-md border border-border-subtle px-2 py-1 text-sm"
              value={glCreditId}
              onChange={(e) => setGlCreditId(e.target.value)}
            >
              <option value="">— none —</option>
              {postingAccounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.account_number} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
              Save WIP journal
            </button>
            {wipSubmitMsg ? <p className="mt-2 text-sm text-text-secondary">{wipSubmitMsg}</p> : null}
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-border-subtle p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">CM analysis</h2>
          <Link className="text-sm text-brand-primary underline" to={MERCH_CM_ALERTS_HREF}>
            CM overrun alerts in Merch
          </Link>
        </div>
        <p className="mb-2 text-xs text-text-secondary">
          Actual CM vs quoted for the selected period (from CM recalc). Rows marked over budget also appear as Merch alerts (
          <code className="rounded bg-surface-subtle px-1 text-[11px]">{CM_OVERRUN_ALERT_TYPE}</code>).
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Style</th>
                <th className="py-2 pr-3">Line</th>
                <th className="py-2 pr-3 text-right">Prod. cost</th>
                <th className="py-2 pr-3 text-right">Good qty</th>
                <th className="py-2 pr-3 text-right">Act. CM/pc</th>
                <th className="py-2 pr-3 text-right">Quoted CM/pc</th>
                <th className="py-2 pr-3 text-right">Var %</th>
                <th className="py-2 pr-3">Budget</th>
              </tr>
            </thead>
            <tbody>
              {cmItems.map((row, i) => (
                <tr key={`${row.order_id ?? "o"}-${row.style_id ?? "s"}-${row.line_id ?? "l"}-${i}`} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3">
                    {row.order_id != null ? (
                      <Link className="text-brand-primary underline" to={`/app/orders/${row.order_id}`}>
                        #{row.order_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {row.style_id != null ? (
                      <Link className="text-brand-primary underline" to={`/app/merchandising/styles/${row.style_id}`}>
                        #{row.style_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">{row.line_id != null ? String(row.line_id) : "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(row.total_production_cost)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(row.total_good_output)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(row.actual_cm_per_piece)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(row.quoted_cm_per_piece)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {row.variance_pct != null ? `${fmtNum(row.variance_pct)}%` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {row.is_over_budget ? (
                      <span className="rounded-md bg-status-warning-subtle px-2 py-0.5 text-xs text-status-warning-foreground">
                        Over
                      </span>
                    ) : (
                      <span className="text-text-secondary">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cmItems.length === 0 ? <p className="py-3 text-sm text-text-secondary">No CM rows for this period. Run CM recalc after hourly production exists.</p> : null}
      </section>

      <section className="rounded-lg border border-border-subtle p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Orders over CM budget</h2>
          <Link className="text-sm text-brand-primary underline" to={MERCH_CM_ALERTS_HREF}>
            View in Merch alerts
          </Link>
        </div>
        <p className="mb-2 text-xs text-text-secondary">Same data as Merch alerts for production CM vs quote; quick list from cost engine.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Style</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((row, i) => (
                <tr key={`${row.order_id}-${row.style_id}-${i}`} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3">
                    {row.order_id != null ? (
                      <Link className="text-brand-primary underline" to={`/app/orders/${row.order_id}`}>
                        #{row.order_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {row.style_id != null ? (
                      <Link className="text-brand-primary underline" to={`/app/merchandising/styles/${row.style_id}`}>
                        #{row.style_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {alerts.length === 0 ? (
          <p className="py-3 text-sm text-text-secondary">No over-budget CM rows right now.</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border-subtle p-4">
        <h2 className="mb-2 text-sm font-medium">WIP journals</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-text-secondary">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Route</th>
                <th className="py-2 pr-3">Total</th>
                <th className="py-2 pr-3">Voucher</th>
              </tr>
            </thead>
            <tbody>
              {wip.map((row) => (
                <tr key={row.id} className="border-b border-border-subtle/60">
                  <td className="py-2 pr-3">{row.journal_date}</td>
                  <td className="py-2 pr-3">
                    {row.from_department} → {row.to_department}
                    {row.order_id != null ? ` · ord ${row.order_id}` : ""}
                  </td>
                  <td className="py-2 pr-3">{row.total_value.toFixed(2)}</td>
                  <td className="py-2 pr-3">
                    {row.voucher_id != null ? (
                      <Link className="text-brand-primary underline" to={`/app/accounts/vouchers/${row.voucher_id}`}>
                        Open #{row.voucher_id}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {wip.length === 0 ? <p className="py-3 text-sm text-text-secondary">No WIP journals yet.</p> : null}
      </section>
    </div>
  );
}
