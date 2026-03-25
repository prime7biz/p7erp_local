import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listTenants,
  suspendTenant,
  reactivateTenant,
  deleteTenant,
  triggerTenantBackup,
  type TenantListItem,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { LoadingState } from "@/components/ui/LoadingState";
import { useDebounce } from "@/hooks/useDebounce";
import { useToast } from "@/context/ToastContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { formatDateTime } from "@/utils/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function TenantListPage() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 300);
  const [isActive, setIsActive] = useState<string>("");
  const [tenantType, setTenantType] = useState("");
  const [sortBy, setSortBy] = useState<string>("");
  const [items, setItems] = useState<TenantListItem[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 50 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openActions, setOpenActions] = useState<string | number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await listTenants({
        page,
        page_size: 50,
        search: debounced || undefined,
        is_active: isActive === "true" ? true : isActive === "false" ? false : undefined,
        tenant_type: tenantType || undefined,
        sort_by: sortBy || undefined,
        sort_dir: "desc",
      });
      setItems(r.items);
      setMeta(r.meta);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, debounced, isActive, tenantType, sortBy]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(id: number, fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      showToast(msg, "success");
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.page_size));

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Search, filter, and manage all registered tenants."
        actions={
          can("tenants.create") ? (
            <Link
              to="/tenants/new"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Create tenant
            </Link>
          ) : null
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} className="min-w-[200px] flex-1 max-w-md" />
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={isActive}
          onChange={(e) => {
            setPage(1);
            setIsActive(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={tenantType}
          onChange={(e) => {
            setPage(1);
            setTenantType(e.target.value);
          }}
        >
          <option value="">All types</option>
          <option value="manufacturer">Manufacturer</option>
          <option value="buying_house">Buying house</option>
          <option value="both">Both</option>
        </select>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={sortBy}
          onChange={(e) => {
            setPage(1);
            setSortBy(e.target.value);
          }}
        >
          <option value="">Sort: default</option>
          <option value="name">Name</option>
          <option value="created_at">Created</option>
        </select>
      </FilterBar>

      {loading && items.length === 0 ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: "id",
                header: "ID",
                cell: (r) => <span className="tabular-nums text-slate-600">{r.id}</span>,
              },
              {
                key: "name",
                header: "Name",
                cell: (r) => (
                  <Link className="font-medium text-indigo-700 hover:underline" to={`/tenants/${r.id}`}>
                    {r.name}
                  </Link>
                ),
              },
              {
                key: "code",
                header: "Company code",
                cell: (r) => <span className="font-mono text-xs">{r.company_code ?? "—"}</span>,
              },
              {
                key: "type",
                header: "Type",
                cell: (r) => <span className="capitalize">{r.tenant_type.replace(/_/g, " ")}</span>,
              },
              {
                key: "status",
                header: "Status",
                cell: (r) => (
                  <StatusBadge variant={r.is_active ? "success" : "neutral"}>
                    {r.deleted_at ? "Deleted" : r.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                ),
              },
              {
                key: "created",
                header: "Created",
                cell: (r) => <span className="text-xs text-slate-600 whitespace-nowrap">{formatDateTime(r.created_at)}</span>,
              },
              {
                key: "actions",
                header: "",
                className: "w-28 text-right",
                cell: (r) => (
                  <ActionsMenu
                    rowId={r.id}
                    openId={openActions}
                    onOpenChange={setOpenActions}
                    actions={[
                      { label: "View", onClick: () => nav(`/tenants/${r.id}`) },
                      ...(can("tenants.manage")
                        ? [
                            {
                              label: r.is_active ? "Suspend" : "Reactivate",
                              onClick: () =>
                                run(
                                  r.id,
                                  () => (r.is_active ? suspendTenant(r.id) : reactivateTenant(r.id)),
                                  r.is_active ? "Tenant suspended" : "Tenant reactivated",
                                ),
                              disabled: !!r.deleted_at || busy,
                            },
                            {
                              label: "Delete",
                              danger: true,
                              onClick: () => setConfirmDelete(r.id),
                              disabled: !!r.deleted_at || busy,
                            },
                          ]
                        : []),
                      ...(can("operations.backups")
                        ? [
                            {
                              label: "Backup",
                              onClick: () =>
                                run(r.id, () => triggerTenantBackup(r.id), "Tenant backup completed"),
                              disabled: busy,
                            },
                          ]
                        : []),
                    ]}
                  />
                ),
              },
            ]}
            rows={items}
            rowKey={(r) => r.id}
            emptyMessage="No tenants match your filters."
            loading={loading}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{meta.total}</span> total
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600 tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete == null) return;
          const id = confirmDelete;
          setConfirmDelete(null);
          await run(id, () => deleteTenant(id), "Tenant marked deleted");
        }}
        title="Delete tenant?"
        message="This soft-deletes the tenant and deactivates it. This cannot be undone from the UI."
        confirmLabel="Delete"
        danger
        loading={busy}
      />
    </div>
  );
}
