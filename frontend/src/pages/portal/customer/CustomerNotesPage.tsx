import { useEffect, useState, type FormEvent } from "react";
import { customerPortalApi } from "@/hooks/useCustomerPortal";
import { useExternalAuth } from "@/hooks/useExternalAuth";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { Button } from "@/components/ui/button";
import { erpControlFocusClass } from "@/components/app/listPageLayout";

type Note = {
  id: number;
  entity_type: string;
  entity_id: number;
  body: string;
  created_at: string;
  from_party: string;
};

export function CustomerNotesPage() {
  const { me } = useExternalAuth("customer");
  const canNote = me?.role_codes?.includes("customer_collaborator");
  const flags = me?.feature_flags as Record<string, boolean> | undefined;
  const notesEnabled = flags?.customer_notes_enabled === true;

  const [items, setItems] = useState<Note[]>([]);
  const [err, setErr] = useState("");
  const [orderId, setOrderId] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await customerPortalApi.notes();
      setItems((r.items || []) as Note[]);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const oid = Number(orderId);
    if (!Number.isFinite(oid) || !body.trim()) return;
    setBusy(true);
    try {
      await customerPortalApi.createNote({ entity_type: "order", entity_id: oid, body: body.trim() });
      setBody("");
      await load();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to post");
    } finally {
      setBusy(false);
    }
  }

  if (err && items.length === 0) return <PortalErrorState message={err} onRetry={() => void load()} />;

  return (
    <div>
      <AppPageHeader title="Notes" description="Questions and updates shared with your supplier." />
      {notesEnabled && canNote ? (
        <form onSubmit={onSubmit} className="mb-8 rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">Add note on an order</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              placeholder="Order ID"
              className={`rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
            <input
              placeholder="Your message"
              className={`flex-1 rounded-lg border border-border px-3 py-2 text-sm ${erpControlFocusClass}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              Post
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-text-muted mb-6">
          {notesEnabled ? "Your role is view-only for notes." : "Notes are disabled for this organization."}
        </p>
      )}
      <ul className="space-y-3">
        {items.map((n) => (
          <li key={n.id} className="rounded-xl border border-border p-4 text-sm">
            <p className="text-xs text-text-muted">
              {n.entity_type} #{n.entity_id} · {new Date(n.created_at).toLocaleString()} · {n.from_party}
            </p>
            <p className="mt-2 text-text-primary whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="text-sm text-text-muted py-4">No notes yet.</p> : null}
    </div>
  );
}
