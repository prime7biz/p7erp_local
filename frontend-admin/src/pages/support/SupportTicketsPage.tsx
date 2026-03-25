import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listSupportTickets,
  createSupportTicket,
  getSupportTicket,
  patchSupportTicket,
  addSupportTicketMessage,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatDateTime } from "@/utils/format";

export function SupportTicketsPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const tenantFilter = searchParams.get("tenant_id");
  const [items, setItems] = useState<
    { id: number; tenant_id: number | null; title: string; status: string; priority: string; category: string; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{
    id: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    messages: { id: number; content: string; author_type: string; created_at: string; is_internal_note: boolean }[];
  } | null>(null);
  const [note, setNote] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", tenant_id: "", priority: "medium" });

  function load() {
    setLoading(true);
    const tid = tenantFilter ? parseInt(tenantFilter, 10) : NaN;
    listSupportTickets(tid != null && !Number.isNaN(tid) ? { tenant_id: tid } : undefined)
      .then((r) => setItems(r.items))
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed", "error"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [tenantFilter]);

  async function openDetail(id: number) {
    try {
      const t = await getSupportTicket(id);
      setDetail(t);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Support tickets"
        description={
          tenantFilter
            ? `Filtered to tenant ID ${tenantFilter}. SLA timers are set on create; escalate bumps level and timestamp.`
            : "Platform helpdesk queue (internal / tenant-linked)."
        }
        actions={
          <button type="button" onClick={() => setCreateOpen(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            New ticket
          </button>
        }
      />
      <DataTable
        columns={[
          { key: "id", header: "ID", cell: (t) => t.id },
          { key: "title", header: "Title", cell: (t) => t.title },
          {
            key: "tenant",
            header: "Tenant",
            cell: (t) =>
              t.tenant_id ? (
                <Link className="text-indigo-600 hover:underline" to={`/tenants/${t.tenant_id}`}>
                  {t.tenant_id}
                </Link>
              ) : (
                "—"
              ),
          },
          { key: "st", header: "Status", cell: (t) => t.status },
          { key: "pr", header: "Priority", cell: (t) => t.priority },
          { key: "c", header: "Created", cell: (t) => formatDateTime(t.created_at) },
          {
            key: "a",
            header: "",
            cell: (t) => (
              <button type="button" className="text-xs text-indigo-600" onClick={() => openDetail(t.id)}>
                Open
              </button>
            ),
          },
        ]}
        rows={items}
        rowKey={(t) => t.id}
        emptyMessage="No tickets."
      />

      <SideDrawer open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? "Ticket"} widthClassName="max-w-xl">
        {detail && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600 whitespace-pre-wrap">{detail.description}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() =>
                  patchSupportTicket(detail.id, { status: "closed" }).then(() => {
                    showToast("Closed", "success");
                    load();
                    openDetail(detail.id);
                  })
                }
              >
                Close
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() =>
                  patchSupportTicket(detail.id, { status: "in_progress" }).then(() => {
                    showToast("Updated", "success");
                    load();
                    openDetail(detail.id);
                  })
                }
              >
                In progress
              </button>
              <button
                type="button"
                className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
                onClick={() =>
                  patchSupportTicket(detail.id, { escalate: true }).then(() => {
                    showToast("Escalated", "success");
                    load();
                    openDetail(detail.id);
                  })
                }
              >
                Escalate
              </button>
            </div>
            <div className="border-t pt-3 space-y-2">
              <h4 className="font-medium text-slate-800">Thread</h4>
              {detail.messages.map((m) => (
                <div key={m.id} className={`rounded p-2 text-xs ${m.is_internal_note ? "bg-amber-50 border border-amber-100" : "bg-slate-50"}`}>
                  <div className="text-slate-500">[{m.author_type}] {formatDateTime(m.created_at)}</div>
                  <div className="text-slate-800 whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <textarea className="flex-1 rounded border p-2 text-sm min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reply…" />
              <button
                type="button"
                className="self-start rounded-lg bg-indigo-600 px-3 py-2 text-white text-sm"
                onClick={async () => {
                  if (!note.trim()) return;
                  await addSupportTicketMessage(detail.id, { content: note, is_internal_note: false });
                  setNote("");
                  showToast("Sent", "success");
                  openDetail(detail.id);
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </SideDrawer>

      <SideDrawer open={createOpen} onClose={() => setCreateOpen(false)} title="New ticket">
        <form
          className="space-y-3 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            await createSupportTicket({
              title: form.title,
              description: form.description,
              tenant_id: form.tenant_id ? parseInt(form.tenant_id, 10) : undefined,
              priority: form.priority,
            });
            showToast("Created", "success");
            setCreateOpen(false);
            load();
          }}
        >
          <input className="w-full border rounded px-2 py-1" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea className="w-full border rounded px-2 py-1 min-h-[100px]" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          <input className="w-full border rounded px-2 py-1" placeholder="Tenant ID (optional)" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })} />
          <select className="w-full border rounded px-2 py-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
          <button type="submit" className="w-full bg-indigo-600 text-white rounded py-2">Create</button>
        </form>
      </SideDrawer>
    </div>
  );
}
