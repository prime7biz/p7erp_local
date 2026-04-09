import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FacilityRow } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function FacilitiesPage() {
  const [rows, setRows] = useState<FacilityRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listFacilities({ limit: 200 }));
    } catch (e) {
      logApiError("FacilitiesPage.load", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function removeDraft(id: number) {
    if (!window.confirm("Delete this draft facility?")) return;
    try {
      await api.deleteFacility(id);
      await load();
    } catch (e) {
      logApiError("FacilitiesPage.deleteFacility", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Loans &amp; facilities</h1>
          <p className="text-sm text-text-muted">Sanctioned limits linked to financiers (external principals).</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/app/finance/facilities/dashboard"
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-base"
          >
            Dashboard
          </Link>
          <Link
            to="/app/finance/facilities/new"
            className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            New facility
          </Link>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-base text-xs uppercase text-text-muted">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Sanctioned</th>
                <th className="px-3 py-2">Utilized</th>
                <th className="px-3 py-2 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-text-primary">
                    <Link to={`/app/finance/facilities/${r.id}`} className="text-brand-primary hover:underline">
                      {String(r.facility_code ?? r.id)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{String(r.facility_type ?? "—")}</td>
                  <td className="px-3 py-2">{String(r.status ?? "—")}</td>
                  <td className="px-3 py-2">
                    {String(r.currency ?? "")}{" "}
                    {typeof r.sanctioned_amount === "number" ? r.sanctioned_amount.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {typeof r.utilized_amount === "number" ? r.utilized_amount.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 relative">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((id) => (id === r.id ? null : r.id));
                      }}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div
                        className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          to={`/app/finance/facilities/${r.id}`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        >
                          View
                        </Link>
                        <Link
                          to={`/app/finance/facilities/${r.id}/utilizations/new`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        >
                          New utilization
                        </Link>
                        {String(r.status) === "draft" ? (
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                            onClick={() => void removeDraft(r.id)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-4 text-sm text-text-muted">No facilities yet.</p> : null}
        </div>
      )}
    </div>
  );
}
