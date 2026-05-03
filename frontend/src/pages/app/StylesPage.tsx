import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CustomerResponse, type StyleCreate, type StyleReportRow, type StyleResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  listPageErrorClass,
  listPageFilterPanelClass,
  listPageEmptyClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageTableCardClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import { useListPagination } from "@/hooks/useListPagination";
import { logApiError } from "@/utils/logApiError";
import { cn } from "@/lib/utils";

const lifecycleOptions = ["INQUIRY", "DEVELOPMENT", "QUOTED", "ORDERED", "IN_PRODUCTION", "SHIPPED", "PAID", "CLOSED"];
const priorityOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const riskOptions = ["LOW", "MEDIUM", "HIGH"];

export function StylesPage() {
  const [items, setItems] = useState<StyleResponse[]>([]);
  const [reportRows, setReportRows] = useState<StyleReportRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const { page, setPage, pageSize, setPageSize, offset } = useListPagination();
  const [form, setForm] = useState<StyleCreate>({
    style_code: "",
    name: "",
    status: "ACTIVE",
    lifecycle_stage: "INQUIRY",
    is_active_for_new_orders: true,
  });

  const reportMap = useMemo(() => new Map(reportRows.map((row) => [row.style_id, row])), [reportRows]);

  useEffect(() => {
    void api
      .listCustomers()
      .then(setCustomers)
      .catch((e) => logApiError("StylesPage.listCustomers", e));
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const buyerId = Number(buyerFilter);
      const common = {
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        lifecycle_stage: lifecycleFilter || undefined,
        buyer_customer_id: Number.isFinite(buyerId) && buyerId > 0 ? buyerId : undefined,
        department: departmentFilter.trim() || undefined,
      };

      if (criticalOnly) {
        const reportRes = await api.listStyleSummaryReportWithTotal({
          ...common,
          critical_only: true,
          report_limit: pageSize,
          report_offset: offset,
        });
        const repTotal = reportRes.total ?? reportRes.rows.length;
        setListTotal(repTotal);
        setReportRows(reportRes.rows);
        const ids = reportRes.rows.map((r) => r.style_id);
        if (ids.length === 0) {
          setItems([]);
        } else {
          const styleRes = await api.listStylesWithTotal({
            style_ids: ids,
            limit: Math.max(ids.length, 1),
            offset: 0,
          });
          const byId = new Map(styleRes.rows.map((s) => [s.id, s]));
          setItems(ids.map((id) => byId.get(id)).filter((s): s is StyleResponse => s != null));
        }
      } else {
        const styleRes = await api.listStylesWithTotal({
          ...common,
          limit: pageSize,
          offset,
        });
        setItems(styleRes.rows);
        setListTotal(styleRes.total ?? 0);
        const ids = styleRes.rows.map((s) => s.id);
        if (ids.length === 0) {
          setReportRows([]);
        } else {
          const reports = await api.listStyleSummaryReport({
            style_ids: ids,
            // Align with SQL fast path (server applies offset/limit after filters).
            report_limit: Math.max(ids.length, 1),
            report_offset: 0,
          });
          setReportRows(reports);
        }
      }
    } catch (e) {
      logApiError("StylesPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load styles");
      setListTotal(0);
      setItems([]);
      setReportRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, lifecycleFilter, buyerFilter, departmentFilter, criticalOnly, page, pageSize]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) {
      setError("Style name is required");
      return;
    }
    try {
      await api.createStyle(form);
      setShowForm(false);
      setForm({
        style_code: "",
        name: "",
        status: "ACTIVE",
        lifecycle_stage: "INQUIRY",
        is_active_for_new_orders: true,
      });
      await load();
    } catch (e) {
      logApiError("StylesPage.submit", e);
      setError(e instanceof Error ? e.message : "Failed to create style");
    }
  };

  const buyerName = (buyerId: number | null) => customers.find((c) => c.id === buyerId)?.name ?? "—";

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Garment Styles"
        description="Style control tower for inquiry, production, shipment, and payment follow-up. List is paginated like Inquiries."
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            {showForm ? "Close" : "New style"}
          </button>
        }
      />

      <p className="text-xs text-text-muted">
        Showing page {page} · {items.length} row{items.length === 1 ? "" : "s"}
        {listTotal > 0 ? ` · ${listTotal} total matching filters` : ""}
        {criticalOnly ? " · Critical only (server-paged)" : ""}
      </p>

      <div className={listPageFilterPanelClass}>
        <p className="text-xs text-text-muted">
          Quick filter: start with <span className="font-semibold">Search</span>, then narrow by lifecycle or buyer.
        </p>
        <div className="grid gap-3 md:grid-cols-6">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search style code/name/buyer ref/product"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          >
            <option value="">All status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
          <select
            value={lifecycleFilter}
            onChange={(e) => {
              setLifecycleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          >
            <option value="">All lifecycle</option>
            {lifecycleOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={buyerFilter}
            onChange={(e) => {
              setBuyerFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          >
            <option value="">All buyer</option>
            {customers.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Department"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={criticalOnly}
              onChange={(e) => {
                setCriticalOnly(e.target.checked);
                setPage(1);
              }}
            />
            Critical only
          </label>
        </div>
      </div>

      {error && <div className={listPageErrorClass}>{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="rounded-xl border border-border bg-surface-raised p-4 space-y-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Create New Style</h2>
            <p className="mt-1 text-xs text-text-muted">
              Fill Step 1 first (minimum required), then Step 2 and Step 3 for better follow-up tracking.
            </p>
          </div>

          <div className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Step 1: Required basics</p>
            <div className="grid gap-3 md:grid-cols-4">
              <input
                value={form.style_code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, style_code: e.target.value }))}
                placeholder="Style code (optional auto)"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
              <input
                value={form.name ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Style name *"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
              <input
                value={form.product_type ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, product_type: e.target.value || null }))}
                placeholder="Product type"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
              <input
                value={form.buyer_style_ref ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, buyer_style_ref: e.target.value || null }))}
                placeholder="Buyer style ref"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Step 2: Classification</p>
            <div className="grid gap-3 md:grid-cols-4">
              <input
                value={form.season ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, season: e.target.value || null }))}
                placeholder="Season"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
              <input
                value={form.department ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value || null }))}
                placeholder="Department"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
              <select
                value={form.lifecycle_stage ?? "INQUIRY"}
                onChange={(e) => setForm((f) => ({ ...f, lifecycle_stage: e.target.value }))}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              >
                {lifecycleOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={form.status ?? "ACTIVE"}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle p-3">
            <p className="mb-2 text-xs font-semibold text-text-secondary">Step 3: Risk and priority</p>
            <div className="grid gap-3 md:grid-cols-4">
              <select
                value={form.priority ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value || null }))}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              >
                <option value="">Priority</option>
                {priorityOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={form.risk_level ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, risk_level: e.target.value || null }))}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              >
                <option value="">Risk level</option>
                {riskOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                value={form.style_image_url ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, style_image_url: e.target.value || null }))}
                placeholder="Style image URL"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm"
              />
              <button type="submit" className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground">
                Save
              </button>
            </div>
          </div>
        </form>
      )}

      <div className={listPageTableCardClass}>
        {loading ? (
          <div className={listPageLoadingClass}>Loading styles...</div>
        ) : items.length === 0 ? (
          <div className={listPageEmptyClass}>No styles found.</div>
        ) : (
          <>
            <ResponsiveTableContainer>
              <table className={cn(listTableBaseClass, "min-w-[1250px]")}>
                <thead className={listTableTheadClass}>
                  <tr>
                    <th className={cn(listTableThClass, "whitespace-nowrap")}>Style code</th>
                    <th className={cn(listTableThClass, "min-w-[170px]")}>Name</th>
                    <th className={listTableThClass}>Buyer</th>
                    <th className={listTableThClass}>Lifecycle</th>
                    <th className={listTableThRightClass}>Open actions</th>
                    <th className={listTableThRightClass}>Overdue actions</th>
                    <th className={listTableThRightClass}>Pending payment</th>
                    <th className={listTableThClass}>Last event</th>
                    <th className={cn(listTableThRightClass, "whitespace-nowrap")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const report = reportMap.get(s.id);
                    return (
                      <tr key={s.id} className={listTableTrClass}>
                        <td className={cn(listTableTdPrimaryClass, "whitespace-nowrap")}>
                          <Link to={`/app/merchandising/styles/${s.id}`} className="text-brand-primary hover:underline">
                            {s.style_code}
                          </Link>
                        </td>
                        <td className={listTableTdClass}>{s.name}</td>
                        <td className={listTableTdClass}>{buyerName(s.buyer_customer_id)}</td>
                        <td className={listTableTdClass}>{s.lifecycle_stage}</td>
                        <td className={cn(listTableTdClass, "text-right")}>{report?.open_followup_actions ?? 0}</td>
                        <td className={cn(listTableTdClass, "text-right")}>{report?.overdue_followup_actions ?? 0}</td>
                        <td className={cn(listTableTdClass, "text-right")}>{report?.due_amount ?? "0.00"}</td>
                        <td className={listTableTdClass}>
                          {report?.last_event_at ? new Date(report.last_event_at).toLocaleDateString() : "—"}
                        </td>
                        <td className={cn(listTableTdClass, "text-right whitespace-nowrap")}>
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
                                <Link
                                  to={`/app/reports/style-360?styleId=${s.id}`}
                                  onClick={() => setOpenActionsId(null)}
                                  className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Open timeline
                                </Link>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setOpenActionsId(null);
                                    try {
                                      await api.updateStyle(s.id, { status: "INACTIVE", is_active_for_new_orders: false });
                                      await load();
                                    } catch (e) {
                                      logApiError("StylesPage.archiveStyle", e);
                                      setError(e instanceof Error ? e.message : "Archive failed");
                                    }
                                  }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                >
                                  Archive
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            {!loading && listTotal > 0 ? (
              <DataTablePagination
                page={page}
                pageSize={pageSize}
                total={listTotal}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
