/**
 * Tiffin / dinner / night bills from attendance, production bonus from output, and the optional
 * Eid / festival bonus. Entries are generated, reviewed, approved by a manager and then picked up
 * by the next payroll run (or a final settlement) exactly once.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Badge, Banner, Card, Field, Messages, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, money, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

type Tab = "meal" | "production" | "festival";

const BILL_LABEL: Record<string, string> = { TIFFIN: "Tiffin bill", DINNER: "Dinner bill", NIGHT: "Night bill" };
const BASIS_LABEL: Record<string, string> = {
  PRESENT: "Every present day",
  NIGHT_SHIFT: "Night-shift day",
  MIN_WORK_MINUTES: "Worked at least N minutes",
  MIN_OT_MINUTES: "Overtime at least N minutes",
};

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const statusBadge = (s: unknown) => (
  <Badge tone={s === "APPROVED" ? "green" : s === "PAID" ? "blue" : s === "REJECTED" ? "red" : "amber"}>{String(s)}</Badge>
);

function MealBills() {
  const employees = useEmployees();
  const rules = useLoad(() => hrBangladeshApi.allowanceRules(), []);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const entries = useLoad(() => hrBangladeshApi.allowanceEntries(statusFilter || undefined), [statusFilter]);
  const [rule, setRule] = useState({ code: "", name: "", bill_type: "TIFFIN", eligibility_basis: "MIN_OT_MINUTES", threshold_minutes: "120", amount: "", effective_from: monthStart() });
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [preview, setPreview] = useState<{ eligible: number; totals: Record<string, string> } | null>(null);
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };
  const ruleName = (id: unknown) => {
    const r = (rules.data ?? []).find((x) => x.id === id);
    return r ? `${String(r.code)} (${BILL_LABEL[String(r.bill_type)] ?? String(r.bill_type)})` : `#${String(id)}`;
  };
  const pendingIds = (entries.data ?? []).filter((e) => e.status === "PENDING").map((e) => Number(e.id));

  return (
    <div className="space-y-4">
      <Messages error={error || rules.error || entries.error} notice={notice} />
      <Card title="Bill rules" description="Company rules for tiffin, dinner and night bills. A manager approves a rule before it is used.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code" htmlFor="al-code">
            <input id="al-code" className={inputCls} maxLength={24} value={rule.code} onChange={(e) => setRule((r) => ({ ...r, code: e.target.value }))} />
          </Field>
          <Field label="Name" htmlFor="al-name">
            <input id="al-name" className={inputCls} value={rule.name} onChange={(e) => setRule((r) => ({ ...r, name: e.target.value }))} />
          </Field>
          <Field label="Bill" htmlFor="al-type">
            <select id="al-type" className={inputCls} value={rule.bill_type} onChange={(e) => setRule((r) => ({ ...r, bill_type: e.target.value }))}>
              {Object.entries(BILL_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Who gets it" htmlFor="al-basis">
            <select id="al-basis" className={inputCls} value={rule.eligibility_basis} onChange={(e) => setRule((r) => ({ ...r, eligibility_basis: e.target.value }))}>
              {Object.entries(BASIS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minutes (N)" htmlFor="al-min">
            <input id="al-min" type="number" min={0} max={1440} className={inputCls} value={rule.threshold_minutes} onChange={(e) => setRule((r) => ({ ...r, threshold_minutes: e.target.value }))} />
          </Field>
          <Field label="Amount per day (Tk)" htmlFor="al-amt">
            <input id="al-amt" type="number" min={0} step="0.01" className={inputCls} value={rule.amount} onChange={(e) => setRule((r) => ({ ...r, amount: e.target.value }))} />
          </Field>
          <Field label="From" htmlFor="al-from">
            <input id="al-from" type="date" className={inputCls} value={rule.effective_from} onChange={(e) => setRule((r) => ({ ...r, effective_from: e.target.value }))} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !rule.code.trim() || !rule.name.trim() || !rule.amount}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.createAllowanceRule({ ...rule, threshold_minutes: Number(rule.threshold_minutes) });
                  await rules.reload();
                }, "Rule created. A manager must approve it.")
              }
            >
              Add rule
            </button>
          </div>
        </div>
        <KitTable<Row>
          rows={rules.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={rules.loading}
          onRefresh={() => void rules.reload()}
          empty="No bill rules yet."
          searchPlaceholder="Search code or bill…"
          statusOf={(r) => String(r.status)}
          columns={[
            { header: "Code", cell: (r) => String(r.code), value: (r) => String(r.code) },
            { header: "Bill", cell: (r) => BILL_LABEL[String(r.bill_type)] ?? String(r.bill_type), value: (r) => BILL_LABEL[String(r.bill_type)] ?? String(r.bill_type) },
            {
              header: "Rule",
              cell: (r) => `${BASIS_LABEL[String(r.eligibility_basis)] ?? String(r.eligibility_basis)}${Number(r.threshold_minutes) ? ` (${String(r.threshold_minutes)} min)` : ""}`,
              hideOnMobile: true,
            },
            { header: "Amount", align: "right", cell: (r) => money(r.amount), value: (r) => Number(r.amount) },
            { header: "From", cell: (r) => String(r.effective_from), value: (r) => String(r.effective_from), hideOnMobile: true },
            { header: "Status", cell: (r) => statusBadge(r.status), value: (r) => String(r.status) },
          ]}
          actions={(r) => [
            {
              label: "Approve",
              primary: true,
              positive: true,
              disabled: busy,
              hidden: r.status !== "DRAFT",
              onClick: () =>
                window.confirm(`Approve bill rule ${String(r.code)} (${money(r.amount)})?`) &&
                void run(async () => { await hrBangladeshApi.approveAllowanceRule(Number(r.id)); await rules.reload(); }, "Rule approved."),
            },
          ]}
        />
      </Card>

      <Card title="Generate bills from attendance" description="Preview, then generate. Days already generated are skipped.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From" htmlFor="al-gfrom">
            <input id="al-gfrom" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="al-gto">
            <input id="al-gto" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(async () => setPreview(await hrBangladeshApi.previewAllowances(from, to)))}>
            Preview
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await hrBangladeshApi.generateAllowances(from, to);
                setPreview(null);
                await entries.reload();
              }, "Bills generated for review.")
            }
          >
            Generate
          </button>
        </div>
        {preview ? (
          <p className="text-sm text-text-secondary">
            {preview.eligible} bill(s):{" "}
            {Object.entries(preview.totals)
              .map(([k, v]) => `${BILL_LABEL[k] ?? k} ${money(v)}`)
              .join(", ") || "none"}
          </p>
        ) : null}
      </Card>

      <Card
        title="Bills"
        actions={
          <>
            <select aria-label="Filter by status" className="rounded border border-border-strong px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All</option>
            </select>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || pendingIds.length === 0}
              onClick={() =>
                window.confirm(`Approve ${pendingIds.length} pending bill(s)?`) &&
                void run(async () => {
                  await hrBangladeshApi.approveAllowances(pendingIds);
                  await entries.reload();
                }, "Bills approved.")
              }
            >
              Approve all pending ({pendingIds.length})
            </button>
          </>
        }
      >
        <KitTable<Row>
          rows={(entries.data ?? []).slice(0, 500)}
          rowKey={(r) => String(r.id)}
          loading={entries.loading}
          onRefresh={() => void entries.reload()}
          empty="No bills."
          searchPlaceholder="Search date, employee or rule…"
          defaultPageSize={50}
          columns={[
            { header: "Date", cell: (r) => String(r.work_date), value: (r) => String(r.work_date) },
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            { header: "Rule", cell: (r) => ruleName(r.rule_id), value: (r) => ruleName(r.rule_id), hideOnMobile: true },
            { header: "Amount", align: "right", cell: (r) => money(r.amount), value: (r) => Number(r.amount) },
            { header: "Status", cell: (r) => statusBadge(r.status), value: (r) => String(r.status) },
          ]}
          actions={(r) => [
            {
              label: "Correct amount",
              primary: true,
              disabled: busy,
              hidden: r.status !== "PENDING",
              onClick: () => {
                const amount = window.prompt("New amount (Tk)", String(r.amount));
                const reason = amount ? window.prompt("Reason for the correction") : null;
                if (amount && reason && reason.trim().length >= 3)
                  void run(async () => { await hrBangladeshApi.correctAllowance(Number(r.id), amount, reason.trim()); await entries.reload(); }, "Corrected.");
              },
            },
            {
              label: "Reject",
              danger: true,
              disabled: busy,
              hidden: r.status === "REJECTED" || r.status === "PAID" || Boolean(r.payroll_run_line_id) || Boolean(r.final_settlement_id),
              onClick: () => window.confirm("Reject this bill?") && void run(async () => { await hrBangladeshApi.rejectAllowance(Number(r.id)); await entries.reload(); }, "Rejected."),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function ProductionBonus() {
  const employees = useEmployees();
  const schemes = useLoad(() => hrBangladeshApi.productionSchemes(), []);
  const entries = useLoad(() => hrBangladeshApi.productionEntries(), []);
  const [form, setForm] = useState({ code: "", name: "", basis: "PIECE", rate_per_piece: "", target_pieces: "", efficiency_threshold_pct: "", bonus_amount: "", cap_amount: "", effective_from: monthStart() });
  const [gen, setGen] = useState({ scheme_id: "", period_code: "", period_start: monthStart(), period_end: todayIso() });
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };
  const num = (v: string) => (v.trim() === "" ? null : v);
  const pendingIds = (entries.data ?? []).filter((e) => e.status === "PENDING").map((e) => Number(e.id));

  return (
    <div className="space-y-4">
      <Messages error={error || schemes.error || entries.error} notice={notice} />
      <Card title="Production bonus schemes" description="Piece rate, efficiency above a threshold, or a fixed bonus for reaching a target. Output comes from hourly production / scan records.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code" htmlFor="pb-code">
            <input id="pb-code" className={inputCls} maxLength={24} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label="Name" htmlFor="pb-name">
            <input id="pb-name" className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Basis" htmlFor="pb-basis">
            <select id="pb-basis" className={inputCls} value={form.basis} onChange={(e) => setForm((f) => ({ ...f, basis: e.target.value }))}>
              <option value="PIECE">Per piece</option>
              <option value="EFFICIENCY">Efficiency above threshold</option>
              <option value="TARGET">Target reached</option>
            </select>
          </Field>
          {form.basis === "PIECE" ? (
            <Field label="Rate per piece (Tk)" htmlFor="pb-rate">
              <input id="pb-rate" type="number" min={0} step="0.0001" className={inputCls} value={form.rate_per_piece} onChange={(e) => setForm((f) => ({ ...f, rate_per_piece: e.target.value }))} />
            </Field>
          ) : null}
          {form.basis === "TARGET" ? (
            <Field label="Target pieces" htmlFor="pb-target">
              <input id="pb-target" type="number" min={1} className={inputCls} value={form.target_pieces} onChange={(e) => setForm((f) => ({ ...f, target_pieces: e.target.value }))} />
            </Field>
          ) : null}
          {form.basis === "EFFICIENCY" ? (
            <Field label="Efficiency threshold %" htmlFor="pb-eff">
              <input id="pb-eff" type="number" min={1} max={300} className={inputCls} value={form.efficiency_threshold_pct} onChange={(e) => setForm((f) => ({ ...f, efficiency_threshold_pct: e.target.value }))} />
            </Field>
          ) : null}
          {form.basis !== "PIECE" ? (
            <Field label="Bonus amount (Tk)" htmlFor="pb-amt">
              <input id="pb-amt" type="number" min={0} step="0.01" className={inputCls} value={form.bonus_amount} onChange={(e) => setForm((f) => ({ ...f, bonus_amount: e.target.value }))} />
            </Field>
          ) : null}
          <Field label="Cap per employee (Tk)" htmlFor="pb-cap">
            <input id="pb-cap" type="number" min={0} step="0.01" className={inputCls} value={form.cap_amount} onChange={(e) => setForm((f) => ({ ...f, cap_amount: e.target.value }))} />
          </Field>
          <Field label="From" htmlFor="pb-from">
            <input id="pb-from" type="date" className={inputCls} value={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !form.code.trim() || !form.name.trim()}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.createProductionScheme({
                    code: form.code.trim(),
                    name: form.name.trim(),
                    basis: form.basis,
                    rate_per_piece: num(form.rate_per_piece),
                    target_pieces: form.target_pieces ? Number(form.target_pieces) : null,
                    efficiency_threshold_pct: num(form.efficiency_threshold_pct),
                    bonus_amount: num(form.bonus_amount),
                    cap_amount: num(form.cap_amount),
                    effective_from: form.effective_from,
                  });
                  await schemes.reload();
                }, "Scheme created. A manager must approve it.")
              }
            >
              Add scheme
            </button>
          </div>
        </div>
        <KitTable<Row>
          rows={schemes.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={schemes.loading}
          onRefresh={() => void schemes.reload()}
          empty="No schemes yet."
          searchPlaceholder="Search code or name…"
          statusOf={(r) => String(r.status)}
          columns={[
            { header: "Code", cell: (r) => String(r.code), value: (r) => String(r.code) },
            { header: "Name", cell: (r) => String(r.name), value: (r) => String(r.name) },
            { header: "Basis", cell: (r) => String(r.basis), value: (r) => String(r.basis), hideOnMobile: true },
            { header: "Cap", align: "right", cell: (r) => (r.cap_amount ? money(r.cap_amount) : "-"), value: (r) => (r.cap_amount ? Number(r.cap_amount) : null), hideOnMobile: true },
            { header: "Status", cell: (r) => statusBadge(r.status), value: (r) => String(r.status) },
          ]}
          actions={(r) => [
            {
              label: "Approve",
              primary: true,
              positive: true,
              disabled: busy,
              hidden: r.status !== "DRAFT",
              onClick: () =>
                window.confirm(`Approve production bonus scheme ${String(r.code)}?`) &&
                void run(async () => { await hrBangladeshApi.approveProductionScheme(Number(r.id)); await schemes.reload(); }, "Scheme approved."),
            },
          ]}
        />
      </Card>

      <Card title="Calculate bonus for a period">
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Scheme" htmlFor="pbg-scheme">
            <select id="pbg-scheme" className={inputCls} value={gen.scheme_id} onChange={(e) => setGen((g) => ({ ...g, scheme_id: e.target.value }))}>
              <option value="">Choose approved scheme</option>
              {(schemes.data ?? [])
                .filter((s) => s.status === "APPROVED")
                .map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.code)} - {String(s.name)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Period code" htmlFor="pbg-code" hint="e.g. 2026-11">
            <input id="pbg-code" className={inputCls} maxLength={16} value={gen.period_code} onChange={(e) => setGen((g) => ({ ...g, period_code: e.target.value }))} />
          </Field>
          <Field label="From" htmlFor="pbg-from">
            <input id="pbg-from" type="date" className={inputCls} value={gen.period_start} onChange={(e) => setGen((g) => ({ ...g, period_start: e.target.value }))} />
          </Field>
          <Field label="To" htmlFor="pbg-to">
            <input id="pbg-to" type="date" className={inputCls} value={gen.period_end} onChange={(e) => setGen((g) => ({ ...g, period_end: e.target.value }))} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !gen.scheme_id || !gen.period_code.trim()}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.generateProductionBonus({ ...gen, scheme_id: Number(gen.scheme_id), period_code: gen.period_code.trim() });
                  await entries.reload();
                }, "Production bonus calculated for review.")
              }
            >
              Calculate
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="Production bonus entries"
        actions={
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || pendingIds.length === 0}
            onClick={() =>
              window.confirm(`Approve ${pendingIds.length} pending entr(ies)?`) &&
              void run(async () => {
                await hrBangladeshApi.approveProductionEntries(pendingIds);
                await entries.reload();
              }, "Entries approved.")
            }
          >
            Approve all pending ({pendingIds.length})
          </button>
        }
      >
        <KitTable<Row>
          rows={(entries.data ?? []).slice(0, 500)}
          rowKey={(r) => String(r.id)}
          loading={entries.loading}
          onRefresh={() => void entries.reload()}
          empty="No entries."
          searchPlaceholder="Search period or employee…"
          statusOf={(r) => String(r.status)}
          defaultPageSize={50}
          columns={[
            { header: "Period", cell: (r) => String(r.period_code), value: (r) => String(r.period_code) },
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            { header: "Pieces", align: "right", cell: (r) => String(r.quantity ?? "-"), value: (r) => (r.quantity == null ? null : Number(r.quantity)), hideOnMobile: true },
            { header: "Efficiency %", align: "right", cell: (r) => String(r.efficiency_pct ?? "-"), value: (r) => (r.efficiency_pct == null ? null : Number(r.efficiency_pct)), hideOnMobile: true },
            { header: "Amount", align: "right", cell: (r) => money(r.amount), value: (r) => Number(r.amount) },
            { header: "Status", cell: (r) => statusBadge(r.status), value: (r) => String(r.status) },
          ]}
        />
      </Card>
    </div>
  );
}

function FestivalBonus() {
  const employees = useEmployees();
  const declarations = useLoad(() => api.listHrPayrollBonuses(), []);
  const [declId, setDeclId] = useState("");
  const lines = useLoad(() => (declId ? hrBangladeshApi.festivalBonusLines(Number(declId)) : Promise.resolve([] as Row[])), [declId]);
  const [cutoff, setCutoff] = useState(todayIso());
  const [pct, setPct] = useState("100");
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };
  const total = (lines.data ?? []).filter((l) => l.eligible).reduce((s, l) => s + Number(l.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <Messages error={error || declarations.error || lines.error} notice={notice} />
      <Banner kind="info">
        Company policy, not automated as statutory: employees with at least one year of service get a percentage of their basic wage (up to 100%). Create the declaration on{" "}
        <Link to="/app/hr/payroll/bonuses" className="underline">
          Bonuses
        </Link>{" "}
        first.
      </Banner>
      <Card title="Eid / festival bonus">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Bonus declaration" htmlFor="fb-decl">
            <select id="fb-decl" className={inputCls} value={declId} onChange={(e) => setDeclId(e.target.value)}>
              <option value="">Choose declaration</option>
              {(declarations.data ?? []).map((d) => (
                <option key={String(d.id)} value={String(d.id)}>
                  {String(d.title)} ({String(d.period_code)}, {String(d.status)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service cut-off date" htmlFor="fb-cutoff" hint="One year of service counted up to this date">
            <input id="fb-cutoff" type="date" className={inputCls} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          </Field>
          <Field label="% of basic" htmlFor="fb-pct">
            <input id="fb-pct" type="number" min={1} max={100} className={inputCls} value={pct} onChange={(e) => setPct(e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={busy || !declId}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.allocateFestivalBonus(Number(declId), cutoff, pct);
                  await lines.reload();
                }, "Bonus allocated. Review, then approve.")
              }
            >
              Allocate
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || !declId || !(lines.data ?? []).length}
              onClick={() =>
                window.confirm(`Approve festival bonus totalling ${money(total)}? Approved lines are paid in the next payroll run.`) &&
                void run(async () => {
                  await hrBangladeshApi.approveFestivalBonus(Number(declId));
                  await lines.reload();
                }, "Festival bonus approved.")
              }
            >
              Approve
            </button>
          </div>
        </div>
        <KitTable<Row>
          rows={lines.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={Boolean(declId) && lines.loading}
          empty={declId ? "Not allocated yet." : "Choose a declaration."}
          searchPlaceholder="Search employee…"
          statusOf={(r) => (r.eligible ? "Eligible" : "Not eligible")}
          defaultPageSize={50}
          columns={[
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            { header: "Eligible", cell: (r) => (r.eligible ? "Yes" : `No: ${String(r.eligibility_reason ?? "")}`), value: (r) => (r.eligible ? "Yes" : "No") },
            { header: "Basic", align: "right", cell: (r) => money(r.basis_amount), value: (r) => Number(r.basis_amount), hideOnMobile: true },
            { header: "Bonus", align: "right", cell: (r) => money(r.amount), value: (r) => Number(r.amount) },
            { header: "Status", cell: (r) => statusBadge(r.status), value: (r) => String(r.status), hideOnMobile: true },
          ]}
        />
        {(lines.data ?? []).length ? <p className="text-sm font-medium text-text-primary">Total eligible bonus: {money(total)}</p> : null}
      </Card>
    </div>
  );
}

export function HrAllowancesBonusesPage() {
  const [tab, setTab] = useState<Tab>("meal");
  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Allowances & bonuses"
        description="Tiffin, dinner and night bills, production bonus and the Eid / festival bonus. Each needs its switch in Settings → Configuration (off by default)."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Payroll", href: "/app/hr/payroll/runs" }, { label: "Allowances & bonuses" }]}
      />
      <div role="tablist" className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(
          [
            ["meal", "Tiffin / dinner / night bills"],
            ["production", "Production bonus"],
            ["festival", "Eid / festival bonus"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "meal" && <MealBills />}
      {tab === "production" && <ProductionBonus />}
      {tab === "festival" && <FestivalBonus />}
    </div>
  );
}
