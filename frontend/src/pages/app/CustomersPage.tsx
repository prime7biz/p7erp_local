import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type CustomerResponse } from "@/api/client";
import { ArrowUpRight, ExternalLink, Filter, Pencil, Plus, Search, Trash2, Users } from "lucide-react";

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

  const setFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === FILTER_ALL) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("page");
    setSearchParams(next);
  };

  const setPageParam = (targetPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (targetPage <= 1) next.delete("page");
    else next.set("page", String(targetPage));
    setSearchParams(next);
  };

  const load = async () => {
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
  };

  useEffect(() => {
    void load();
  }, [q, statusFilter, countryFilter, typeFilter, page]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    if (searchInput === q) return;
    const timer = window.setTimeout(() => {
      setFilterParam("q", searchInput);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, q]);

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
          <div className="h-3.5 w-28 rounded bg-slate-200" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-48 rounded bg-slate-200" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-24 rounded bg-slate-200" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-36 rounded bg-slate-200" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-20 rounded bg-slate-200" />
        </td>
        <td className="px-4 py-4">
          <div className="h-3.5 w-24 rounded bg-slate-200" />
        </td>
        <td className="px-4 py-4 text-right">
          <div className="ml-auto h-3.5 w-14 rounded bg-slate-200" />
        </td>
      </tr>
    ));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Merchandising / Customers</div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">Manage and monitor your global customer base.</p>
        </div>
        <Link
          to="/app/customers/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New customer
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Customers</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{kpis.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{kpis.active}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inactive</div>
          <div className="mt-2 text-2xl font-bold text-slate-500">{kpis.inactive}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Added (30 Days)</div>
          <div className="mt-2 text-2xl font-bold text-primary">{kpis.recent}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_200px_200px_200px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, code, contact..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setFilterParam("status", e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value={FILTER_ALL}>Status: All</option>
            <option value="active">Status: Active</option>
            <option value="inactive">Status: Inactive</option>
          </select>

          <select
            value={countryFilter}
            onChange={(e) => setFilterParam("country", e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Filter className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Country</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Primary Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>{renderSkeletonRows()}</tbody>
            </table>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-900">No matching customers</h3>
            <p className="mt-1 text-sm text-slate-500">
              Try changing filters or create a new customer profile.
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
              <Link
                to="/app/customers/new"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
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
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Country</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Primary Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((customer) => {
                    const status = (customer.status || "active").toLowerCase();
                    const statusClasses =
                      status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600";

                    return (
                      <tr key={customer.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <Link to={`/app/customers/${customer.id}`} className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-primary">
                            {customer.name}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <div className="text-xs text-slate-500">{customer.trade_name ?? customer.legal_entity_name ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{customer.customer_code}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{customer.billing_country ?? customer.country ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          <div>{customer.primary_contact_name ?? "—"}</div>
                          <div className="text-xs text-slate-500">{customer.contact_email ?? customer.email ?? "No email"}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{customer.customer_type ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClasses}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{formatDate(customer.updated_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to={`/app/customers/${customer.id}/edit`}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-primary/10 hover:text-primary"
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDelete(customer.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1} to{" "}
                {Math.min(page * PAGE_SIZE, total)} of {total} customers
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPageParam(page - 1)}
                  disabled={page <= 1}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                        ? "bg-primary text-white"
                        : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNo}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPageParam(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <Link to="/app/customers/new" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
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
