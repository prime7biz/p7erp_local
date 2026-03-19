import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type CustomerResponse } from "@/api/client";
import { ArrowUpRight, ExternalLink, Filter, Plus, Search, Users } from "lucide-react";

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

export function CustomersPage() {
  const PAGE_SIZE = 10;
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [activeCount, setActiveCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [recentCount, setRecentCount] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const statusFilter = searchParams.get("status") ?? FILTER_ALL;
  const countryFilter = searchParams.get("country") ?? FILTER_ALL;
  const typeFilter = searchParams.get("type") ?? FILTER_ALL;
  const page = Math.max(Number(searchParams.get("page") ?? "1") || 1, 1);
  const [searchInput, setSearchInput] = useState(q);

  const countries = useMemo(() => {
    return Array.from(new Set(customers.map((c) => c.billing_country ?? c.country).filter(Boolean) as string[])).sort();
  }, [customers]);

  const customerTypes = useMemo(() => {
    return Array.from(new Set(customers.map((c) => c.customer_type).filter(Boolean) as string[])).sort();
  }, [customers]);

  const kpis = useMemo(() => {
    return {
      total,
      active: activeCount,
      inactive: inactiveCount,
      recent: recentCount,
    };
  }, [activeCount, inactiveCount, recentCount, total]);

  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    const pages: number[] = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [page, totalPages]);

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

  const setPageParam = useCallback(
    (targetPage: number) => {
      const next = new URLSearchParams(searchParams);
      if (targetPage <= 1) next.delete("page");
      else next.set("page", String(targetPage));
      setSearchParams(next);
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.listCustomersPaginated({
        q: q.trim() || undefined,
        status: statusFilter === FILTER_ALL ? undefined : statusFilter,
        country: countryFilter === FILTER_ALL ? undefined : countryFilter,
        customer_type: typeFilter === FILTER_ALL ? undefined : typeFilter,
        page,
        page_size: PAGE_SIZE,
      });
      setCustomers(result.items);
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setActiveCount(result.active_count);
      setInactiveCount(result.inactive_count);
      setRecentCount(result.recent_count);
      if (result.page !== page) {
        setPageParam(result.page);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, countryFilter, typeFilter, page, setPageParam]);

  useEffect(() => {
    void load();
  }, [load]);

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
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this customer? This action cannot be undone.")) return;
    setError("");
    try {
      await api.deleteCustomer(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const renderSkeletonRows = () =>
    Array.from({ length: 6 }).map((_, idx) => (
      <tr key={idx} className="animate-pulse">
        <td className="px-4 py-4">
          <div className="h-3.5 w-28 rounded bg-surface-subtle" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-48 rounded bg-surface-subtle" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-24 rounded bg-surface-subtle" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-36 rounded bg-surface-subtle" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-20 rounded bg-surface-subtle" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-24 rounded bg-surface-subtle" />
        </td>
        <td className="px-4 py-4 text-right">
          <div className="ml-auto h-3.5 w-14 rounded bg-surface-subtle" />
        </td>
      </tr>
    ));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Merchandising / Customers</div>
          <h1 className="mt-1 text-3xl font-bold text-text-primary">Customers</h1>
          <p className="mt-1 text-sm text-text-muted">Manage and monitor your global customer base.</p>
        </div>
        <Link
          to="/app/customers/new"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
        >
          <Plus className="h-4 w-4" />
          New customer
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Total Customers</div>
          <div className="mt-2 text-2xl font-bold text-text-primary">{kpis.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Active</div>
          <div className="mt-2 text-2xl font-bold text-status-success">{kpis.active}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Inactive</div>
          <div className="mt-2 text-2xl font-bold text-text-muted">{kpis.inactive}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Added (30 Days)</div>
          <div className="mt-2 text-2xl font-bold text-brand-primary">{kpis.recent}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
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

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Country</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Primary Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Updated</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>{renderSkeletonRows()}</tbody>
            </table>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-border-strong" />
            <h3 className="text-base font-semibold text-text-primary">No matching customers</h3>
            <p className="mt-1 text-sm text-text-muted">
              Try changing filters or create a new customer profile.
            </p>
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
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Primary Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Updated</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {customers.map((customer) => {
                    const status = (customer.status || "active").toLowerCase();
                    const statusClasses =
                      status === "active"
                        ? "bg-status-success-subtle text-status-success-foreground"
                        : "bg-status-neutral-subtle text-status-neutral-foreground";

                    return (
                      <tr key={customer.id} className="hover:bg-surface-subtle/80">
                        <td className="px-4 py-3">
                          <Link to={`/app/customers/${customer.id}`} className="inline-flex items-center gap-1 font-semibold text-text-primary hover:text-brand-primary">
                            {customer.name}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <div className="text-xs text-text-muted">{customer.trade_name ?? customer.legal_entity_name ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{customer.customer_code}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{customer.billing_country ?? customer.country ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          <div>{customer.primary_contact_name ?? "—"}</div>
                          <div className="text-xs text-text-muted">{customer.contact_email ?? customer.email ?? "No email"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{customer.customer_type ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClasses}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(customer.updated_at)}</td>
                        <td className="px-4 py-3 text-right">
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
            </div>
              <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, total)} of {total} customers
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPageParam(page - 1)}
                  disabled={page <= 1}
                  className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                {visiblePageNumbers.map((pageNo) => (
                  <button
                    key={pageNo}
                    type="button"
                    onClick={() => setPageParam(pageNo)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      pageNo === page
                        ? "bg-brand-primary text-brand-primary-foreground"
                        : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
                    }`}
                  >
                    {pageNo}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPageParam(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <Link to="/app/customers/new" className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline">
                Add another
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
