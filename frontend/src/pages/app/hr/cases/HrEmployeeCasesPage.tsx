/**
 * Employee cases: notices, memos, warnings, show-cause letters, disciplinary cases and the
 * unauthorised-absence procedure of s.27(3A) (10-day explain notice, then 7-day defence notice).
 * Notices print in English and Bangla.
 */
import { useState } from "react";
import { hrBangladeshApi, openBlob, type Row } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Badge, Banner, Card, Field, Messages, SimpleTable, btnPrimary, btnSecondary, inputCls } from "@/components/hr/bd/BdUi";
import { employeeLabel, todayIso, useAction, useEmployees, useLoad } from "@/components/hr/bd/bdHooks";
import { EmployeePicker } from "@/components/hr/bd/EmployeePicker";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const CASE_TYPES: Record<string, string> = {
  NOTICE: "Notice",
  MEMO: "Office memo",
  WARNING: "Warning letter",
  SHOW_CAUSE: "Show-cause letter",
  DISCIPLINARY: "Disciplinary case (s.24)",
  ABSENCE: "Unauthorised absence (s.27(3A))",
};

const DECISIONS: Record<string, string[]> = {
  ABSENCE: ["DEEMED_RESIGNATION", "EXPLANATION_ACCEPTED", "REJOINED"],
  DISCIPLINARY: ["NO_ACTION", "WARNING", "PENALTY", "DISMISSAL", "REMOVAL"],
  SHOW_CAUSE: ["NO_ACTION", "EXPLANATION_ACCEPTED", "WARNING", "REFER_TO_DISCIPLINARY"],
  WARNING: ["ACKNOWLEDGED"],
  MEMO: ["ACKNOWLEDGED"],
  NOTICE: ["ACKNOWLEDGED"],
};

const EVENTS = ["DELIVERY_ATTEMPT", "DELIVERED", "RESPONSE", "REJOINED", "HEARING", "EXTENSION"];

const STATUS_TONE: Record<string, "amber" | "blue" | "green" | "red" | "gray"> = {
  DRAFT: "gray",
  ISSUED: "amber",
  RESPONDED: "blue",
  HEARING: "blue",
  DEFENCE_NOTICE: "red",
  DECIDED: "green",
  CLOSED: "green",
  CANCELLED: "gray",
};

const ABSENCE_EN =
  "You have been absent from work without permission or information since the date given above. Under section 27(3A) of the Bangladesh Labour Act 2006, you are asked to explain your absence in writing and rejoin work within 10 days of this notice.";
const ABSENCE_BN =
  "আপনি উপরে উল্লিখিত তারিখ থেকে অনুমতি বা কোনো সংবাদ ছাড়া কাজে অনুপস্থিত আছেন। বাংলাদেশ শ্রম আইন ২০০৬ এর ধারা ২৭(৩ক) অনুযায়ী এই নোটিশ প্রাপ্তির ১০ দিনের মধ্যে অনুপস্থিতির কারণ লিখিতভাবে ব্যাখ্যা করে কাজে যোগদান করার জন্য আপনাকে নির্দেশ দেওয়া হলো।";

