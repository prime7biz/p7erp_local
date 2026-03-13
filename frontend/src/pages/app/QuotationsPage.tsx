import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type QuotationResponse,
  type CustomerResponse,
  type InquiryResponse,
} from "@/api/client";
import { QuotationStatusBadge } from "./quotations/QuotationStatusBadge";
import { QuotationListSkeleton } from "./quotations/QuotationListSkeleton";

export function QuotationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuotationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [inquiries, setInquiries] = useState<InquiryResponse[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [quickFilter, setQuickFilter] = useState<"all" | "has_inquiry" | "has_style_image" | "ready_to_convert">("all");
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [quotes, custs] = await Promise.all([
        api.listQuotations({
          search,
          status: statusFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        api.listCustomers(),
      ]);
      setItems(quotes);
      setCustomers(custs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (quickFilter === "has_inquiry") return items.filter((q) => q.inquiry_id != null);
    if (quickFilter === "has_style_image") return items.filter((q) => Boolean(q.style_image_url));
    if (quickFilter === "ready_to_convert") return items.filter((q) => q.status === "APPROVED");
    return items;
  }, [items, quickFilter]);

  const customerName = (id: number) =>
    customers.find((c) => c.id === id)?.name ?? `#${id}`;

  const inquiryCode = (id: number | null) =>
    id == null ? "—" : inquiries.find((i) => i.id === id)?.inquiry_code ?? `#${id}`;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page]);

  useEffect(() => {
    const loadInquiries = async () => {
      try {
        const data = await api.listInquiries({ limit: 200, offset: 0 });
        setInquiries(data);
      } catch {
        // ignore
      }
    };
    loadInquiries();
  }, []);

  const openCreate = () => {
    navigate("/app/quotations/new");
  };

  const approvedCount = filteredItems.filter((q) => q.status === "APPROVED").length;
  const pendingCount = filteredItems.filter((q) => ["DRAFT", "NEW", "SUBMITTED"].includes(q.status)).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Track price quotations generated from inquiries and convert them into sales orders.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by code…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="NEW">New</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="SENT">Sent</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setQuickFilter("all");
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary/90"
          >
            New quotation
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All" },
          { key: "has_inquiry", label: "Has inquiry" },
          { key: "has_style_image", label: "Has style image" },
          { key: "ready_to_convert", label: "Ready to convert" },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setQuickFilter(chip.key as typeof quickFilter)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              quickFilter === chip.key ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-gray-600"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Total on page</div>
          <div className="text-xl font-bold text-gray-900">{filteredItems.length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Approved</div>
          <div className="text-xl font-bold text-emerald-700">{approvedCount}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">Needs action</div>
          <div className="text-xl font-bold text-orange-600">{pendingCount}</div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <QuotationListSkeleton />
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500 space-y-3">
            <div>No quotations found for current filters.</div>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white"
              >
                New quotation
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setQuickFilter("all");
                }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
              <tr>
                <th className="py-2 px-4">Code</th>
                <th className="py-2 px-4">Customer</th>
                <th className="py-2 px-4">Inquiry</th>
                <th className="py-2 px-4">Style</th>
                <th className="py-2 px-4">Intermediary</th>
                <th className="py-2 px-4">Shipping</th>
                <th className="py-2 px-4">Commission</th>
                <th className="py-2 px-4 text-right">Qty</th>
                <th className="py-2 px-4 text-right">Amount</th>
                <th className="py-2 px-4 text-right">Profit %</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Created</th>
                <th className="py-2 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((q) => {
                const inq = q.inquiry_id
                  ? inquiries.find((i) => i.id === q.inquiry_id) ?? null
                  : null;
                const qty = inq?.quantity ?? null;
                const target = inq?.target_price ? Number(inq.target_price) : null;
                const quoted = q.total_amount ? Number(q.total_amount) : null;
                let profitPct: string | null = null;
                if (
                  qty != null &&
                  target != null &&
                  quoted != null &&
                  Number.isFinite(qty) &&
                  Number.isFinite(target) &&
                  Number.isFinite(quoted)
                ) {
                  const baseline = qty * target;
                  if (baseline) {
                    const pct = ((quoted - baseline) / baseline) * 100;
                    profitPct = `${pct.toFixed(1)}%`;
                  }
                }
                return (
                  <tr key={q.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-4 font-medium text-gray-900">
                      <Link
                        to={`/app/quotations/${q.id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {q.quotation_code}
                      </Link>
                    </td>
                    <td className="py-2 px-4 text-gray-700">{customerName(q.customer_id)}</td>
                    <td className="py-2 px-4 text-gray-700">{inquiryCode(q.inquiry_id)}</td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        {q.style_image_url ? (
                          <img
                            src={q.style_image_url}
                            alt={q.style_name ?? q.style_ref ?? "Style"}
                            className="h-8 w-8 rounded object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-gray-100 border border-gray-200" />
                        )}
                        <span className="text-gray-700">
                          {q.style_name ?? q.style_ref ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-4 text-gray-700">{q.intermediary_name ?? "—"}</td>
                    <td className="py-2 px-4 text-gray-700">{q.shipping_term ?? "—"}</td>
                    <td className="py-2 px-4 text-gray-700">
                      {q.commission_mode || q.commission_type || q.commission_value
                        ? `${q.commission_mode ?? "-"} / ${q.commission_type ?? "-"} / ${q.commission_value ?? "-"}`
                        : "—"}
                    </td>
                    <td className="py-2 px-4 text-right text-gray-700">
                      {qty != null ? qty.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-4 text-right text-gray-700">
                      {q.total_amount ?? "—"} {q.currency ?? ""}
                    </td>
                    <td className="py-2 px-4 text-right text-gray-700">
                      {profitPct ?? "—"}
                    </td>
                    <td className="py-2 px-4 text-gray-700"><QuotationStatusBadge status={q.status} /></td>
                    <td className="py-2 px-4 text-gray-700">
                      {new Date(q.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-4 text-right space-x-1 whitespace-nowrap">
                      <Link
                        to={`/app/quotations/${q.id}`}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </Link>
                      <Link
                        to={`/app/quotations/${q.id}?print=1`}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Print
                      </Link>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setError("");
                            if (q.status === "DRAFT" || q.status === "NEW") {
                              await api.submitQuotation(q.id);
                            } else if (q.status === "SUBMITTED") {
                              await api.approveQuotation(q.id);
                            } else if (q.status === "APPROVED") {
                              await api.sendQuotation(q.id);
                            } else {
                              await api.reviseQuotation(q.id);
                            }
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Workflow action failed");
                          }
                        }}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {q.status === "DRAFT" || q.status === "NEW"
                          ? "Submit"
                          : q.status === "SUBMITTED"
                            ? "Approve"
                            : q.status === "APPROVED"
                              ? "Send"
                              : "Revise"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setError("");
                            const duplicated = await api.reviseQuotation(q.id);
                            navigate(`/app/quotations/${duplicated.id}`);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Duplicate version failed");
                          }
                        }}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("Delete this quotation?")) return;
                          try {
                            setError("");
                            await api.deleteQuotation(q.id);
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Delete failed");
                          }
                        }}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setError("");
                            await api.convertQuotationToOrder(q.id);
                            alert("Order created from quotation.");
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Conversion failed");
                          }
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Convert to order
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          disabled={items.length < pageSize}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-lg border border-gray-300 px-3 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

