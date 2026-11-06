/** Maternity cases (needs maternity enforcement ON). */
import { useState } from "react";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { ActionsMenu, Badge, Card, Field, Messages, SimpleTable, btnPrimary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, money, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";

const TONE: Record<string, "amber" | "green" | "blue" | "gray" | "red"> = {
  ELIGIBLE: "amber",
  INELIGIBLE: "red",
  APPROVED: "blue",
  PAID: "green",
  CANCELLED: "gray",
};

export function MaternityTab() {
  const employees = useEmployees();
  const list = useLoad(() => hrBangladeshApi.bdMaternityCases(), []);
  const [emp, setEmp] = useState<number | null>(null);
  const [edd, setEdd] = useState("");
  const [children, setChildren] = useState("0");
  const { busy, error, notice, run } = useAction();

  const act = (fn: () => Promise<unknown>, ok: string) =>
    void run(async () => {
      await fn();
      await list.reload();
    }, ok);
  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };

  return (
    <div className="space-y-4">
      <Messages error={error || list.error} notice={notice} />
      <Card title="New maternity case" description="Benefit is calculated from the employee's gross wage and service; a manager approves, then payroll records the payment.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Employee" htmlFor="bd-mc-emp">
            <EmployeePicker id="bd-mc-emp" employees={employees.data ?? []} value={emp} onChange={setEmp} />
          </Field>
          <Field label="Expected delivery date" htmlFor="bd-mc-edd">
            <input id="bd-mc-edd" type="date" className={inputCls} value={edd} onChange={(e) => setEdd(e.target.value)} />
          </Field>
          <Field label="Surviving children" htmlFor="bd-mc-children">
            <input id="bd-mc-children" type="number" min={0} max={20} className={inputCls} value={children} onChange={(e) => setChildren(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnPrimary}
              disabled={!emp || !edd || busy}
              onClick={() =>
                act(
                  () => hrBangladeshApi.bdCreateMaternity({ employee_id: emp as number, expected_delivery_date: edd, surviving_children: Number(children) }),
                  "Maternity case created.",
                )
              }
            >
              Create case
            </button>
          </div>
        </div>
      </Card>
      <Card title="Maternity cases">
        <SimpleTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => String(r.id)}
          empty={list.loading ? "Loading..." : "No maternity cases."}
          columns={[
            { header: "Employee", cell: (r) => empName(r.employee_id) },
            { header: "Leave", cell: (r) => `${String(r.leave_start ?? "")} to ${String(r.leave_end ?? "")}` },
            { header: "Eligible", cell: (r) => (r.eligible ? "Yes" : `No: ${String(r.eligibility_reason ?? "")}`) },
            { header: "Daily rate", align: "right", cell: (r) => money(r.daily_rate) },
            { header: "Benefit", align: "right", cell: (r) => money(r.benefit_amount) },
            { header: "Status", cell: (r) => <Badge tone={TONE[String(r.status)] ?? "gray"}>{String(r.status)}</Badge> },
            {
              header: "Actions",
              align: "right",
              cell: (r) => (
                <ActionsMenu
                  items={[
                    { label: "Approve", hidden: r.status !== "ELIGIBLE", onClick: () => act(() => hrBangladeshApi.bdApproveMaternity(Number(r.id)), "Approved.") },
                    {
                      label: "Mark paid",
                      hidden: r.status !== "APPROVED",
                      onClick: () => {
                        const ref = window.prompt("Payment reference (voucher / bank / cash receipt no.)");
                        if (ref) act(() => hrBangladeshApi.bdPayMaternity(Number(r.id), ref), "Marked paid.");
                      },
                    },
                    {
                      label: "Cancel",
                      danger: true,
                      hidden: ["PAID", "CANCELLED"].includes(String(r.status)),
                      onClick: () => window.confirm("Cancel this maternity case?") && act(() => hrBangladeshApi.bdCancelMaternity(Number(r.id)), "Cancelled."),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
