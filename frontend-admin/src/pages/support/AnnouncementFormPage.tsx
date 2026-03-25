import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createAnnouncement, listAnnouncements, patchAnnouncement } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/context/ToastContext";

const emptyForm = {
  title: "",
  content: "",
  type: "info",
  target: "all",
  target_tenant_id: "",
  is_active: true,
  starts_at: "",
  expires_at: "",
};

export function AnnouncementFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isNew = id === undefined;
  const editId = id != null ? parseInt(id, 10) : NaN;

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (isNew || Number.isNaN(editId)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    listAnnouncements()
      .then((r) => {
        const a = r.items.find((x) => x.id === editId);
        if (cancelled) return;
        if (!a) {
          setNotFound(true);
          return;
        }
        setForm({
          title: a.title,
          content: a.content,
          type: a.type,
          target: a.target,
          target_tenant_id: a.target_tenant_id != null ? String(a.target_tenant_id) : "",
          is_active: a.is_active,
          starts_at: a.starts_at ? a.starts_at.slice(0, 16) : "",
          expires_at: a.expires_at ? a.expires_at.slice(0, 16) : "",
        });
      })
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed", "error"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, editId]);

  async function save() {
    const body: Record<string, unknown> = {
      title: form.title,
      content: form.content,
      type: form.type,
      target: form.target,
      is_active: form.is_active,
    };
    if (form.target_tenant_id) body.target_tenant_id = parseInt(form.target_tenant_id, 10);
    if (form.starts_at) body.starts_at = new Date(form.starts_at).toISOString();
    if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString();
    try {
      if (isNew) {
        await createAnnouncement(body);
        showToast("Created", "success");
      } else {
        await patchAnnouncement(editId, body);
        showToast("Updated", "success");
      }
      navigate("/support/announcements");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading) return <LoadingState />;

  if (!isNew && notFound) {
    return (
      <div>
        <PageHeader title="Announcement not found" description="This ID is not in the list." />
        <Link to="/support/announcements" className="text-sm font-medium text-indigo-600 hover:underline">
          Back to announcements
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={isNew ? "New announcement" : "Edit announcement"}
        description="Platform-wide or targeted notices for tenants."
        actions={
          <Link
            to="/support/announcements"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        }
      />
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 text-sm">
        <div>
          <label className="block text-xs text-slate-500">Title</label>
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Content</label>
          <textarea
            className="mt-1 w-full rounded border px-2 py-1 min-h-[120px]"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500">Type</label>
            <select className="mt-1 w-full rounded border px-2 py-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500">Target</label>
            <select className="mt-1 w-full rounded border px-2 py-1" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
              <option value="all">all</option>
              <option value="tenant">tenant</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500">Target tenant ID (optional)</label>
          <input
            className="mt-1 w-full rounded border px-2 py-1"
            value={form.target_tenant_id}
            onChange={(e) => setForm({ ...form, target_tenant_id: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-500">Starts (local)</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border px-2 py-1"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Expires (local)</label>
            <input
              type="datetime-local"
              className="mt-1 w-full rounded border px-2 py-1"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Active
        </label>
        <button type="button" onClick={() => void save()} className="w-full rounded-lg bg-indigo-600 py-2 text-white font-semibold">
          Save
        </button>
      </div>
    </div>
  );
}
