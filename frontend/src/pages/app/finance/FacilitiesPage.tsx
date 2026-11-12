import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FacilityRow } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { logApiError } from "@/utils/logApiError";
import { useConfirm } from "@/components/app/useConfirm";

export function FacilitiesPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<FacilityRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);

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

  async function removeDraft(id: number) {
    if (!(await confirm({ title: "Delete this draft facility?", danger: true }))) return;
    try {
      await api.deleteFacility(id);
      await load();
    } catch (e) {
      logApiError("FacilitiesPage.deleteFacility", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Loans & facilities"
        description="Sanctioned limits linked to financiers (external principals)."
        actions={
          <>
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
          </>
        }
      />
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
                  <td className="px-3 py-2">
                    <RowActionsMenu
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      items={[
                        { key: "view", label: "View", href: `/app/finance/facilities/${r.id}` },
                        {
                          key: "util",
                          label: "New utilization",
                          href: `/app/finance/facilities/${r.id}/utilizations/new`,
                        },
                        ...(String(r.status) === "draft"
                          ? [
                              {
                                key: "delete",
                                label: "Delete",
                                danger: true as const,
                                onClick: () => void removeDraft(r.id),
                              },
                            ]
                          : []),
                      ]}
                    />
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
