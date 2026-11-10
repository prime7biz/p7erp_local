import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

const CATEGORIES: [string, string][] = [
  ["QUERY", "Query"],
  ["COMPLAINT", "Complaint"],
  ["REQUEST", "Request"],
];
const categoryLabel = (v: string | null | undefined) => CATEGORIES.find(([k]) => k === (v ?? "").toUpperCase())?.[1] ?? (v || "-");

/** Shape returned by GET /hr/ess/my-tickets (hr_ess/router.py my_tickets). */
type TicketRow = {
  id: number;
  category: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  created_at: string | null;
};

export function HrEssTicketsPage() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("QUERY");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await api.listHrEssMyTickets()) as unknown as TicketRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCategory("QUERY");
    setSubject("");
    setBody("");
    setFormError("");
    setOpen(true);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setFormError("Subject and details are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    setInfo("");
    try {
      await api.createHrEssMyTicket({ category: category.toLowerCase(), subject: subject.trim(), description: body.trim() });
      setOpen(false);
      setSubject("");
      setBody("");
      setInfo("Ticket submitted.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<TicketRow>[] = [
    { key: "subject", header: "Subject", render: (r) => <span className="font-medium text-text-primary">{r.subject || "Ticket"}</span>, value: (r) => r.subject },
    { key: "category", header: "Category", render: (r) => categoryLabel(r.category), value: (r) => categoryLabel(r.category) },
    { key: "priority", header: "Priority", render: (r) => <span className="capitalize">{r.priority || "-"}</span>, value: (r) => r.priority, hideOnMobile: true },
    { key: "status", header: "Status", render: (r) => (r.status ? <HrStatusBadge status={r.status} /> : "-"), value: (r) => r.status },
    { key: "created", header: "Raised on", render: (r) => (r.created_at ? r.created_at.slice(0, 10) : "-"), value: (r) => r.created_at },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + New ticket
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="My HR tickets" description="Raise queries or requests for HR." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "My Tickets" }]} />
        {addButton}
      </div>
      {info ? (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
        </div>
      ) : null}
      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No tickets yet"
        emptyHint="Ask HR a question, raise a complaint or make a request."
        emptyAction={addButton}
        searchPlaceholder="Search subject or category…"
        initialSort={{ key: "created", dir: "desc" }}
        statusOf={(r) => r.status}
      />

      <HrFormDrawer
        open={open}
        title="New HR ticket"
        onClose={() => setOpen(false)}
        onSubmit={(e) => void onCreate(e)}
        submitLabel="Submit ticket"
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ticket-category">Category</label>
          <select id="ticket-category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ticket-subject">Subject **</label>
          <input id="ticket-subject" className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ticket-details">Details **</label>
          <textarea id="ticket-details" rows={5} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} required />
        </div>
      </HrFormDrawer>
    </div>
  );
}
