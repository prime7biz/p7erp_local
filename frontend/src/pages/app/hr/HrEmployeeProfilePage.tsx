/**
 * /app/hr/employees/:employeeId/profile — read-only employee information center with print.
 *
 * Everything here is view only. "Edit" opens the employee workspace; the server decides what may be
 * changed there. Blocks the caller may not see arrive as `{ allowed: false }` and show "Hidden for your role".
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrEmployeeAccess,
  type HrEmployeeOverview,
  type HrEmployeeResponse,
  type HrSectionResponse,
} from "@/api/client";
import { hrBangladeshApi } from "@/api/hrBangladesh";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { useRecordBreadcrumb } from "@/components/shell/recordBreadcrumb";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { logApiError } from "@/utils/logApiError";
import {
  blobToDataUrl,
  buildTimeline,
  fullName,
  HIDDEN_LABEL,
  isShown,
  joinAddress,
  money,
  PROFILE_TABS,
  show,
  trimDecimal,
  UNDEFINED_LABEL,
  type ProfileTab,
} from "./employeeProfileLogic";
import { formatShortDate, formatTenure } from "./hrEmployeesListLogic";
import { fetchAllHrDepartments, fetchAllHrDesignations } from "./hrMasterData";

const PREFIX = "/app/hr";

function Hidden() {
  return <p className="rounded-lg border border-border bg-surface-subtle px-3 py-4 text-sm text-text-muted">{HIDDEN_LABEL}</p>;
}

function Empty({ text = "Nothing recorded yet." }: { text?: string }) {
  return <p className="px-3 py-4 text-sm text-text-muted">{text}</p>;
}

function Table({ head, rows, label }: { head: string[]; rows: ReactNode[][]; label: string }) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-sm" aria-label={label}>
        <thead className="bg-surface-subtle text-xs uppercase text-text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 text-text-primary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-text-muted">{k}</dt>
          <dd className="text-text-primary">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface-raised p-4 print:break-inside-avoid", className)}>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised px-4 py-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text-primary">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

export function HrEmployeeProfilePage() {
  const { employeeId } = useParams();
  const id = Number(employeeId);
  const { me } = useAuth();
  const [employee, setEmployee] = useState<HrEmployeeResponse | null>(null);
  const [overview, setOverview] = useState<HrEmployeeOverview | null>(null);
  const [access, setAccess] = useState<HrEmployeeAccess | null>(null);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [sections, setSections] = useState<HrSectionResponse[]>([]);
  const [photo, setPhoto] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ProfileTab>("summary");

  useRecordBreadcrumb(employee ? fullName(employee) || employee.employee_code : null);

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setError("Invalid employee id.");
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    Promise.all([
      api.getHrEmployee(id),
      api.getHrEmployeeOverview(id),
      api.getHrEmployeeAccess(),
      fetchAllHrDepartments(),
      fetchAllHrDesignations(),
      api.listHrSections({ active_only: false }),
    ])
      .then(([emp, ov, acc, deps, desigs, secs]) => {
        if (!live) return;
        setEmployee(emp);
        setOverview(ov);
        setAccess(acc);
        setDepartments(deps);
        setDesignations(desigs);
        setSections(secs);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load employee"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!employee?.has_photo) return;
    let live = true;
    hrBangladeshApi
      .employeePhotoBlob(employee.id)
      .then(blobToDataUrl)
      .then((url) => live && setPhoto(url))
      .catch((e) => logApiError("HrEmployeeProfilePage.photo", e));
    return () => {
      live = false;
    };
  }, [employee?.id, employee?.has_photo]);

  const masked = useMemo(() => new Set(employee?.masked_fields ?? []), [employee?.masked_fields]);
  const timeline = useMemo(() => (overview && employee ? buildTimeline(overview, employee) : []), [overview, employee]);

  if (loading) {
    return <div className="rounded-lg border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">Loading…</div>;
  }
  if (!employee || !overview) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground" role="alert">
          {error || "Employee not found."}
        </div>
        <Link to={`${PREFIX}/employees`} className="text-sm text-brand-primary hover:underline">
          ← Back to employees
        </Link>
      </div>
    );
  }

  const m = (k: string) => masked.has(k);
  const department = departments.find((d) => d.id === employee.department_id)?.name ?? UNDEFINED_LABEL;
  const section = sections.find((s) => s.id === employee.section_id)?.name ?? UNDEFINED_LABEL;
  const designation = designations.find((d) => d.id === employee.designation_id)?.title ?? "—";
  const tenure = formatTenure(employee.joining_date);
  const approvalOn = me?.feature_flags?.hr_employee_change_approval === true;
  const pay = employee.pay_snapshot ?? null;

  const leave = overview.leave;
  const att = overview.attendance;
  const disc = overview.discipline;
  const salary = overview.salary;
  const lastIncrement = isShown(salary) ? salary.history.find((h) => h.change_type === "INCREMENT" || h.change_type === "PROMOTION") : undefined;
  const leaveLeft = isShown(leave) ? leave.balances.reduce((sum, b) => sum + Number(b.remaining_days || 0), 0) : null;

  const personal: [string, string][] = [
    ["Father's name", show(employee.father_name, { masked: m("father_name") })],
    ["Mother's name", show(employee.mother_name, { masked: m("mother_name") })],
    ["Spouse's name", show(employee.spouse_name, { masked: m("spouse_name") })],
    ["Date of birth", show(formatShortDate(employee.date_of_birth), { masked: m("date_of_birth") })],
    ["Gender", show(employee.gender)],
    ["Marital status", show(employee.marital_status)],
    ["Blood group", show(employee.blood_group)],
    ["Religion", show(employee.religion, { masked: m("religion") })],
    ["Nationality", show(employee.nationality, { masked: m("nationality") })],
    ["NID", show(employee.national_id, { masked: m("national_id") })],
    ["Birth registration no.", show(employee.birth_registration_no, { masked: m("birth_registration_no") })],
    ["Mobile", show(employee.phone)],
    ["Email", show(employee.email)],
    ["Emergency contact", show(joinAddress([employee.emergency_contact_name, employee.emergency_contact_relation, employee.emergency_contact_phone]))],
  ];
  const job: [string, string][] = [
    ["Employee number", employee.employee_code],
    ["Department", department],
    ["Section / line", section],
    ["Designation", designation],
    ["Category", show(employee.employee_category)],
    ["Employment type", show(employee.employment_type)],
    ["Joining date", show(formatShortDate(employee.joining_date))],
    ["Confirmation date", show(formatShortDate(employee.confirmation_date))],
    ["Service length", show(tenure)],
    ["Status", employee.is_active ? "Active" : "Inactive"],
  ];
  const addresses: [string, string][] = [
    [
      "Present address",
      show(joinAddress([employee.present_address_line, employee.present_city, employee.present_district, employee.present_postal_code, employee.present_country]), {
        masked: m("present_address_line"),
      }),
    ],
    [
      "Permanent address",
      show(
        joinAddress([employee.permanent_address_line, employee.permanent_city, employee.permanent_district, employee.permanent_postal_code, employee.permanent_country]),
        { masked: m("permanent_address_line") },
      ),
    ],
  ];
  const bank: [string, string][] = [
    ["Salary paid by", show(employee.salary_payment_method, { masked: m("salary_payment_method") })],
    ["Bank", show(joinAddress([employee.bank_name, employee.bank_branch]), { masked: m("bank_name") })],
    ["Account", show(employee.bank_account_number, { masked: m("bank_account_number") })],
  ];

  const photoBox = (
    <div className="flex h-36 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-subtle">
      {photo ? (
        <img src={photo} alt={`Photo of ${fullName(employee)}`} className="h-full w-full object-cover" />
      ) : (
        <span className="px-2 text-center text-xs text-text-muted">No photo</span>
      )}
    </div>
  );

  const leaveTable = isShown(leave) ? (
    <div className="space-y-3">
      <Table
        label="Leave balance"
        head={["Leave type", "Allocated", "Used", "Pending", "Remaining"]}
        rows={leave.balances.map((b) => [b.leave_type_name, trimDecimal(b.allocated_days), trimDecimal(b.used_days), trimDecimal(b.pending_days), trimDecimal(b.remaining_days)])}
      />
      <Table
        label="Leave applications"
        head={["From", "To", "Type", "Days", "Status", "Reason"]}
        rows={leave.requests.map((r) => [formatShortDate(r.from_date), formatShortDate(r.to_date), r.leave_type_name, trimDecimal(r.days), r.status, show(r.reason)])}
      />
      {leave.requests_total > leave.requests.length && (
        <p className="text-xs text-text-muted no-print">
          Showing the newest {leave.requests.length} of {leave.requests_total}.{" "}
          <Link to={`${PREFIX}/leave?tab=requests`} className="text-brand-primary hover:underline">
            See all leave
          </Link>
        </p>
      )}
    </div>
  ) : (
    <Hidden />
  );

  const attendanceBlock = isShown(att) ? (
    <div className="space-y-3">
      <Table
        label="Attendance summary"
        head={["Period", "Days", "Present", "Absent", "Late days", "Late minutes"]}
        rows={[
          ["This month", att.this_month.days_recorded, att.this_month.present, att.this_month.absent, att.this_month.late_days, att.this_month.late_minutes],
          ["This year", att.this_year.days_recorded, att.this_year.present, att.this_year.absent, att.this_year.late_days, att.this_year.late_minutes],
        ]}
      />
      <p className="text-xs text-text-muted">Approved overtime this year: {trimDecimal(att.approved_overtime_hours_this_year)} hours</p>
      <Table
        label="Recent late days"
        head={["Date", "In time", "Late (minutes)", "Status"]}
        rows={att.recent_late.map((l) => [formatShortDate(l.date), show(l.in_time), l.late_minutes, l.status])}
      />
    </div>
  ) : (
    <Hidden />
  );

  const disciplineBlock = isShown(disc) ? (
    <Table
      label="Discipline cases"
      head={["Case", "Type", "Subject", "Issued", "Status", "Decision"]}
      rows={disc.cases.map((c) => [c.case_no, c.case_type.replace("_", " "), c.subject, show(formatShortDate(c.issue_date)), c.status, show(c.decision)])}
    />
  ) : (
    <Hidden />
  );

  const salaryBlock = isShown(salary) ? (
    <div className="space-y-3">
      {pay && (
        <Facts
          items={[
            ["Current basic", money(pay.basic)],
            ["Current gross", money(pay.gross)],
            ["Structure", show(pay.structure_code)],
            ["Wage grade", show(pay.wage_rate_code)],
          ]}
        />
      )}
      <Table
        label="Salary history"
        head={["From", "To", "Change", "Structure", "Basic"]}
        rows={salary.history.map((h) => [formatShortDate(h.effective_from), h.effective_to ? formatShortDate(h.effective_to) : "Open", show(h.change_type, { fallback: "Salary" }), h.structure_code, money(h.basic)])}
      />
    </div>
  ) : (
    <Hidden />
  );

  const bonusesBlock = isShown(overview.bonuses) ? (
    <div className="space-y-3">
      <Table
        label="Festival bonus"
        head={["Bonus", "Period", "Amount", "Status"]}
        rows={overview.bonuses.festival.map((b) => [b.title, b.period_code, money(b.amount), b.eligible ? b.status : `${b.status} (not eligible)`])}
      />
      <Table
        label="Production bonus"
        head={["Period", "Amount", "Status"]}
        rows={overview.bonuses.production.map((p) => [p.period_code, money(p.amount), p.status])}
      />
      <Table
        label="Allowances by month"
        head={["Month", "Bill", "Days", "Amount"]}
        rows={overview.bonuses.allowances_by_month.map((a) => [show(a.month), a.rule_code, a.days, money(a.amount)])}
      />
    </div>
  ) : (
    <Hidden />
  );

  const payslipsBlock = isShown(overview.payslips) ? (
    <Table
      label="Payslips"
      head={["Period", "Gross", "Deductions", "Net", "Run status", "Slip"]}
      rows={overview.payslips.lines.map((l) => [l.period_code, money(l.gross_pay), money(l.deductions), money(l.net_pay), l.run_status, show(l.slip_number)])}
    />
  ) : (
    <Hidden />
  );

  const documentsBlock = (
    <div className="space-y-3">
      {isShown(overview.documents) ? (
        <Table
          label="Documents"
          head={["Type", "Number", "Issued", "Expires"]}
          rows={overview.documents.documents.map((d) => [d.document_type, show(d.document_number), show(formatShortDate(d.issue_date)), show(formatShortDate(d.expiry_date))])}
        />
      ) : (
        <Hidden />
      )}
      <h3 className="text-xs font-semibold uppercase text-text-muted">Gate passes</h3>
      {isShown(overview.gate_passes) ? (
        <Table
          label="Gate passes"
          head={["Pass", "Status", "From", "To"]}
          rows={overview.gate_passes.passes.map((p) => [p.pass_code, p.status, show(formatShortDate(p.valid_from)), show(formatShortDate(p.valid_to))])}
        />
      ) : (
        <Hidden />
      )}
    </div>
  );

  const historyBlock = (
    <Table label="History" head={["Date", "What", "Details"]} rows={timeline.map((t) => [formatShortDate(t.date), t.kind, t.text])} />
  );

  const summaryBlock = (
    <div className="space-y-4">
      <Card title="Employment">
        <Facts items={job} />
      </Card>
      <Card title="Personal">
        <Facts items={personal} />
      </Card>
      <Card title="Address">
        <Facts items={addresses} />
      </Card>
      <Card title="Salary payment">
        <Facts items={bank} />
      </Card>
    </div>
  );

  const tabBody: Record<ProfileTab, ReactNode> = {
    summary: summaryBlock,
    leave: leaveTable,
    attendance: attendanceBlock,
    discipline: disciplineBlock,
    salary: salaryBlock,
    bonuses: bonusesBlock,
    payslips: payslipsBlock,
    documents: documentsBlock,
    history: historyBlock,
  };

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <HrPageHeader
          title={fullName(employee) || employee.employee_code}
          description="Employee information (view only)"
          breadcrumbs={[
            { label: "HR", href: PREFIX },
            { label: "Employees", href: `${PREFIX}/employees` },
            { label: employee.employee_code },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Print
          </button>
          <Link
            to={`${PREFIX}/employees/${employee.id}`}
            className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            title={approvalOn ? "Changes need Tier 1 and Tier 2 approval" : undefined}
          >
            Edit
          </Link>
        </div>
      </div>
      {approvalOn && (
        <p className="no-print rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-xs text-text-secondary">
          Changes to this employee need Tier 1 and Tier 2 approval before they apply.
        </p>
      )}

      {/* Header card: on screen and on the printed sheet. */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4 sm:flex-row" aria-label="Employee header">
        {photoBox}
        <div className="flex-1 space-y-1">
          <p className="print-only text-xs uppercase tracking-wide text-text-muted">Employee information sheet</p>
          <h2 className="text-xl font-bold text-text-primary">{fullName(employee)}</h2>
          <p className="text-sm text-text-secondary">
            {employee.employee_code} · {designation}
          </p>
          <p className="text-sm text-text-secondary">
            {department} · {section}
          </p>
          <p className="text-sm text-text-secondary">
            {employee.is_active ? "Active" : "Inactive"}
            {employee.joining_date ? ` · Joined ${formatShortDate(employee.joining_date)}` : ""}
            {tenure ? ` (${tenure})` : ""}
          </p>
        </div>
      </section>

      <div className="no-print grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Leave remaining" value={leaveLeft === null ? "—" : `${trimDecimal(String(leaveLeft))} days`} hint={isShown(leave) ? String(leave.year) : undefined} />
        <Tile label="Late days this month" value={isShown(att) ? String(att.this_month.late_days) : "—"} />
        <Tile label="Open discipline cases" value={isShown(disc) ? String(disc.open) : "—"} />
        <Tile label="Last increment" value={lastIncrement ? formatShortDate(lastIncrement.effective_from) : "—"} />
        <Tile label="Current gross" value={access?.can_manage_payroll && pay ? money(pay.gross) : "—"} />
      </div>

      <div className="no-print -mx-1 overflow-x-auto border-b border-border pb-2" role="tablist" aria-label="Employee information">
        <div className="flex gap-2 whitespace-nowrap px-1">
          {PROFILE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                tab === t.id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="no-print">{tabBody[tab]}</div>

      {/* Printed sheet: every section one after the other. */}
      <div className="print-only space-y-4" data-testid="print-sheet">
        {summaryBlock}
        <Card title="Leave">{leaveTable}</Card>
        <Card title="Attendance & late">{attendanceBlock}</Card>
        <Card title="Discipline">{disciplineBlock}</Card>
        <Card title="Salary & increments">{salaryBlock}</Card>
        <Card title="Bonuses & allowances">{bonusesBlock}</Card>
        <div className="grid grid-cols-3 gap-8 pt-12 text-center text-xs text-text-secondary">
          <p className="border-t border-border-strong pt-1">Employee</p>
          <p className="border-t border-border-strong pt-1">HR</p>
          <p className="border-t border-border-strong pt-1">Authorised signatory</p>
        </div>
        <p className="text-[10px] text-text-muted">
          Printed {new Date().toLocaleString()} by {me?.username ?? me?.email ?? "user"} · data as of {overview.as_of}
        </p>
      </div>

      <Link to={`${PREFIX}/employees`} className="no-print inline-block text-sm text-brand-primary hover:underline">
        ← Back to employees
      </Link>
    </div>
  );
}
