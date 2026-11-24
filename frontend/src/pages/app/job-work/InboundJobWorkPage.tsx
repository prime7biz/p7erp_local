import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { jobWorkApi, type JobWorkContractListItem } from "@/api/jobWork";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import {
  InventoryListViewToggle,
  inventoryScrollTableClass,
} from "@/components/inventory/InventoryMobileList";
import { useListViewPreference } from "@/hooks/useInventoryListView";
import { formatMoney } from "@/lib/money";
import { logApiError } from "@/utils/logApiError";

const STATUSES = ["DRAFT", "CONFIRMED", "IN_PROGRESS", "DELIVERED", "BILLED", "CLOSED"] as const;

function statusBadgeClass(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "CLOSED" || s === "BILLED") return "bg-emerald-50 text-emerald-700";
  if (s === "DRAFT") return "bg-gray-100 text-gray-700";
  if (s === "DELIVERED" || s === "IN_PROGRESS") return "bg-sky-50 text-sky-700";
  return "bg-amber-50 text-amber-800";
}

export function InboundJobWorkPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<JobWorkContractListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const { view, setView, showCards } = useListViewPreference();

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await jobWorkApi.listContracts({
        status: statusFilter || undefined,
        q: search.trim() || undefined,
        limit: 100,
        offset: 0,
      });
      setRows(res.rows);
      setTotal(res.total);
    } catch (e) {
      logApiError("InboundJobWorkPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load job work contracts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      const s = (r.status || "OTHER").toUpperCase();
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Inbound Job Work"
        description="CMT contracts: customer materials, produce, deliver, bill CM, receive payment, close"
        actions={
          <Link
            to="/app/production/job-work/new"
            className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            New contract
          </Link>
        }
      />

      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter("")}
          className={`rounded-full px-3 py-1 text-xs ${!statusFilter ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-700"}`}
        >
          All ({total ?? rows.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs ${statusFilter === s ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-700"}`}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contract no or customer"
          className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <InventoryListViewToggle value={view} onChange={setView} />
      </div>

      {loading ? (
        <InventoryTableSkeleton />
      ) : rows.length === 0 ? (
        <InventoryEmptyState
          title="No job work contracts"
          description="Create a contract when another factory gives you cutting, sewing or finishing work with their materials. Use New contract above."
        />
      ) : showCards ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link to={`/app/production/job-work/${r.id}`} className="font-medium text-brand-primary">
                    {r.contract_no}
                  </Link>
                  <p className="text-sm text-gray-700">{r.customer_name || `Customer #${r.customer_id}`}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(r.status)}`}>{r.status}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                CM {formatMoney(r.cm_rate)} {r.currency} · Ordered {r.qty_ordered_total} · Delivered{" "}
                {r.qty_delivered_accepted}
              </p>
              <div className="mt-3">
                <RowActionsMenu
                  rowId={r.id}
                  openId={openActionsId}
                  onOpenChange={setOpenActionsId}
                  items={[
                    {
                      key: "open",
                      label: "Open",
                      onClick: () => navigate(`/app/production/job-work/${r.id}`),
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={inventoryScrollTableClass}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">CM rate</th>
                <th className="px-3 py-2">Ordered</th>
                <th className="px-3 py-2">Delivered</th>
                <th className="px-3 py-2">Billed</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <Link to={`/app/production/job-work/${r.id}`} className="text-brand-primary hover:underline">
                      {r.contract_no}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.customer_name || `#${r.customer_id}`}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(r.status)}`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {formatMoney(r.cm_rate)} {r.currency}
                  </td>
                  <td className="px-3 py-2">{r.qty_ordered_total}</td>
                  <td className="px-3 py-2">{r.qty_delivered_accepted}</td>
                  <td className="px-3 py-2">
                    {formatMoney(r.amount_billed)} {r.currency}
                  </td>
                  <td className="px-3 py-2">
                    <RowActionsMenu
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      items={[
                        {
                          key: "open",
                          label: "Open",
                          onClick: () => navigate(`/app/production/job-work/${r.id}`),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
