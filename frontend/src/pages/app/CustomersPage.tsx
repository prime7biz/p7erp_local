import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, type CustomerResponse } from "@/api/client";
import { useCustomerAi } from "@/hooks/useCustomerAi";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useListPagination } from "@/hooks/useListPagination";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import {
  listPageErrorClass,
  listPageFilterPanelClass,
  listPageKpiCardClass,
  listPageKpiLabelClass,
  listPageRootClass,
  listPageTableCardClass,
  listTableBaseClass,
  listTableTdClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  Filter,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

const FILTER_ALL = "all";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function DupRiskCell({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-text-muted">—</span>;
  if (score >= 0.75) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-danger-foreground" title="High duplicate risk">
        <AlertTriangle className="h-3.5 w-3.5" />
        High
      </span>
    );
  }
  if (score >= 0.45) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-warning-foreground" title="Possible duplicates">
        <AlertTriangle className="h-3.5 w-3.5" />
        Med
      </span>
    );
  }
  return <span className="text-xs text-text-muted">Low</span>;
}

export function CustomersPage() {
  const { pageSize, setPageSize } = useListPagination();
  const queryClient = useQueryClient();
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const listAi = useCustomerAi();
  const [aiQueryDraft, setAiQueryDraft] = useState("");

  const q = searchParams.get("q") ?? "";
  const statusFilter = searchParams.get("status") ?? FILTER_ALL;
  const countryFilter = searchParams.get("country") ?? FILTER_ALL;
  const typeFilter = searchParams.get("type") ?? FILTER_ALL;
  const page = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);
  const staleOnly = searchParams.get("stale") === "1";
  const incompleteOnly = searchParams.get("incomplete") === "1";
  const highDupeOnly = searchParams.get("high_dupe") === "1";

  const [searchInput, setSearchInput] = useState(q);

  const { data: facets } = useQuery({
    queryKey: ["customers", "facets"],
    queryFn: () => api.getCustomerFacets(),
  });

  const { data, isLoading: loading, error: queryError, refetch } = useQuery({
    queryKey: [
      "customers",
      "list",
      q,
      statusFilter,
      countryFilter,
      typeFilter,
      page,
      pageSize,
      staleOnly,
      incompleteOnly,
      highDupeOnly,
    ],
    queryFn: () =>
      api.listCustomersPaginated({
        q: q.trim() || undefined,
        status: statusFilter === FILTER_ALL ? undefined : statusFilter,
        country: countryFilter === FILTER_ALL ? undefined : countryFilter,
        customer_type: typeFilter === FILTER_ALL ? undefined : typeFilter,
        page,
        page_size: pageSize,
        include_ai_fields: true,
        stale_only: staleOnly,
        incomplete_only: incompleteOnly,
        high_duplicate_risk_only: highDupeOnly,
      }),
  });

  const customers: CustomerResponse[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const activeCount = data?.active_count ?? 0;
  const inactiveCount = data?.inactive_count ?? 0;
  const recentCount = data?.recent_count ?? 0;

  const fetchError =
    queryError instanceof Error ? queryError.message : queryError ? String(queryError) : "";
  const error = actionError || fetchError;

  const countries = useMemo(() => facets?.countries ?? [], [facets?.countries]);
  const customerTypes = useMemo(() => facets?.customer_types ?? [], [facets?.customer_types]);

  const kpis = useMemo(() => {
    return {
      total,
      active: activeCount,
      inactive: inactiveCount,
      recent: recentCount,
    };
  }, [activeCount, inactiveCount, recentCount, total]);

  const setFilterParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === FILTER_ALL) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      next.delete("page");
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const setBoolParam = useCallback(
    (key: string, on: boolean) => {
      const next = new URLSearchParams(searchParams);
      if (on) next.set(key, "1");
      else next.delete(key);
      next.delete("page");
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const setPageParam = useCallback(
    (targetPage: number) => {
      const next = new URLSearchParams(searchParams);
      if (targetPage <= 1) next.delete("page");
      else next.set("page", String(targetPage));
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (data && data.page !== page) {
      setPageParam(data.page);
    }
  }, [data, page, setPageParam]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    if (searchInput === q) return;
    const timer = window.setTimeout(() => {
      setFilterParam("q", searchInput);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, q, setFilterParam]);

  const resetFilters = () => {
    setSearchParams(new URLSearchParams());
    setAiQueryDraft("");
    listAi.clear();
  };

  const applyAiNlFilters = async () => {
    const res = await listAi.runNlSearch(aiQueryDraft.trim());
    if (!res) return;
    const next = new URLSearchParams(searchParams);
    next.delete("page");
    if (res.keyword?.trim()) next.set("q", res.keyword.trim());
    else next.delete("q");
    const f = res.interpreted_filters;
    if (f.country) next.set("country", f.country);
    if (f.status) next.set("status", String(f.status).toLowerCase());
    if (f.customer_type) next.set("type", f.customer_type);
    setSearchParams(next);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this customer? This action cannot be undone.")) return;
    setActionError("");
    try {
      await api.deleteCustomer(id);
      await queryClient.invalidateQueries({ queryKey: ["customers", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["customers", "facets"] });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const colCount = 11;

  const renderSkeletonRows = () =>
    Array.from({ length: 6 }).map((_, idx) => (
      <tr key={idx} className="animate-pulse">
        {Array.from({ length: colCount }).map((__, c) => (
          <td key={c} className={listTableTdClass}>
            <div className="h-3.5 w-24 rounded bg-surface-subtle" />
          </td>
        ))}
      </tr>
    ));

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Customers"
        description="Merchandising · Manage and monitor your global customer base. Filters and KPIs are loaded from the server."
        actions={
          <Link
            to="/app/customers/new"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            <Plus className="h-4 w-4" />
            New customer
          </Link>
        }
      />

      {error && (
        <div className={listPageErrorClass}>
          <div className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                setActionError("");
                void refetch();
              }}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Total Customers</div>
          <div className="mt-2 text-2xl font-bold text-text-primary">{kpis.total}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Active</div>
          <div className="mt-2 text-2xl font-bold text-status-success">{kpis.active}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Inactive</div>
          <div className="mt-2 text-2xl font-bold text-text-muted">{kpis.inactive}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Added (30 Days)</div>
          <div className="mt-2 text-2xl font-bold text-brand-primary">{kpis.recent}</div>
        </div>
      </div>

      <div className={listPageFilterPanelClass}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="font-semibold text-text-secondary">AI quick filters</span>
          <button
            type="button"
            onClick={() => setBoolParam("incomplete", !incompleteOnly)}
            className={`rounded-full px-2.5 py-1 font-medium ${
              incompleteOnly ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            Incomplete profiles (&lt;70%)
          </button>
          <button
            type="button"
            onClick={() => setBoolParam("stale", !staleOnly)}
            className={`rounded-full px-2.5 py-1 font-medium ${
              staleOnly ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            Stale (no activity 90d)
          </button>
          <button
            type="button"
            onClick={() => setBoolParam("high_dupe", !highDupeOnly)}
            className={`rounded-full px-2.5 py-1 font-medium ${
              highDupeOnly ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            High duplicate risk
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted">
              <Sparkles className="h-3.5 w-3.5" />
              Natural language → filters
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={aiQueryDraft}
                onChange={(e) => setAiQueryDraft(e.target.value)}
                placeholder='e.g. "active customers in Bangladesh"'
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
              <button
                type="button"
                disabled={listAi.status === "processing" || !aiQueryDraft.trim()}
                onClick={() => void applyAiNlFilters()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
              >
                {listAi.status === "processing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Apply AI filters
              </button>
            </div>
            {listAi.nlSearch?.explanation ? (
              <p className="mt-1 text-xs text-text-muted">{listAi.nlSearch.explanation}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, code, contact..."
              className="w-full rounded-lg border border-border-strong py-2 pl-9 pr-3 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setFilterParam("status", e.target.value)}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value={FILTER_ALL}>Status: All</option>
            <option value="active">Status: Active</option>
            <option value="inactive">Status: Inactive</option>
          </select>

          <select
            value={countryFilter}
            onChange={(e) => setFilterParam("country", e.target.value)}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value={FILTER_ALL}>Country: All</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setFilterParam("type", e.target.value)}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <option value={FILTER_ALL}>Type: All</option>
            {customerTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
          >
            <Filter className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className={listPageTableCardClass}>
        {loading ? (
          <ResponsiveTableContainer>
            <table className={listTableBaseClass}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass}>Customer</th>
                  <th className={listTableThClass}>ID</th>
                  <th className={listTableThClass}>Country</th>
                  <th className={listTableThClass}>Primary Contact</th>
                  <th className={listTableThClass}>Type</th>
                  <th className={listTableThClass}>Profile</th>
                  <th className={listTableThClass}>Activity</th>
                  <th className={listTableThClass}>Dup risk</th>
                  <th className={listTableThClass}>Status</th>
                  <th className={listTableThClass}>Updated</th>
                  <th className={listTableThRightClass}>Actions</th>
                </tr>
              </thead>
              <tbody>{renderSkeletonRows()}</tbody>
            </table>
          </ResponsiveTableContainer>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-border-strong" />
            <h3 className="text-base font-semibold text-text-primary">No matching customers</h3>
            <p className="mt-1 text-sm text-text-muted">Try changing filters or create a new customer profile.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
              >
                Clear filters
              </button>
              <Link
                to="/app/customers/new"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90"
              >
                <Plus className="h-4 w-4" />
                New customer
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ResponsiveTableContainer>
              <table className={listTableBaseClass}>
                <thead className={listTableTheadClass}>
                  <tr>
                    <th className={listTableThClass}>Customer</th>
                    <th className={listTableThClass}>ID</th>
                    <th className={listTableThClass}>Country</th>
                    <th className={listTableThClass}>Primary Contact</th>
                    <th className={listTableThClass}>Type</th>
                    <th className={listTableThClass}>Profile</th>
                    <th className={listTableThClass}>Activity</th>
                    <th className={listTableThClass}>Dup risk</th>
                    <th className={listTableThClass}>Status</th>
                    <th className={listTableThClass}>Updated</th>
                    <th className={listTableThRightClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const status = (customer.status || "active").toLowerCase();
                    const statusClasses =
                      status === "active"
                        ? "bg-status-success-subtle text-status-success-foreground"
                        : "bg-status-neutral-subtle text-status-neutral-foreground";
                    const pct = customer.profile_completeness;
                    const days = customer.days_since_activity;
                    const staleBadge =
                      days != null && days >= 90 ? (
                        <span className="rounded-full bg-status-warning-subtle px-2 py-0.5 text-[10px] font-semibold text-status-warning-foreground">
                          Stale {days}d
                        </span>
                      ) : customer.last_activity_at ? (
                        <span className="text-xs text-text-muted">{formatDate(customer.last_activity_at)}</span>
                      ) : (
                        <span className="text-xs text-text-muted">No activity</span>
                      );

                    return (
                      <tr key={customer.id} className={listTableTrClass}>
                        <td className={listTableTdClass}>
                          <Link to={`/app/customers/${customer.id}`} className="inline-flex items-center gap-1 font-semibold text-text-primary hover:text-brand-primary">
                            {customer.name}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <div className="text-xs text-text-muted">{customer.trade_name ?? customer.legal_entity_name ?? "—"}</div>
                        </td>
                        <td className={listTableTdClass}>{customer.customer_code}</td>
                        <td className={listTableTdClass}>{customer.billing_country ?? customer.country ?? "—"}</td>
                        <td className={listTableTdClass}>
                          <div>{customer.primary_contact_name ?? "—"}</div>
                          <div className="text-xs text-text-muted">{customer.contact_email ?? customer.email ?? "No email"}</div>
                        </td>
                        <td className={listTableTdClass}>{customer.customer_type ?? "—"}</td>
                        <td className={listTableTdClass}>
                          {pct != null ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                pct >= 80
                                  ? "bg-status-success-subtle text-status-success-foreground"
                                  : pct >= 50
                                    ? "bg-status-warning-subtle text-status-warning-foreground"
                                    : "bg-status-danger-subtle text-status-danger-foreground"
                              }`}
                            >
                              {pct}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={listTableTdClass}>{staleBadge}</td>
                        <td className={listTableTdClass}>
                          <DupRiskCell score={customer.duplicate_risk_score} />
                        </td>
                        <td className={listTableTdClass}>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClasses}`}>
                            {status}
                          </span>
                        </td>
                        <td className={listTableTdClass}>{formatDate(customer.updated_at)}</td>
                        <td className={cn(listTableTdClass, "text-right")}>
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() => setOpenActionsId((prev) => (prev === customer.id ? null : customer.id))}
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Actions
                            </button>
                            {openActionsId === customer.id && (
                              <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                                <Link
                                  to={`/app/customers/${customer.id}`}
                                  onClick={() => setOpenActionsId(null)}
                                  className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  View
                                </Link>
                                <Link
                                  to={`/app/customers/${customer.id}/edit`}
                                  onClick={() => setOpenActionsId(null)}
                                  className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Edit
                                </Link>
                                <Link
                                  to={`/app/customers/${customer.id}/print`}
                                  onClick={() => setOpenActionsId(null)}
                                  className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Print
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionsId(null);
                                    void handleDelete(customer.id);
                                  }}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                >
                                  Delete
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
            <div className="flex flex-col gap-2 border-t border-border px-4 py-2 sm:flex-row sm:items-center sm:justify-end">
              <Link to="/app/customers/new" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-primary hover:underline">
                Add another
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <DataTablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(p) => setPageParam(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPageParam(1);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
