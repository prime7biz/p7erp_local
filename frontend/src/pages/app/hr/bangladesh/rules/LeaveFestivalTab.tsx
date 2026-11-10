/** Earned-leave accrual (1 day per 18 worked days) and festival-holiday work compensation. */
import { useState } from "react";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Badge, Banner, Card, Field, Messages, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, money, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function LeaveFestivalTab() {
  const employees = useEmployees();
  const [pStart, setPStart] = useState(yearStart());
  const [pEnd, setPEnd] = useState(todayIso());
  const [accrual, setAccrual] = useState<{ employees: Row[]; leave_type_found: boolean } | null>(null);
  const [fFrom, setFFrom] = useState(yearStart());
  const [fTo, setFTo] = useState(todayIso());
  const festival = useLoad(() => hrBangladeshApi.bdFestivalWork(), []);
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };
  const totalDays = (accrual?.employees ?? []).reduce((s, r) => s + Number(r.accrued_days ?? 0), 0);

  return (
    <div className="space-y-4">
      <Messages error={error || festival.error} notice={notice} />
      <Card title="Earned leave accrual (s.117)" description="Preview first. Apply adds the days to each employee's BD-EL balance once per period (needs earned-leave enforcement ON).">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Period start" htmlFor="bd-el-start">
            <input id="bd-el-start" type="date" className={inputCls} value={pStart} onChange={(e) => setPStart(e.target.value)} />
          </Field>
          <Field label="Period end" htmlFor="bd-el-end">
            <input id="bd-el-end" type="date" className={inputCls} value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
          </Field>
          <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(async () => setAccrual(await hrBangladeshApi.bdAccrualPreview({ period_start: pStart, period_end: pEnd })))}>
            Preview
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || !accrual}
            onClick={() => {
              if (!window.confirm(`Add ${totalDays.toFixed(2)} earned-leave day(s) in total to employee balances?`)) return;
              void run(async () => {
                const r = await hrBangladeshApi.bdAccrualApply({ period_start: pStart, period_end: pEnd });
                setAccrual(null);
                return r;
              }, "Accrual applied. Employees already done for this period were skipped.");
            }}
          >
            Apply
          </button>
        </div>
        {accrual && !accrual.leave_type_found ? <Banner kind="warning">Leave type BD-EL is missing. Run Bangladesh setup first.</Banner> : null}
        {accrual ? (
          <KitTable<Row>
            rows={accrual.employees}
            rowKey={(r) => String(r.employee_id)}
            empty="No active employees."
            searchPlaceholder="Search employee…"
            defaultPageSize={50}
            columns={[
              { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
              { header: "Worked days", align: "right", cell: (r) => String(r.worked_days), value: (r) => Number(r.worked_days) },
              { header: "Earned days", align: "right", cell: (r) => String(r.accrued_days), value: (r) => Number(r.accrued_days) },
              {
                header: "Notes",
                cell: (r) => <span className="text-xs text-text-muted">{((r.warnings ?? []) as string[]).join("; ")}</span>,
                value: (r) => ((r.warnings ?? []) as string[]).join("; "),
                hideOnMobile: true,
              },
            ]}
          />
        ) : null}
      </Card>

      <Card title="Festival-holiday work (s.118(2))" description="Finds attendance on paid festival holidays. Each day worked earns 2 days' wage plus an alternative holiday; approved amounts are paid in the next payroll.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From" htmlFor="bd-fw-from">
            <input id="bd-fw-from" type="date" className={inputCls} value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </Field>
          <Field label="To" htmlFor="bd-fw-to">
            <input id="bd-fw-to" type="date" className={inputCls} value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </Field>
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await hrBangladeshApi.bdGenerateFestivalWork({ from_date: fFrom, to_date: fTo });
                await festival.reload();
                return r;
              }, "Festival-work entries generated.")
            }
          >
            Find festival work
          </button>
        </div>
        <KitTable<Row>
          rows={festival.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={festival.loading}
          onRefresh={() => void festival.reload()}
          empty="No festival-day work found."
          searchPlaceholder="Search employee or date…"
          statusOf={(r) => String(r.status)}
          columns={[
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            { header: "Date worked", cell: (r) => String(r.work_date), value: (r) => String(r.work_date) },
            { header: "Compensation", align: "right", cell: (r) => money(r.compensation_amount), value: (r) => Number(r.compensation_amount) },
            { header: "Alt. holiday", cell: (r) => String(r.alternative_holiday_date ?? "-"), value: (r) => String(r.alternative_holiday_date ?? ""), hideOnMobile: true },
            {
              header: "Status",
              cell: (r) => <Badge tone={r.status === "APPROVED" ? "green" : r.status === "CANCELLED" ? "gray" : "amber"}>{String(r.status)}</Badge>,
              value: (r) => String(r.status),
            },
            { header: "Payroll", cell: (r) => (r.payroll_run_line_id ? "Included" : r.final_settlement_id ? "In settlement" : "-"), hideOnMobile: true },
          ]}
          actions={(r) => [
            {
              label: "Approve",
              primary: true,
              positive: true,
              disabled: busy,
              hidden: r.status !== "PENDING",
              onClick: () => {
                const alt = window.prompt("Alternative holiday date (YYYY-MM-DD), after the day worked");
                if (alt)
                  void run(async () => {
                    await hrBangladeshApi.bdApproveFestivalWork(Number(r.id), alt.trim());
                    await festival.reload();
                  }, "Approved.");
              },
            },
            {
              label: "Cancel",
              danger: true,
              disabled: busy,
              hidden: r.status === "CANCELLED" || Boolean(r.payroll_run_line_id) || Boolean(r.final_settlement_id),
              onClick: () => {
                if (window.confirm("Cancel this festival-work entry?"))
                  void run(async () => {
                    await hrBangladeshApi.bdCancelFestivalWork(Number(r.id));
                    await festival.reload();
                  }, "Cancelled.");
              },
            },
          ]}
        />
      </Card>
    </div>
  );
}
