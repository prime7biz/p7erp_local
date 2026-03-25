import { useCallback, useEffect, useState } from "react";
import { api, type HrSectionResponse } from "@/api/client";
import { HrEmptyState } from "@/components/hr/HrEmptyState";
import { HrFilterBar } from "@/components/hr/HrFilterBar";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrSectionsPage() {
  const [rows, setRows] = useState<HrSectionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [sectionType, setSectionType] = useState("SECTION");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listHrSections({ active_only: false });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
  });

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createHrSection({ name: name.trim(), section_type: sectionType, is_active: true });
      setModal(false);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Sections & Lines"
        description="Organize floors, lines, and units for factory attendance and reporting."
        breadcrumbs={[
          { label: "HR", href: PREFIX },
          { label: "Sections & Lines" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search code or name" />
        <button
          type="button"
          onClick={() => setModal(true)}
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add section
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading...</div>
        ) : filtered.length === 0 ? (
          <HrEmptyState title="No sections yet" hint="Create floors, sewing lines, or finishing units." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{r.code}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.section_type}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.is_active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">New section</h2>
            <form onSubmit={onCreate} className="space-y-3">
              <label className="block text-sm text-text-secondary">
                Name
                <input
                  className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm text-text-secondary">
                Type
                <select
                  className="mt-1 w-full rounded border border-border-strong px-3 py-2 text-sm"
                  value={sectionType}
                  onChange={(e) => setSectionType(e.target.value)}
                >
                  <option value="FLOOR">Floor</option>
                  <option value="LINE">Line</option>
                  <option value="SECTION">Section</option>
                  <option value="UNIT">Unit</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModal(false)} className="rounded border border-border-strong px-3 py-1.5 text-sm">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
