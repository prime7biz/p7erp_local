/**
 * Resignation / termination / retirement / death and deemed resignation (from an absence case):
 * clearance by department, then the final settlement (salary to last day, leave encashment,
 * service benefit, notice pay or recovery, advances). Approve, post a balanced voucher, then mark paid.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { hrBangladeshApi, type Row } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Badge, Banner, Card, Field, Messages, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, money, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { SEPARATION_TYPE_LABELS } from "@/components/hr/bd/bdLabels";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const CREATE_TYPES = Object.entries(SEPARATION_TYPE_LABELS).filter(([v]) => v !== "DEEMED_RESIGNATION");
const TONE: Record<string, "amber" | "blue" | "green" | "gray" | "red"> = {
  DRAFT: "amber",
  APPROVED: "blue",
  POSTED: "blue",
  PAID: "green",
  SETTLED: "green",
  CANCELLED: "gray",
  REVERSED: "red",
};

const AMOUNT_ROWS: [string, string][] = [
  ["salary_amount", "Salary up to last day"],
  ["overtime_amount", "Overtime"],
  ["allowances_amount", "Allowances / bonuses"],
  ["leave_encashment_amount", "Earned leave encashment"],
  ["service_benefit_amount", "Service benefit"],
  ["notice_pay_amount", "Notice pay"],
  ["gross_amount", "Gross"],
  ["notice_recovery_amount", "Less: notice recovery"],
  ["advance_recovery_amount", "Less: advances / loans"],
  ["other_deductions_amount", "Less: clearance recoveries"],
  ["deduction_amount", "Total deductions"],
  ["net_amount", "Net payable"],
];

function Clearance({ sepId }: { sepId: number }) {
  const list = useLoad(() => hrBangladeshApi.clearance(sepId), [sepId]);
  const [dept, setDept] = useState("Store");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("0");
  const { busy, error, notice, run } = useAction();
  return (
    <Card title="Clearance" description="Each department signs off (cleared or waived). Recoverable amounts are deducted in the settlement.">
      <Messages error={error || list.error} notice={notice} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Department" htmlFor="cl-dept">
          <input id="cl-dept" className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)} />
        </Field>
        <Field label="Item" htmlFor="cl-item">
          <input id="cl-item" className={inputCls} placeholder="e.g. ID card, scissors, locker key" value={item} onChange={(e) => setItem(e.target.value)} />
        </Field>
        <Field label="Recoverable (Tk)" htmlFor="cl-amount">
          <input id="cl-amount" type="number" min={0} step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            className={btnSecondary}
            disabled={!dept.trim() || !item.trim() || busy}
            onClick={() =>
              void run(async () => {
                await hrBangladeshApi.addClearance(sepId, { department: dept.trim(), item: item.trim(), amount_recoverable: amount || "0" });
                setItem("");
                await list.reload();
              }, "Clearance item added.")
            }
          >
            Add item
          </button>
        </div>
      </div>
      <KitTable<Row>
        rows={list.data ?? []}
        rowKey={(r) => String(r.id)}
        loading={list.loading}
        empty="No clearance items."
        searchPlaceholder="Search department or item…"
        statusOf={(r) => String(r.status)}
        defaultPageSize={50}
        columns={[
          { header: "Department", cell: (r) => String(r.department), value: (r) => String(r.department) },
          { header: "Item", cell: (r) => String(r.item), value: (r) => String(r.item) },
          { header: "Recoverable", align: "right", cell: (r) => money(r.amount_recoverable), value: (r) => Number(r.amount_recoverable) },
          { header: "Status", cell: (r) => <Badge tone={r.status === "PENDING" ? "amber" : "green"}>{String(r.status)}</Badge>, value: (r) => String(r.status) },
        ]}
        actions={(r) => [
          {
            label: "Mark cleared",
            primary: true,
            positive: true,
            disabled: busy,
            hidden: r.status !== "PENDING",
            onClick: () => void run(async () => { await hrBangladeshApi.signOffClearance(Number(r.id), "CLEARED"); await list.reload(); }, "Cleared."),
          },
          {
            label: "Waive",
            disabled: busy,
            hidden: r.status !== "PENDING",
            onClick: () => void run(async () => { await hrBangladeshApi.signOffClearance(Number(r.id), "WAIVED"); await list.reload(); }, "Waived."),
          },
        ]}
      />
    </Card>
  );
}

function Settlement({ sep, onChanged }: { sep: Row; onChanged: () => void }) {
  const sepId = Number(sep.id);
  const [fsId, setFsId] = useState<number | null>(sep.settlement_id ? Number(sep.settlement_id) : null);
  const fs = useLoad(() => (fsId ? hrBangladeshApi.settlement(fsId) : Promise.resolve(null)), [fsId]);
  const [preview, setPreview] = useState<Row | null>(null);
  const { busy, error, notice, run } = useAction();
  const data = fs.data ?? preview;
  const trace = (data?.calculation_trace ?? {}) as Record<string, unknown>;
  const warnings = (trace.warnings ?? []) as string[];

  const act = (fn: () => Promise<unknown>, ok: string) =>
    void run(async () => {
      await fn();
      await fs.reload();
      onChanged();
    }, ok);

  return (
    <Card title="Final settlement" description="Calculated from attendance, the approved rule set and the employee's pay. Paid within 30 working days of separation (s.30).">
      <Messages error={error || fs.error} notice={notice} />
      <div className="flex flex-wrap gap-2">
        {!fs.data || fs.data.status === "DRAFT" ? (
          <>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => void run(async () => setPreview(await hrBangladeshApi.previewSettlement(sepId)))}>
              Preview
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || sep.status !== "APPROVED"}
              onClick={() =>
                void run(async () => {
                  const r = await hrBangladeshApi.calculateSettlement(sepId);
                  setFsId(Number(r.id));
                  setPreview(null);
                  onChanged();
                }, "Settlement calculated (DRAFT).")
              }
            >
              {fs.data ? "Recalculate" : "Calculate & save"}
            </button>
          </>
        ) : null}
        {fs.data?.status === "DRAFT" ? (
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => window.confirm("Approve this settlement? Clearance must be complete.") && act(() => hrBangladeshApi.approveSettlement(Number(fs.data?.id)), "Approved.")}>
            Approve
          </button>
        ) : null}
        {fs.data?.status === "APPROVED" ? (
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => window.confirm("Post the settlement voucher to accounts?") && act(() => hrBangladeshApi.postSettlement(Number(fs.data?.id)), "Posted to accounts.")}>
            Post voucher
          </button>
        ) : null}
        {fs.data?.status === "POSTED" ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() => {
              const ref = window.prompt("Payment reference (cheque / bank / bKash / cash receipt)");
              if (ref) act(() => hrBangladeshApi.paySettlement(Number(fs.data?.id), ref), "Marked paid.");
            }}
          >
            Mark paid
          </button>
        ) : null}
        {fs.data && ["POSTED", "PAID"].includes(String(fs.data.status)) ? (
          <>
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Reason for reversing (a reversal voucher is posted)");
                if (reason && reason.trim().length >= 3) act(() => hrBangladeshApi.reverseSettlement(Number(fs.data?.id), reason.trim()), "Settlement reversed.");
              }}
            >
              Reverse
            </button>
          </>
        ) : null}
        {sep.status !== "APPROVED" && !fs.data ? <span className="text-xs text-text-muted">Approve the separation to save a settlement.</span> : null}
      </div>
      {data ? (
        <div className="space-y-2">
          {fs.data ? <Badge tone={TONE[String(fs.data.status)] ?? "gray"}>{String(fs.data.status)}</Badge> : <Badge tone="gray">Preview</Badge>}
          <table className="w-full max-w-lg text-sm">
            <tbody>
              {AMOUNT_ROWS.map(([k, label]) => (
                <tr key={k} className={`border-b border-border ${k === "net_amount" ? "font-semibold" : ""}`}>
                  <td className="py-1 text-text-secondary">{label}</td>
                  <td className="py-1 text-right tabular-nums text-text-primary">{money(data[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {warnings.map((w) => (
            <Banner key={w} kind="warning">
              {w}
            </Banner>
          ))}
          {fs.data?.voucher_id ? (
            <p className="text-xs text-text-muted">
              Voucher #{String(fs.data.voucher_id)}
              {fs.data.reversal_voucher_id ? `, reversed by voucher #${String(fs.data.reversal_voucher_id)}` : ""}. See{" "}
              <Link to="/app/accounts/vouchers" className="underline">
                Vouchers
              </Link>
              .
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function HrSeparationsPage() {
  const employees = useEmployees();
  const list = useLoad(() => hrBangladeshApi.separations(), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [emp, setEmp] = useState<number | null>(null);
  const [form, setForm] = useState({
    separation_type: "RESIGNATION",
    request_date: todayIso(),
    last_working_date: todayIso(),
    effective_date: todayIso(),
    notice_days_served: "0",
    permanent: true,
    reason: "",
  });
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };
  const opened = (list.data ?? []).find((s) => Number(s.id) === openId);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emp) return;
    void run(async () => {
      const s = await hrBangladeshApi.createSeparation({ employee_id: emp, ...form, notice_days_served: Number(form.notice_days_served), reason: form.reason.trim() || null });
      setShowNew(false);
      await list.reload();
      setOpenId(Number(s.id));
    }, "Separation created as DRAFT.");
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Separations & final settlement"
        description="Resignation, termination, retirement, death, or deemed resignation after an absence case. Clearance first, then the final settlement."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Separations & settlement" }]}
      />
      <Messages error={error || list.error} notice={notice} />
      <Banner kind="info">
        Unauthorised absence (s.27(3A)) starts on <Link to="/app/hr/cases" className="underline">Notices &amp; cases</Link>; the decision creates the separation here.
      </Banner>
      <Card title="Separations" actions={<button type="button" className={btnPrimary} onClick={() => setShowNew((v) => !v)}>New separation</button>}>
        {showNew ? (
          <form onSubmit={create} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
            <Field label="Employee" htmlFor="sep-emp">
              <EmployeePicker id="sep-emp" employees={employees.data ?? []} value={emp} onChange={setEmp} />
            </Field>
            <Field label="Type" htmlFor="sep-type">
              <select id="sep-type" className={inputCls} value={form.separation_type} onChange={(e) => setForm((f) => ({ ...f, separation_type: e.target.value }))}>
                {CREATE_TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Request / notice date" htmlFor="sep-req">
              <input id="sep-req" type="date" className={inputCls} value={form.request_date} onChange={(e) => setForm((f) => ({ ...f, request_date: e.target.value }))} />
            </Field>
            <Field label="Last working day" htmlFor="sep-lwd">
              <input id="sep-lwd" type="date" className={inputCls} value={form.last_working_date} onChange={(e) => setForm((f) => ({ ...f, last_working_date: e.target.value }))} />
            </Field>
            <Field label="Effective date" htmlFor="sep-eff">
              <input id="sep-eff" type="date" className={inputCls} value={form.effective_date} onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))} />
            </Field>
            <Field label="Notice days served" htmlFor="sep-notice">
              <input id="sep-notice" type="number" min={0} max={365} className={inputCls} value={form.notice_days_served} onChange={(e) => setForm((f) => ({ ...f, notice_days_served: e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={form.permanent} onChange={(e) => setForm((f) => ({ ...f, permanent: e.target.checked }))} /> Permanent worker
            </label>
            <div className="sm:col-span-2">
              <Field label="Reason / note" htmlFor="sep-reason">
                <input id="sep-reason" className={inputCls} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
              </Field>
            </div>
            <div>
              <button type="submit" className={btnPrimary} disabled={!emp || busy}>
                Create
              </button>
            </div>
          </form>
        ) : null}
        <KitTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={list.loading}
          onRefresh={() => void list.reload()}
          empty="No separations."
          emptyHint="Use New separation, or record a deemed resignation from Notices & cases."
          searchPlaceholder="Search employee or type…"
          statusOf={(r) => String(r.status)}
          columns={[
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            {
              header: "Type",
              cell: (r) => SEPARATION_TYPE_LABELS[String(r.separation_type)] ?? String(r.separation_type),
              value: (r) => SEPARATION_TYPE_LABELS[String(r.separation_type)] ?? String(r.separation_type),
            },
            { header: "Last day", cell: (r) => String(r.last_working_date), value: (r) => String(r.last_working_date) },
            { header: "Status", cell: (r) => <Badge tone={TONE[String(r.status)] ?? "gray"}>{String(r.status)}</Badge>, value: (r) => String(r.status) },
            {
              header: "Settlement",
              cell: (r) => (r.settlement_status ? `${String(r.settlement_status)} · ${money(r.settlement_net_amount)}` : "-"),
              value: (r) => String(r.settlement_status ?? ""),
              hideOnMobile: true,
            },
          ]}
          actions={(r) => [
            { label: "Open", primary: true, onClick: () => setOpenId(Number(r.id)) },
            {
              label: "Approve",
              primary: true,
              positive: true,
              disabled: busy,
              hidden: r.status !== "DRAFT",
              onClick: () =>
                window.confirm(`Approve the separation of ${empName(r.employee_id)}? The final settlement can then be calculated.`) &&
                void run(async () => { await hrBangladeshApi.approveSeparation(Number(r.id)); await list.reload(); }, "Separation approved."),
            },
            {
              label: "Cancel",
              danger: true,
              disabled: busy,
              hidden: !["DRAFT", "APPROVED"].includes(String(r.status)) || ["APPROVED", "POSTED", "PAID"].includes(String(r.settlement_status ?? "")),
              onClick: () => window.confirm("Cancel this separation?") && void run(async () => { await hrBangladeshApi.cancelSeparation(Number(r.id)); await list.reload(); }, "Cancelled."),
            },
          ]}
        />
      </Card>
      {opened ? (
        <div key={openId} className="space-y-4">
          <Clearance sepId={Number(opened.id)} />
          <Settlement sep={opened} onChanged={() => void list.reload()} />
        </div>
      ) : null}
    </div>
  );
}
