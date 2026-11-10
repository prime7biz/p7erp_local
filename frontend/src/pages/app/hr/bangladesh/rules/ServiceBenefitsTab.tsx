/** Service-benefit cases (gratuity / resignation / termination / death), needs service-benefit enforcement ON. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Badge, Card, Field, Messages, btnPrimary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, money, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { SEPARATION_TYPE_LABELS } from "@/components/hr/bd/bdLabels";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";

export function ServiceBenefitsTab() {
  const employees = useEmployees();
  const list = useLoad(() => hrBangladeshApi.bdServiceBenefits(), []);
  const [emp, setEmp] = useState<number | null>(null);
  const [type, setType] = useState("RESIGNATION");
  const [end, setEnd] = useState(todayIso());
  const [permanent, setPermanent] = useState(true);
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };

  return (
    <div className="space-y-4">
      <Messages error={error || list.error} notice={notice} />
      <Card
        title="Service benefit case"
        description={
          <>
            For a full exit (salary, leave, notice pay, clearance and posting) use{" "}
            <Link to="/app/hr/separations" className="underline">
              Separations &amp; settlement
            </Link>
            . This tab records only the statutory service benefit.
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Employee" htmlFor="bd-sbc-emp">
            <EmployeePicker id="bd-sbc-emp" employees={employees.data ?? []} value={emp} onChange={setEmp} />
          </Field>
          <Field label="Type" htmlFor="bd-sbc-type">
            <select id="bd-sbc-type" className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(SEPARATION_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service end date" htmlFor="bd-sbc-end">
            <input id="bd-sbc-end" type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-text-secondary">
            <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} /> Permanent worker
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={!emp || busy}
              onClick={() =>
                void run(async () => {
                  await hrBangladeshApi.bdCreateServiceBenefit({ employee_id: emp as number, benefit_type: type, service_end_date: end, permanent });
                  await list.reload();
                }, "Service-benefit case created.")
              }
            >
              Create
            </button>
          </div>
        </div>
      </Card>
      <Card title="Service-benefit cases">
        <KitTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={list.loading}
          onRefresh={() => void list.reload()}
          empty="No cases."
          searchPlaceholder="Search employee or type…"
          statusOf={(r) => String(r.status)}
          columns={[
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            {
              header: "Type",
              cell: (r) => SEPARATION_TYPE_LABELS[String(r.benefit_type)] ?? String(r.benefit_type),
              value: (r) => SEPARATION_TYPE_LABELS[String(r.benefit_type)] ?? String(r.benefit_type),
            },
            { header: "Service", cell: (r) => `${String(r.service_start_date)} to ${String(r.service_end_date)}`, value: (r) => String(r.service_end_date), hideOnMobile: true },
            { header: "Basic", align: "right", cell: (r) => money(r.wage_basis), value: (r) => Number(r.wage_basis), hideOnMobile: true },
            { header: "Amount", align: "right", cell: (r) => money(r.amount), value: (r) => Number(r.amount) },
            { header: "Status", cell: (r) => <Badge tone={r.status === "APPROVED" ? "green" : "amber"}>{String(r.status)}</Badge>, value: (r) => String(r.status) },
          ]}
          actions={(r) => [
            {
              label: "Approve",
              primary: true,
              positive: true,
              disabled: busy,
              hidden: r.status !== "DRAFT",
              onClick: () =>
                window.confirm(`Approve the service benefit of ${money(r.amount)} for ${empName(r.employee_id)}?`) &&
                void run(async () => {
                  await hrBangladeshApi.bdApproveServiceBenefit(Number(r.id));
                  await list.reload();
                }, "Approved."),
            },
          ]}
        />
      </Card>
    </div>
  );
}
