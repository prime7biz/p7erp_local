/**
 * Temporary gate passes (visitors, new joiners without an ID card yet, contractors).
 * Each pass is printed with an internal QR that only Prime7 can verify; the gate log records every scan.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { hrBangladeshApi, openBlob, type Row } from "@/api/hrBangladesh";
import { ActionsMenu, Badge, Card, Field, Messages, SimpleTable, btnPrimary, inputCls } from "@/components/hr/bd/BdUi";
import { useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const TONE: Record<string, "amber" | "green" | "red" | "gray"> = { DRAFT: "amber", ACTIVE: "green", REVOKED: "red", EXPIRED: "gray" };

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function HrGatePassesPage() {
  const employees = useEmployees();
  const [statusFilter, setStatusFilter] = useState("");
  const list = useLoad(() => hrBangladeshApi.gatePasses(statusFilter || undefined), [statusFilter]);
  const events = useLoad(() => hrBangladeshApi.gateEvents(), []);
  const now = new Date();
  const [form, setForm] = useState({
    person_name: "",
    mobile: "",
    identity_ref: "",
    purpose: "",
    zones: "",
    valid_from: localInput(now),
    valid_to: localInput(new Date(now.getTime() + 8 * 3600 * 1000)),
  });
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [sponsorId, setSponsorId] = useState<number | null>(null);
  const { busy, error, notice, run } = useAction();

  const act = (fn: () => Promise<unknown>, ok: string) =>
    void run(async () => {
      await fn();
      await list.reload();
    }, ok);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    act(
      () =>
        hrBangladeshApi.createGatePass({
          employee_id: employeeId,
          sponsor_employee_id: sponsorId,
          person_name: form.person_name.trim(),
          mobile: form.mobile.trim(),
          identity_ref: form.identity_ref.trim() || null,
          purpose: form.purpose.trim(),
          permitted_zones: form.zones.split(",").map((z) => z.trim()).filter(Boolean),
          valid_from: form.valid_from,
          valid_to: form.valid_to,
        }),
      "Gate pass created as DRAFT. Activate it, then print.",
    );
  };

  const print = (id: number, code: string) =>
    void run(async () => openBlob(await hrBangladeshApi.gatePassPdf(id), `${code}.pdf`));

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Temporary gate passes"
        description="Issue a printed pass with a secure QR for visitors, contractors or new joiners. Guards scan it on the Gate scan screen."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Gate passes" }]}
      />
      <Messages error={error || list.error} notice={notice} />
      <Card title="New gate pass" actions={<Link to="/app/hr/gate-scan" className="text-sm text-brand-primary underline">Open gate scan screen</Link>}>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name on pass" htmlFor="gp-name">
            <input id="gp-name" className={inputCls} required value={form.person_name} onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))} />
          </Field>
          <Field label="Mobile" htmlFor="gp-mobile">
            <input id="gp-mobile" className={inputCls} required minLength={6} inputMode="tel" value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
          </Field>
          <Field label="NID / birth reg. last digits" htmlFor="gp-idref" hint="Optional; do not store the full number">
            <input id="gp-idref" className={inputCls} maxLength={64} value={form.identity_ref} onChange={(e) => setForm((f) => ({ ...f, identity_ref: e.target.value }))} />
          </Field>
          <Field label="Employee (if a new joiner)" htmlFor="gp-emp">
            <EmployeePicker id="gp-emp" employees={employees.data ?? []} value={employeeId} onChange={setEmployeeId} placeholder="Optional" />
          </Field>
          <Field label="Host / sponsor employee" htmlFor="gp-sponsor">
            <EmployeePicker id="gp-sponsor" employees={employees.data ?? []} value={sponsorId} onChange={setSponsorId} placeholder="Optional" />
          </Field>
          <Field label="Valid from" htmlFor="gp-from">
            <input id="gp-from" type="datetime-local" className={inputCls} required value={form.valid_from} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
          </Field>
          <Field label="Valid to" htmlFor="gp-to">
            <input id="gp-to" type="datetime-local" className={inputCls} required value={form.valid_to} onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))} />
          </Field>
          <Field label="Allowed zones" htmlFor="gp-zones" hint="Comma separated, e.g. ADMIN, SAMPLE. Empty = any.">
            <input id="gp-zones" className={inputCls} value={form.zones} onChange={(e) => setForm((f) => ({ ...f, zones: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Purpose" htmlFor="gp-purpose">
              <input id="gp-purpose" className={inputCls} required minLength={2} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} />
            </Field>
          </div>
          <div className="flex items-end">
            <button type="submit" className={btnPrimary} disabled={busy}>
              Create pass
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="Passes"
        actions={
          <select aria-label="Filter by status" className="rounded border border-border-strong px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
            <option value="REVOKED">Revoked</option>
          </select>
        }
      >
        <SimpleTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => String(r.id)}
          empty={list.loading ? "Loading..." : "No gate passes."}
          columns={[
            { header: "Pass", cell: (r) => <span className="font-mono text-xs">{String(r.pass_code)}</span> },
            { header: "Name", cell: (r) => String(r.person_name) },
            { header: "Mobile", cell: (r) => String(r.mobile) },
            { header: "Purpose", cell: (r) => String(r.purpose) },
            { header: "Valid", cell: (r) => `${String(r.valid_from).replace("T", " ").slice(0, 16)} to ${String(r.valid_to).replace("T", " ").slice(0, 16)}` },
            {
              header: "Status",
              cell: (r) => <Badge tone={r.expired ? "gray" : TONE[String(r.status)] ?? "gray"}>{r.expired ? "EXPIRED" : String(r.status)}</Badge>,
            },
            {
              header: "Actions",
              align: "right",
              cell: (r) => (
                <ActionsMenu
                  items={[
                    { label: "Activate", hidden: r.status !== "DRAFT", onClick: () => act(() => hrBangladeshApi.activateGatePass(Number(r.id)), "Pass activated.") },
                    { label: "Print", hidden: !["DRAFT", "ACTIVE"].includes(String(r.status)), onClick: () => print(Number(r.id), String(r.pass_code)) },
                    {
                      label: "Revoke",
                      danger: true,
                      hidden: r.status === "REVOKED",
                      onClick: () => {
                        const reason = window.prompt("Reason for revoking this pass");
                        if (reason && reason.trim().length >= 2) act(() => hrBangladeshApi.revokeGatePass(Number(r.id), reason.trim()), "Pass revoked.");
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Card title="Gate log" description="Every scan at the gate, allowed or denied.">
        <SimpleTable<Row>
          rows={(events.data ?? []).slice(0, 100)}
          rowKey={(r) => String(r.id)}
          empty={events.loading ? "Loading..." : "No scans yet."}
          columns={[
            { header: "Time", cell: (r) => String(r.event_at).replace("T", " ").slice(0, 19) },
            { header: "Gate", cell: (r) => String(r.gate) },
            { header: "Direction", cell: (r) => String(r.direction) },
            { header: "Result", cell: (r) => <Badge tone={r.result === "ALLOWED" ? "green" : "red"}>{String(r.result)}</Badge> },
            { header: "Reason", cell: (r) => String(r.reason ?? "") },
          ]}
        />
      </Card>
    </div>
  );
}
