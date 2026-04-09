import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";

type SnapshotRow = {
  id: number;
  snapshot_type: string;
  snapshot_month: string;
  facility_id: number;
};

function renderDataEntries(data: unknown): { key: string; value: string }[] {
  if (data == null) return [];
  if (typeof data !== "object") return [{ key: "value", value: String(data) }];
  return Object.entries(data as Record<string, unknown>).map(([k, v]) => ({
    key: k,
    value: typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
  }));
}

export function FinancierSnapshotsPage() {
  const [list, setList] = useState<{ items?: SnapshotRow[] } | null>(null);
  const [detail, setDetail] = useState<{ id: number; snapshot_type?: string; data?: unknown } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [err, setErr] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setList((await financierPortalApi.snapshots()) as { items?: SnapshotRow[] });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  useEffect(() => {
    if (openActionsId == null) return;
    const onDown = () => setOpenActionsId(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openActionsId]);

  if (err) return <PortalErrorState message={err} />;
  const items = list?.items ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-text-primary">Snapshots</h1>
      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          No snapshots in scope for your linked facilities.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className={listTableHeadCellClass}>Snapshot month</th>
                <th className={listTableHeadCellClass}>Type</th>
                <th className={listTableHeadCellClass}>Facility ID</th>
                <th className={`${listTableHeadCellClass} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className={listTableRowClass}>
                  <td className="px-3 py-2">{s.snapshot_month}</td>
                  <td className="px-3 py-2 text-xs">{s.snapshot_type}</td>
                  <td className="px-3 py-2 tabular-nums">{s.facility_id}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setOpenActionsId((prev) => (prev === s.id ? null : s.id))}
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Actions
                      </button>
                      {openActionsId === s.id ? (
                        <div
                          className="absolute right-0 z-10 mt-1 w-28 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => {
                              setOpenActionsId(null);
                              void (async () => {
                                setDetailLoading(true);
                                try {
                                  const d = (await financierPortalApi.snapshot(s.id)) as typeof detail;
                                  setDetail(d);
                                  setErr("");
                                } catch (e) {
                                  setErr(e instanceof Error ? e.message : "Failed");
                                } finally {
                                  setDetailLoading(false);
                                }
                              })();
                            }}
                          >
                            View
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailLoading ? <p className="text-sm text-text-muted">Loading snapshot…</p> : null}

      {detail ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="text-sm font-semibold text-text-primary">Snapshot detail</h2>
          <p className="mt-1 text-xs text-text-muted">
            #{detail.id}
            {detail.snapshot_type ? ` · ${detail.snapshot_type}` : ""}
          </p>
          <dl className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto text-sm">
            {renderDataEntries(detail.data).map((row) => (
              <div key={row.key} className="grid gap-1 border-b border-border/60 py-2 sm:grid-cols-3">
                <dt className="font-medium text-text-muted">{row.key}</dt>
                <dd className="sm:col-span-2 break-words text-text-primary">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
