import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StyleCreate, type StyleResponse } from "@/api/client";

export function StylesPage() {
  const [items, setItems] = useState<StyleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<StyleCreate>({
    style_code: "",
    name: "",
    status: "ACTIVE",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api.listStyles();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load styles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.style_code || !form.name) {
      setError("Style code and name are required");
      return;
    }
    try {
      await api.createStyle(form);
      setShowForm(false);
      setForm({ style_code: "", name: "", status: "ACTIVE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create style");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Garment Styles</h1>
          <p className="text-text-muted text-sm mt-0.5">
            Style master with linked components, colorways and size scales.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
        >
          {showForm ? "Close" : "New style"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-3 md:grid-cols-5">
          <input
            value={form.style_code}
            onChange={(e) => setForm((f) => ({ ...f, style_code: e.target.value }))}
            placeholder="Style code"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Style name"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          />
          <input
            value={form.season ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, season: e.target.value || null }))}
            placeholder="Season"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          />
          <input
            value={form.style_image_url ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, style_image_url: e.target.value || null }))}
            placeholder="Style image URL"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={form.status ?? "ACTIVE"}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-sm"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
            <button type="submit" className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-text-muted">Loading styles…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-text-muted">No styles yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                <tr>
                  <th className="px-4 py-2 whitespace-nowrap">Style code</th>
                  <th className="px-4 py-2 min-w-[120px]">Name</th>
                  <th className="px-4 py-2 w-16">Image</th>
                  <th className="px-4 py-2 min-w-[100px]">Department</th>
                  <th className="px-4 py-2 min-w-[80px]">Season</th>
                  <th className="px-4 py-2 whitespace-nowrap">Status</th>
                  <th className="px-4 py-2 text-right w-24 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/50">
                    <td className="px-4 py-2 font-medium text-text-primary whitespace-nowrap">
                      <Link to={`/app/merchandising/styles/${s.id}`} className="text-brand-primary hover:underline">
                        {s.style_code}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{s.name}</td>
                    <td className="px-4 py-2 text-text-secondary">
                      {s.style_image_url ? (
                        <img
                          src={s.style_image_url}
                          alt={s.name}
                          className="h-8 w-8 rounded object-cover border border-border"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{s.department ?? "—"}</td>
                    <td className="px-4 py-2 text-text-secondary">{s.season ?? "—"}</td>
                    <td className="px-4 py-2 text-text-secondary">{s.status}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === s.id ? null : s.id))}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === s.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <Link
                              to={`/app/merchandising/styles/${s.id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View
                            </Link>
                            <Link
                              to={`/app/merchandising/styles/${s.id}/print`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Print
                            </Link>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