function CaseDetail({ caseId, onChanged }: { caseId: number; onChanged: () => void }) {
  const detail = useLoad(() => hrBangladeshApi.caseDetail(caseId), [caseId]);
  const [eventType, setEventType] = useState("DELIVERED");
  const [eventDate, setEventDate] = useState(todayIso());
  const [eventNote, setEventNote] = useState("");
  const [decision, setDecision] = useState("");
  const [decisionDate, setDecisionDate] = useState(todayIso());
  const { busy, error, notice, run } = useAction();
  const c = detail.data;

  const act = (fn: () => Promise<unknown>, ok: string) =>
    void run(async () => {
      await fn();
      await detail.reload();
      onChanged();
    }, ok);

  if (!c) return detail.error ? <Banner kind="error">{detail.error}</Banner> : null;
  const timeline = (c.timeline ?? null) as Record<string, string> | null;
  const open = !["DRAFT", "DECIDED", "CLOSED", "CANCELLED"].includes(String(c.status));

  return (
    <Card title={`${String(c.case_no)} - ${String(c.subject)}`} description={`${CASE_TYPES[String(c.case_type)] ?? String(c.case_type)} · ${String(c.status)}`}>
      <Messages error={error} notice={notice} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={() => void run(async () => openBlob(await hrBangladeshApi.casePdf(caseId), `${String(c.case_no)}.pdf`))}>
          Print notice (English + Bangla)
        </button>
        {c.status === "DRAFT" ? (
          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() => {
              const d = window.prompt("Issue date (YYYY-MM-DD)", todayIso());
              if (d) act(() => hrBangladeshApi.issueCase(caseId, d.trim(), c.case_type === "ABSENCE" ? undefined : 7), "Notice issued.");
            }}
          >
            Issue notice
          </button>
        ) : null}
        {c.case_type === "ABSENCE" && ["ISSUED", "RESPONDED"].includes(String(c.status)) ? (
          <button
            type="button"
            className={btnSecondary}
            disabled={busy}
            onClick={() => {
              const d = window.prompt("Defence notice date (YYYY-MM-DD), after the 10-day period", todayIso());
              if (d) act(() => hrBangladeshApi.defenceNotice(caseId, d.trim()), "7-day defence notice issued.");
            }}
          >
            Issue 7-day defence notice
          </button>
        ) : null}
      </div>
      {timeline ? (
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries(timeline).map(([k, v]) => (
            <div key={k} className="rounded border border-border px-2 py-1">
              <p className="text-xs text-text-muted">{k.replace(/_/g, " ")}</p>
              <p className="font-medium text-text-primary">{String(v)}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-sm text-text-secondary">{String(c.body ?? "")}</p>
      {c.body_bn ? <p className="whitespace-pre-wrap text-sm text-text-secondary">{String(c.body_bn)}</p> : null}

      <SimpleTable<Row>
        rows={(c.events ?? []) as Row[]}
        rowKey={(r) => String(r.id)}
        empty="No events yet."
        columns={[
          { header: "Date", cell: (r) => String(r.event_date) },
          { header: "Event", cell: (r) => String(r.event_type) },
          { header: "Note", cell: (r) => String(r.note ?? "") },
        ]}
      />

      {open ? (
        <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
          <Field label="Record event" htmlFor="case-ev-type">
            <select id="case-ev-type" className={inputCls} value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {EVENTS.map((e) => (
                <option key={e} value={e}>
                  {e.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" htmlFor="case-ev-date">
            <input id="case-ev-date" type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="case-ev-note">
            <input id="case-ev-note" className={inputCls} value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button
              type="button"
              className={btnSecondary}
              disabled={busy}
              onClick={() => {
                act(() => hrBangladeshApi.addCaseEvent(caseId, { event_type: eventType, event_date: eventDate, note: eventNote || null }), "Event recorded.");
                setEventNote("");
              }}
            >
              Add event
            </button>
          </div>
          <Field label="Decision (manager / admin)" htmlFor="case-decision">
            <select id="case-decision" className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">Choose decision</option>
              {(DECISIONS[String(c.case_type)] ?? []).map((d) => (
                <option key={d} value={d}>
                  {d.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Decision date" htmlFor="case-decision-date">
            <input id="case-decision-date" type="date" className={inputCls} value={decisionDate} onChange={(e) => setDecisionDate(e.target.value)} />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={!decision || busy}
              onClick={() => {
                const sep = ["DEEMED_RESIGNATION", "DISMISSAL", "REMOVAL"].includes(decision);
                if (!window.confirm(sep ? "Record this decision? A DRAFT separation is created for the final settlement." : "Record this decision?")) return;
                act(() => hrBangladeshApi.decideCase(caseId, { decision, decision_date: decisionDate }), "Decision recorded.");
              }}
            >
              Record decision
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function HrEmployeeCasesPage() {
  const employees = useEmployees();
  const [typeFilter, setTypeFilter] = useState("");
  const list = useLoad(() => hrBangladeshApi.cases({ case_type: typeFilter || undefined }), [typeFilter]);
  const candidates = useLoad(() => hrBangladeshApi.absenceCandidates(), []);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ case_type: "SHOW_CAUSE", subject: "", body: "", body_bn: "", allegation: "", first_absent_date: "" });
  const [emp, setEmp] = useState<number | null>(null);
  const { busy, error, notice, run } = useAction();

  const empName = (id: unknown) => {
    const e = employees.data?.find((x) => x.id === id);
    return e ? employeeLabel(e) : `#${String(id)}`;
  };

  const startAbsence = (r: Row) => {
    setEmp(Number(r.employee_id));
    setForm({ case_type: "ABSENCE", subject: "Unauthorised absence: explain and rejoin", body: ABSENCE_EN, body_bn: ABSENCE_BN, allegation: "", first_absent_date: String(r.first_absent_date) });
    setShowNew(true);
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emp) return;
    void run(async () => {
      const c = await hrBangladeshApi.createCase({
        employee_id: emp,
        case_type: form.case_type,
        subject: form.subject.trim(),
        body: form.body.trim(),
        body_bn: form.body_bn.trim() || null,
        allegation: form.allegation.trim() || null,
        first_absent_date: form.first_absent_date || null,
      });
      setShowNew(false);
      setOpenId(Number(c.id));
      await list.reload();
      await candidates.reload();
    }, "Case created as DRAFT. Review it, then issue the notice.");
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Notices & cases"
        description="Office memos, warnings, show-cause letters, disciplinary cases and the unauthorised-absence procedure, with a full event history."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Notices & cases" }]}
      />
      <Messages error={error || list.error} notice={notice} />

      {(candidates.data ?? []).length ? (
        <Card title="Absent more than 10 days" description="Active employees with no attendance or approved leave. Start the s.27(3A) procedure from here.">
          <KitTable<Row>
            rows={candidates.data ?? []}
            rowKey={(r) => String(r.employee_id)}
            empty="Nobody is absent more than 10 days."
            searchPlaceholder="Search employee…"
            defaultPageSize={50}
            columns={[
              { header: "Employee", cell: (r) => `${String(r.employee_code)} - ${String(r.name)}`, value: (r) => `${String(r.employee_code)} ${String(r.name)}` },
              { header: "Last present", cell: (r) => String(r.last_present), value: (r) => String(r.last_present) },
              { header: "Days absent", align: "right", cell: (r) => String(r.days_absent), value: (r) => Number(r.days_absent) },
            ]}
            actions={(r) => [{ label: "Start absence case", primary: true, onClick: () => startAbsence(r) }]}
          />
        </Card>
      ) : null}

      <Card
        title="Cases"
        actions={
          <>
            <select aria-label="Filter by type" className="rounded border border-border-strong px-2 py-1 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(CASE_TYPES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button type="button" className={btnPrimary} onClick={() => setShowNew((v) => !v)}>
              New notice / case
            </button>
          </>
        }
      >
        {showNew ? (
          <form onSubmit={create} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <Field label="Employee" htmlFor="case-emp">
              <EmployeePicker id="case-emp" employees={employees.data ?? []} value={emp} onChange={setEmp} />
            </Field>
            <Field label="Type" htmlFor="case-type">
              <select id="case-type" className={inputCls} value={form.case_type} onChange={(e) => setForm((f) => ({ ...f, case_type: e.target.value }))}>
                {Object.entries(CASE_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {form.case_type === "ABSENCE" ? (
              <Field label="First day of absence" htmlFor="case-absent">
                <input id="case-absent" type="date" className={inputCls} required value={form.first_absent_date} onChange={(e) => setForm((f) => ({ ...f, first_absent_date: e.target.value }))} />
              </Field>
            ) : null}
            <div className="sm:col-span-2">
              <Field label="Subject" htmlFor="case-subject">
                <input id="case-subject" className={inputCls} required minLength={3} value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
              </Field>
            </div>
            <Field label="Text (English)" htmlFor="case-body">
              <textarea id="case-body" rows={5} className={inputCls} required minLength={3} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
            </Field>
            <Field label="Text (Bangla)" htmlFor="case-body-bn">
              <textarea id="case-body-bn" rows={5} className={inputCls} lang="bn" value={form.body_bn} onChange={(e) => setForm((f) => ({ ...f, body_bn: e.target.value }))} />
            </Field>
            {form.case_type === "DISCIPLINARY" || form.case_type === "SHOW_CAUSE" ? (
              <div className="sm:col-span-2">
                <Field label="Allegation" htmlFor="case-allegation">
                  <textarea id="case-allegation" rows={2} className={inputCls} value={form.allegation} onChange={(e) => setForm((f) => ({ ...f, allegation: e.target.value }))} />
                </Field>
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <button type="submit" className={btnPrimary} disabled={!emp || busy}>
                Create draft
              </button>
            </div>
          </form>
        ) : null}
        <KitTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={list.loading}
          onRefresh={() => void list.reload()}
          empty="No cases."
          emptyHint="Use New notice / case, or start an absence case from the list above."
          searchPlaceholder="Search case no., employee or subject…"
          statusOf={(r) => String(r.status)}
          columns={[
            { header: "No.", cell: (r) => <span className="font-mono text-xs">{String(r.case_no)}</span>, value: (r) => String(r.case_no) },
            { header: "Employee", cell: (r) => empName(r.employee_id), value: (r) => empName(r.employee_id) },
            { header: "Type", cell: (r) => CASE_TYPES[String(r.case_type)] ?? String(r.case_type), value: (r) => CASE_TYPES[String(r.case_type)] ?? String(r.case_type) },
            { header: "Subject", cell: (r) => String(r.subject), value: (r) => String(r.subject), hideOnMobile: true },
            { header: "Issued", cell: (r) => String(r.issue_date ?? "-"), value: (r) => String(r.issue_date ?? ""), hideOnMobile: true },
            { header: "Reply due", cell: (r) => String(r.defence_due_date ?? r.reply_due_date ?? "-"), value: (r) => String(r.defence_due_date ?? r.reply_due_date ?? "") },
            { header: "Status", cell: (r) => <Badge tone={STATUS_TONE[String(r.status)] ?? "gray"}>{String(r.status)}</Badge>, value: (r) => String(r.status) },
          ]}
          actions={(r) => [
            { label: "Open", primary: true, onClick: () => setOpenId(Number(r.id)) },
            { label: "Print", primary: true, onClick: () => void run(async () => openBlob(await hrBangladeshApi.casePdf(Number(r.id)), `${String(r.case_no)}.pdf`)) },
          ]}
        />
      </Card>

      {openId ? <CaseDetail key={openId} caseId={openId} onChanged={() => void list.reload()} /> : null}
    </div>
  );
}
