/** Read-only checks: nothing here changes data. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { Badge, Banner, Card, Field, Messages, SimpleTable, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { money, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { SEPARATION_TYPE_LABELS } from "@/components/hr/bd/bdLabels";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";

const GAP_TONE: Record<string, "green" | "red" | "amber"> = { ok: "green", below_minimum: "red", no_grade: "amber", no_salary_assignment: "amber" };
const GAP_LABEL: Record<string, string> = {
  ok: "OK",
  below_minimum: "Below minimum",
  no_grade: "No wage grade",
  no_salary_assignment: "No salary assignment",
};

function ResultBox({ result }: { result: Row | null }) {
  if (!result) return null;
  const trace = (result.trace ?? {}) as Record<string, unknown>;
  const warnings = (result.warnings ?? []) as string[];
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <p>
        Amount: <span className="text-lg font-semibold text-text-primary">{money(result.amount)}</span>{" "}
        {result.eligible === false ? <Badge tone="red">Not eligible</Badge> : <Badge tone="green">Eligible</Badge>}
      </p>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {Object.entries(trace).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-border py-0.5 text-xs">
            <span className="text-text-muted">{k.replace(/_/g, " ")}</span>
            <span className="text-text-primary">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
          </div>
        ))}
      </div>
      {warnings.map((w) => (
        <Banner key={w} kind="warning">
          {w}
        </Banner>
      ))}
      <p className="text-xs text-text-muted">Rule source: {String(result.source ?? "")}</p>
    </div>
  );
}

export function ChecksTab() {
  const employees = useEmployees();
  const [onlyGaps, setOnlyGaps] = useState(true);
  const wage = useLoad(() => hrBangladeshApi.bdPreviewMinimumWage(), []);
  const [year, setYear] = useState(new Date().getFullYear());
  const [festival, setFestival] = useState<Row | null>(null);
  const [sbEmp, setSbEmp] = useState<number | null>(null);
  const [sbType, setSbType] = useState("RESIGNATION");
  const [sbDate, setSbDate] = useState(todayIso());
  const [sbResult, setSbResult] = useState<Row | null>(null);
  const [matEmp, setMatEmp] = useState<number | null>(null);
  const [matEdd, setMatEdd] = useState("");
  const [matChildren, setMatChildren] = useState("0");
  const [matResult, setMatResult] = useState<Row | null>(null);
  const { busy, error, run } = useAction();

  const rows = (wage.data?.employees ?? []).filter((r) => !onlyGaps || r.status !== "ok");

  return (
    <div className="space-y-4">
      <Messages error={error || wage.error} />
      <Card
        title="Minimum wage check"
        description={`Compares each active employee's basic and gross with their Gazette grade. ${wage.data ? `${wage.data.gap_count} employee(s) need attention.` : ""}`}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> Only problems
            </label>
            <button type="button" className={btnSecondary} onClick={() => void wage.reload()}>
              Refresh
            </button>
          </>
        }
      >
        <SimpleTable<Row>
          rows={rows}
          rowKey={(r) => String(r.employee_id)}
          empty={wage.loading ? "Loading..." : "Everyone meets the minimum wage."}
          columns={[
            { header: "Employee", cell: (r) => `${String(r.employee_code)} - ${String(r.name)}` },
            { header: "Structure", cell: (r) => String(r.structure_code ?? "-") },
            { header: "Grade", cell: (r) => String(r.rate_code ?? "-") },
            { header: "Basic", align: "right", cell: (r) => money(r.basic) },
            { header: "Gross", align: "right", cell: (r) => money(r.gross) },
            { header: "Short (basic)", align: "right", cell: (r) => money(r.shortfall_basic) },
            { header: "Short (gross)", align: "right", cell: (r) => money(r.shortfall_gross) },
            { header: "Status", cell: (r) => <Badge tone={GAP_TONE[String(r.status)] ?? "amber"}>{GAP_LABEL[String(r.status)] ?? String(r.status)}</Badge> },
          ]}
        />
        <p className="text-xs text-text-muted">
          Fix gaps on <Link to="/app/hr/payroll/assignments" className="underline">Structure assignments</Link> or assign a grade on the Wage grades tab.
        </p>
      </Card>

      <Card title="Festival holidays (s.118)" description="The law requires 13 paid festival holidays a year. Checks the company holiday list and shows who worked on a holiday.">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Year" htmlFor="bd-fest-year">
            <input id="bd-fest-year" type="number" min={2023} max={2100} className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </Field>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void run(async () => setFestival(await hrBangladeshApi.bdPreviewFestival(year)))}>
            Check
          </button>
        </div>
        {festival ? (
          <div className="space-y-2 text-sm">
            <p>
              {String(festival.configured_days)} of {String(festival.required_days)} festival holidays are set.{" "}
              <Link to="/app/hr/attendance/holidays" className="underline">
                Edit holidays
              </Link>
            </p>
            {((festival.warnings ?? []) as string[]).map((w) => (
              <Banner key={w} kind="warning">
                {w}
              </Banner>
            ))}
            {((festival.worked_on_holiday ?? []) as { date: string; employees: number }[]).map((w) => (
              <p key={w.date} className="text-text-secondary">
                {w.date}: {w.employees} employee(s) worked
              </p>
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Service benefit calculator" description="Gratuity / resignation / termination / death amount from basic wage and length of service. Shows the legal section used.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Employee" htmlFor="bd-sb-emp">
            <EmployeePicker id="bd-sb-emp" employees={employees.data ?? []} value={sbEmp} onChange={setSbEmp} />
          </Field>
          <Field label="Reason for leaving" htmlFor="bd-sb-type">
            <select id="bd-sb-type" className={inputCls} value={sbType} onChange={(e) => setSbType(e.target.value)}>
              {Object.entries(SEPARATION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Last day" htmlFor="bd-sb-date">
            <input id="bd-sb-date" type="date" className={inputCls} value={sbDate} onChange={(e) => setSbDate(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={!sbEmp || busy}
              onClick={() =>
                void run(async () =>
                  setSbResult(await hrBangladeshApi.bdPreviewServiceBenefit({ employee_id: sbEmp as number, separation_type: sbType, separation_date: sbDate })),
                )
              }
            >
              Calculate
            </button>
          </div>
        </div>
        <ResultBox result={sbResult} />
      </Card>

      <Card title="Maternity benefit calculator" description="120 days (60 before + 60 after delivery). Eligible after 6 months' service with fewer than 2 surviving children.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Employee" htmlFor="bd-mat-emp">
            <EmployeePicker id="bd-mat-emp" employees={employees.data ?? []} value={matEmp} onChange={setMatEmp} />
          </Field>
          <Field label="Expected delivery date" htmlFor="bd-mat-edd">
            <input id="bd-mat-edd" type="date" className={inputCls} value={matEdd} onChange={(e) => setMatEdd(e.target.value)} />
          </Field>
          <Field label="Surviving children" htmlFor="bd-mat-children">
            <input id="bd-mat-children" type="number" min={0} max={20} className={inputCls} value={matChildren} onChange={(e) => setMatChildren(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={!matEmp || !matEdd || busy}
              onClick={() =>
                void run(async () =>
                  setMatResult(
                    await hrBangladeshApi.bdPreviewMaternity({ employee_id: matEmp as number, expected_delivery_date: matEdd, surviving_children: Number(matChildren) }),
                  ),
                )
              }
            >
              Calculate
            </button>
          </div>
        </div>
        <ResultBox result={matResult} />
      </Card>
    </div>
  );
}
