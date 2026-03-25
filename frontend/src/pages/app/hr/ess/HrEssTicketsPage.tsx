import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrEssTicketsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("QUERY");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrEssMyTickets());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.createHrEssMyTicket({ category: category.toLowerCase(), subject: subject.trim(), description: body.trim() });
      setSubject("");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader title="My HR tickets" description="Raise queries or requests for HR." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "My Tickets" }]} />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <form onSubmit={onCreate} className="space-y-2 rounded-xl border border-border bg-surface-raised p-4">
        <select className="rounded border px-2 py-1 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="QUERY">Query</option>
          <option value="COMPLAINT">Complaint</option>
          <option value="REQUEST">Request</option>
        </select>
        <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        <textarea className="w-full rounded border px-2 py-2 text-sm" rows={4} placeholder="Details" value={body} onChange={(e) => setBody(e.target.value)} required />
        <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Submit ticket
        </button>
      </form>
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={String(r.id)} className="px-4 py-3 text-sm">
                <div className="font-medium">{String(r.subject ?? r.title ?? "Ticket")}</div>
                <div className="text-xs text-text-muted">{String(r.status ?? "")}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
