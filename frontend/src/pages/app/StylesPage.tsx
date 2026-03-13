import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type StyleCreate, type StyleResponse } from "@/api/client";

export function StylesPage() {
  const [items, setItems] = useState<StyleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
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
          <h1 className="text-2xl font-bold text-gray-900">Garment Styles</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Style master with linked components, colorways and size scales.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "Close" : "New style"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-4 grid gap-3 md:grid-cols-5">
          <input
            value={form.style_code}
            onChange={(e) => setForm((f) => ({ ...f, style_code: e.target.value }))}
            placeholder="Style code"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Style name"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={form.season ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, season: e.target.value || null }))}
            placeholder="Season"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={form.style_image_url ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, style_image_url: e.target.value || null }))}
            placeholder="Style image URL"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={form.status ?? "ACTIVE"}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
            <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading styles…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No styles yet.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="px-4 py-2">Style code</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Image</th>
                <th className="px-4 py-2">Department</th>
                <th className="px-4 py-2">Season</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-gray-900">{s.style_code}</td>
                  <td className="px-4 py-2 text-gray-700">{s.name}</td>
                  <td className="px-4 py-2 text-gray-700">
                    {s.style_image_url ? (
                      <img
                        src={s.style_image_url}
                        alt={s.name}
                        className="h-8 w-8 rounded object-cover border border-gray-200"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{s.department ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-700">{s.season ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-700">{s.status}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/app/merchandising/styles/${s.id}`} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
