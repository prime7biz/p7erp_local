import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type CustomerResponse, type InquiryResponse } from "@/api/client";

const statusClass = (status: string) => {
  const value = status.toUpperCase();
  if (value === "WON" || value === "APPROVED") return "bg-emerald-100 text-emerald-700";
  if (value === "LOST" || value === "REJECTED") return "bg-red-100 text-red-700";
  if (value === "SUBMITTED") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
};

export function InquiriesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InquiryResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [inqs, custs] = await Promise.all([
        api.listInquiries({
          search,
          status: statusFilter || undefined,
          department: departmentFilter || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        api.listCustomers(),
      ]);
      setItems(inqs);
      setCustomers(custs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => items, [items]);

  const customerName = (id: number) =>
    customers.find((c) => c.id === id)?.name ?? `#${id}`;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, departmentFilter, page]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inquiries</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Manage buyer inquiries before they become quotations and confirmed orders.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="text"
            placeholder="Search by code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All departments</option>
            <option value="Infant">Infant</option>
            <option value="Kids">Kids</option>
            <option value="Boys">Boys</option>
            <option value="Girls">Girls</option>
            <option value="Men">Men</option>
            <option value="Ladies">Ladies</option>
            <option value="Knit">Knit</option>
            <option value="Fleece">Fleece</option>
          </select>
          <button
            type="button"
            onClick={() => navigate("/app/inquiries/new")}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-primary/90"
          >
            New Inquiry
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading inquiries...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No inquiries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-500">
                <tr>
                  <th className="py-2 px-4">Code</th>
                  <th className="py-2 px-4">Customer</th>
                  <th className="py-2 px-4">Style</th>
                  <th className="py-2 px-4">Intermediary</th>
                  <th className="py-2 px-4">Shipping</th>
                  <th className="py-2 px-4 text-right">Qty</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((inq) => (
                  <tr key={inq.id} className="border-b border-gray-100 last:border-0 align-top">
                    <td className="py-2 px-4 font-medium text-gray-900">
                      <Link to={`/app/inquiries/${inq.id}`} className="text-indigo-600 hover:underline">
                        {inq.inquiry_code}
                      </Link>
                    </td>
                    <td className="py-2 px-4 text-gray-700">{customerName(inq.customer_id)}</td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        {inq.style_image_url ? (
                          <img
                            src={inq.style_image_url}
                            alt={inq.style_name ?? inq.style_ref ?? "style"}
                            className="h-9 w-9 rounded object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-gray-100 border border-gray-200" />
                        )}
                        <div className="text-gray-700">
                          <div className="font-medium text-gray-900">
                            {inq.style_name ?? inq.style_ref ?? "—"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {inq.style_ref && inq.style_name && inq.style_ref !== inq.style_name
                              ? inq.style_ref
                              : inq.department ?? "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-4 text-gray-700">{inq.intermediary_name ?? "—"}</td>
                    <td className="py-2 px-4 text-gray-700">{inq.shipping_term ?? "—"}</td>
                    <td className="py-2 px-4 text-right text-gray-700">
                      {inq.quantity != null ? inq.quantity.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(inq.status)}`}>
                        {inq.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right space-x-2 whitespace-nowrap">
                      <Link
                        to={`/app/inquiries/${inq.id}`}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => navigate(`/app/inquiries/${inq.id}/edit`)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setError("");
                            await api.convertInquiryToQuotation(inq.id, { profit_percentage: 15 });
                            alert("Quotation created from inquiry.");
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Convert to quotation failed");
                          }
                        }}
                        className="rounded-lg border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                      >
                        To quotation
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("Delete this inquiry?")) return;
                          try {
                            setError("");
                            await api.deleteInquiry(inq.id);
                            await load();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Delete failed");
                          }
                        }}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
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

