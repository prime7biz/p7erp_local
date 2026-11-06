/**
 * Salary sheets and registers for a finalized payroll run.
 * Freeze first: every sheet, register and slip is then printed from the same frozen copy.
 * Individual wage slips are private (one PDF per employee); they are not for the notice board.
 */
import { useMemo, useState } from "react";
import { api, type HrPayrollRunResponse } from "@/api/client";
import { hrBangladeshApi, openBlob, type Row } from "@/api/hrBangladesh";
import { ActionsMenu, Badge, Banner, Card, Field, Messages, SimpleTable, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { money, useAction, useLoad } from "@/components/hr/bd/bdHooks";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const FROZEN_STATUSES = ["FINALIZED", "APPROVED", "POSTED"];

interface SheetSection {
  department: string;
  lines: Row[];
  subtotal: Row;
}

interface SheetData {
  run: Row;
  reconciled: boolean;
  earning_codes: string[];
  deduction_codes: string[];
  sections: SheetSection[];
  top_sheet: { rows: Row[]; grand_total: Row };
}

function TopSheet({ data }: { data: SheetData }) {
  const rows = [...data.top_sheet.rows, { department: "Grand total", ...data.top_sheet.grand_total }];
  return (
    <SimpleTable<Row>
      rows={rows}
      rowKey={(r) => String(r.department)}
      empty="No lines."
      columns={[
        { header: "Department", cell: (r) => <span className={r.department === "Grand total" ? "font-semibold" : ""}>{String(r.department)}</span> },
        { header: "Employees", align: "right", cell: (r) => String(r.employees) },
        { header: "Present days", align: "right", cell: (r) => String(r.days_present) },
        { header: "Absent", align: "right", cell: (r) => String(r.absent_days) },
        { header: "Paid leave", align: "right", cell: (r) => String(r.paid_leave_days) },
        { header: "OT hours", align: "right", cell: (r) => String(r.ot_hours) },
        { header: "OT amount", align: "right", cell: (r) => money(r.ot_amount) },
        ...data.earning_codes
          .filter((c) => !["BD-BASIC", "BD-HRENT", "BD-MEDICAL", "BD-TRANSPORT", "BD-FOOD"].includes(c))
          .map((c) => ({ header: c, align: "right" as const, cell: (r: Row) => money(((r.components ?? {}) as Record<string, string>)[c]) })),
        { header: "Gross", align: "right", cell: (r) => money(r.gross) },
        { header: "Deductions", align: "right", cell: (r) => money(r.deductions) },
        { header: "Net pay", align: "right", cell: (r) => <span className="font-semibold">{money(r.net)}</span> },
      ]}
    />
  );
}

function Acknowledgements({ runId }: { runId: number }) {
  const list = useLoad(() => hrBangladeshApi.acknowledgements(runId), [runId]);
  const [method, setMethod] = useState("CASH");
  const { busy, error, notice, run } = useAction();

  const record = (r: Row) => {
    let reference: string | null = null;
    let signature = false;
    if (method === "CASH") {
      signature = window.confirm(`Has ${String(r.name)} signed for the cash wages (revenue stamp where required)?`);
      if (!signature) return;
    } else {
      reference = window.prompt(method === "MFS" ? "bKash / Nagad / Rocket transaction ID" : "Bank transfer reference");
      if (!reference) return;
    }
    void run(async () => {
      await hrBangladeshApi.acknowledge(runId, { run_line_id: r.run_line_id, payment_method: method, payment_reference: reference, signature_collected: signature });
      await list.reload();
    }, "Payment recorded.");
  };

  return (
    <Card
      title="Wage payment acknowledgements"
      description={`Record how each worker was paid. ${list.data ? `${list.data.pending} still pending.` : ""}`}
      actions={
        <Field label="Payment method" htmlFor="ack-method">
          <select id="ack-method" className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">Cash (signature)</option>
            <option value="MFS">Mobile financial service</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </Field>
      }
    >
      <Messages error={error || list.error} notice={notice} />
      <SimpleTable<Row>
        rows={list.data?.rows ?? []}
        rowKey={(r) => String(r.run_line_id)}
        empty={list.loading ? "Loading..." : "No lines."}
        columns={[
          { header: "Employee", cell: (r) => `${String(r.employee_code)} - ${String(r.name)}` },
          { header: "Department", cell: (r) => String(r.department) },
          { header: "Net pay", align: "right", cell: (r) => money(r.net) },
          { header: "Paid by", cell: (r) => (r.acknowledged ? `${String(r.payment_method)} ${String(r.payment_reference ?? "")}` : "-") },
          { header: "Status", cell: (r) => <Badge tone={r.acknowledged ? "green" : "amber"}>{r.acknowledged ? "Acknowledged" : "Pending"}</Badge> },
          {
            header: "Actions",
            align: "right",
            cell: (r) => <ActionsMenu items={[{ label: "Record payment", hidden: Boolean(r.acknowledged) || busy, onClick: () => record(r) }]} />,
          },
        ]}
      />
    </Card>
  );
}

export function HrPayrollRegistersPage() {
  const runs = useLoad<HrPayrollRunResponse[]>(() => api.listHrPayrollRuns(), []);
  const departments = useLoad(() => api.listHrDepartments({ active_only: false }), []);
  const [runId, setRunId] = useState<number | null>(null);
  const [deptId, setDeptId] = useState("");
  const [view, setView] = useState<"top" | "departments" | "payments">("top");
  const snapshot = useLoad(() => (runId ? hrBangladeshApi.payrollSnapshot(runId) : Promise.resolve(null)), [runId]);
  const sheet = useLoad(
    () => (runId && snapshot.data ? (hrBangladeshApi.salarySheet(runId, deptId ? Number(deptId) : undefined) as unknown as Promise<SheetData>) : Promise.resolve(null)),
    [runId, snapshot.data, deptId],
  );
  const { busy, error, notice, run } = useAction();

  const eligibleRuns = useMemo(() => (runs.data ?? []).filter((r) => FROZEN_STATUSES.includes(String(r.status))), [runs.data]);
  const selected = eligibleRuns.find((r) => r.id === runId);
  const dept = deptId ? Number(deptId) : undefined;
  const period = String(sheet.data?.run.period_code ?? selected?.id ?? "");

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Salary sheets & registers"
        description="Department-wise salary sheets with a top sheet, the wage register and private wage slips, printed from a frozen copy of a finalized payroll run."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Payroll", href: "/app/hr/payroll/runs" }, { label: "Salary sheets & registers" }]}
      />
      <Messages error={error || runs.error || snapshot.error || sheet.error} notice={notice} />
      <Card title="Choose payroll run" description="Only finalized, approved or posted runs can be printed.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Payroll run" htmlFor="reg-run">
            <select id="reg-run" className={inputCls} value={runId ?? ""} onChange={(e) => setRunId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Choose run</option>
              {eligibleRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.run_code ?? `Run #${r.id}`} ({r.status})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department" htmlFor="reg-dept">
            <select id="reg-dept" className={inputCls} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">All departments</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {runId && !snapshot.loading && !snapshot.data ? (
          <div className="flex flex-wrap items-center gap-3">
            <Banner kind="warning">This run is not frozen yet. Freezing keeps every printed sheet and slip identical, even if someone edits the run later.</Banner>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.freezePayroll(runId);
                  await snapshot.reload();
                }, "Payroll documents frozen.")
              }
            >
              Freeze documents
            </button>
          </div>
        ) : null}
        {snapshot.data ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">Frozen {String(snapshot.data.generated_at ?? "").slice(0, 16).replace("T", " ")}</Badge>
            {sheet.data && !sheet.data.reconciled ? <Badge tone="red">Totals do not match the run</Badge> : null}
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(async () => openBlob(await hrBangladeshApi.salarySheetPdf(runId as number, dept), `salary-sheet-${period}.pdf`))}>
              Print salary sheet + top sheet
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(async () => openBlob(await hrBangladeshApi.wageRegisterPdf(runId as number), `wage-register-${period}.pdf`))}>
              Wage register (Form 38)
            </button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(async () => openBlob(await hrBangladeshApi.payslipsZip(runId as number), `wage-slips-${period}.zip`), "Private wage slips downloaded (one PDF per employee).")}>
              Private wage slips (ZIP)
            </button>
          </div>
        ) : null}
      </Card>

      {snapshot.data && sheet.data ? (
        <>
          <div role="tablist" className="flex flex-wrap gap-2 border-b border-border pb-2">
            {(
              [
                ["top", "Top sheet"],
                ["departments", "Department sheets"],
                ["payments", "Payments"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "top" ? (
            <Card title={`Top sheet - ${period}`} description="One line per department: attendance, overtime, allowances and pay totals.">
              <TopSheet data={sheet.data} />
            </Card>
          ) : null}
          {view === "departments"
            ? sheet.data.sections.map((s) => (
                <Card key={s.department} title={s.department} description={`${String(s.subtotal.employees)} employee(s) · net ${money(s.subtotal.net)}`}>
                  <SimpleTable<Row>
                    rows={s.lines}
                    rowKey={(r) => String(r.run_line_id)}
                    empty="No lines."
                    columns={[
                      { header: "No.", cell: (r) => String(r.employee_code) },
                      { header: "Name", cell: (r) => String(r.name) },
                      { header: "Designation", cell: (r) => String(r.designation ?? "") },
                      { header: "Grade", cell: (r) => String(r.grade ?? "") },
                      { header: "Present", align: "right", cell: (r) => String(r.days_present) },
                      { header: "Absent", align: "right", cell: (r) => String(r.absent_days) },
                      { header: "OT h", align: "right", cell: (r) => String(r.ot_hours) },
                      { header: "OT", align: "right", cell: (r) => money(r.ot_amount) },
                      { header: "Gross", align: "right", cell: (r) => money(r.gross) },
                      { header: "Deductions", align: "right", cell: (r) => money(r.deductions) },
                      { header: "Net", align: "right", cell: (r) => <span className="font-semibold">{money(r.net)}</span> },
                    ]}
                  />
                </Card>
              ))
            : null}
          {view === "payments" && runId ? <Acknowledgements runId={runId} /> : null}
        </>
      ) : null}
    </div>
  );
}
