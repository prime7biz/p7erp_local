/** Give an employee a Gazette wage grade (used by the minimum-wage check and enforcement). */
import { useState } from "react";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { Banner, Card, Field, Messages, SimpleTable, btnPrimary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, money, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";

export function WageGradesTab() {
  const employees = useEmployees();
  const rates = useLoad(async () => {
    const enf = await hrBangladeshApi.bdEnforcement();
    return enf.approved_rule_set ? (await hrBangladeshApi.bdRuleSet(enf.approved_rule_set.id)).rates ?? [] : [];
  }, []);
  const list = useLoad(() => hrBangladeshApi.bdWageAssignments(), []);
  const [emp, setEmp] = useState<number | null>(null);
  const [rateId, setRateId] = useState("");
  const [from, setFrom] = useState(todayIso());
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };

  return (
    <div className="space-y-4">
      <Messages error={error || list.error || rates.error} notice={notice} />
      {rates.data && rates.data.length === 0 ? <Banner kind="warning">Approve a rule set first; grades come from the approved Gazette schedule.</Banner> : null}
      <Card title="Assign wage grade" description="The grade decides the legal minimum basic and gross for this employee from the given date.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Employee" htmlFor="bd-wa-emp">
            <EmployeePicker id="bd-wa-emp" employees={employees.data ?? []} value={emp} onChange={setEmp} />
          </Field>
          <Field label="Grade" htmlFor="bd-wa-rate">
            <select id="bd-wa-rate" className={inputCls} value={rateId} onChange={(e) => setRateId(e.target.value)}>
              <option value="">Choose grade</option>
              {(rates.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rate_code} - gross {money(r.gross)} (basic {money(r.basic)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="From" htmlFor="bd-wa-from">
            <input id="bd-wa-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={!emp || !rateId || busy}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.bdAssignWage({ employee_id: emp as number, wage_rate_id: Number(rateId), effective_from: from });
                  await list.reload();
                }, "Wage grade assigned.")
              }
            >
              Assign
            </button>
          </div>
        </div>
      </Card>
      <Card title="Wage grade history">
        <SimpleTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => String(r.id)}
          empty={list.loading ? "Loading..." : "No wage grades assigned yet."}
          columns={[
            { header: "Employee", cell: (r) => empName(r.employee_id) },
            { header: "Grade", cell: (r) => String(r.rate_code) },
            { header: "From", cell: (r) => String(r.effective_from) },
            { header: "To", cell: (r) => String(r.effective_to ?? "open") },
          ]}
        />
      </Card>
    </div>
  );
}
