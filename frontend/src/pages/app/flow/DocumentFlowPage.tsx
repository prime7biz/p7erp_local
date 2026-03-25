import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type QuotationResponse,
  type InquiryResponse,
  type ProformaInvoiceRow,
  type CustomerResponse,
  type TradeCaseRow,
} from "@/api/client";
import {
  FileText,
  ClipboardList,
  ShoppingCart,
  Receipt,
  RefreshCw,
  Search,
  ChevronRight,
  Download,
  Filter,
  ArrowRight,
} from "lucide-react";

const PREFIX = "/app";

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function escapeCsvCell(s: string | number | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (t.includes(",") || t.includes('"') || t.includes("\n")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export interface FlowRow {
  order: OrderResponse;
  quotation: QuotationResponse | null;
  inquiry: InquiryResponse | null;
  proformas: ProformaInvoiceRow[];
  customer: CustomerResponse | null;
}

export function DocumentFlowPage() {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [quotations, setQuotations] = useState<QuotationResponse[]>([]);
  const [inquiries, setInquiries] = useState<InquiryResponse[]>([]);
  const [proformas, setProformas] = useState<ProformaInvoiceRow[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [tradeCases, setTradeCases] = useState<TradeCaseRow[]>([]);
  const [tradeDocCounts, setTradeDocCounts] = useState<Record<number, number>>({});
  const [tradeShipCounts, setTradeShipCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState<string>("");
  const [filterOrderStatus, setFilterOrderStatus] = useState("");
  const [filterOrderDateFrom, setFilterOrderDateFrom] = useState("");
  const [filterOrderDateTo, setFilterOrderDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [orderList, quotationList, inquiryList, proformaList, customerList, tradeCaseList, countRes] = await Promise.all([
        api.listOrders({ limit: 500, offset: 0 }),
        api.listQuotations({ limit: 500, offset: 0 }),
        api.listInquiries({ limit: 500, offset: 0 }),
        api.listProformaInvoices(),
        api.listCustomers(),
        api.listTradeCases({ limit: 500 }),
        api.getTradeCaseDocumentCounts().catch(() => ({ documents: {}, shipments: {} })),
      ]);
      setOrders(Array.isArray(orderList) ? orderList : []);
      setQuotations(Array.isArray(quotationList) ? quotationList : []);
      setInquiries(Array.isArray(inquiryList) ? inquiryList : []);
      setProformas(Array.isArray(proformaList) ? proformaList : []);
      setCustomers(Array.isArray(customerList) ? customerList : []);
      setTradeCases(Array.isArray(tradeCaseList) ? tradeCaseList : []);
      const docMap: Record<number, number> = {};
      const shipMap: Record<number, number> = {};
      if (countRes?.documents) {
        Object.entries(countRes.documents).forEach(([k, v]) => {
          docMap[Number(k)] = Number(v) || 0;
        });
      }
      if (countRes?.shipments) {
        Object.entries(countRes.shipments).forEach(([k, v]) => {
          shipMap[Number(k)] = Number(v) || 0;
        });
      }
      setTradeDocCounts(docMap);
      setTradeShipCounts(shipMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load document flow");
      setOrders([]);
      setQuotations([]);
      setInquiries([]);
      setProformas([]);
      setCustomers([]);
      setTradeCases([]);
      setTradeDocCounts({});
      setTradeShipCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const quotationById = useMemo(() => {
    const m = new Map<number, QuotationResponse>();
    quotations.forEach((q) => m.set(q.id, q));
    return m;
  }, [quotations]);

  const inquiryById = useMemo(() => {
    const m = new Map<number, InquiryResponse>();
    inquiries.forEach((i) => m.set(i.id, i));
    return m;
  }, [inquiries]);

  const customerById = useMemo(() => {
    const m = new Map<number, CustomerResponse>();
    customers.forEach((c) => m.set(c.id, c));
    return m;
  }, [customers]);

  const proformasByOrderId = useMemo(() => {
    const m = new Map<number, ProformaInvoiceRow[]>();
    proformas.forEach((pi) => {
      const ids = pi.order_ids ?? (pi.order_id != null ? [pi.order_id] : []);
      ids.forEach((orderId) => {
        const list = m.get(orderId) ?? [];
        list.push(pi);
        m.set(orderId, list);
      });
    });
    return m;
  }, [proformas]);

  const tradeCaseByOrderId = useMemo(() => {
    const m = new Map<number, TradeCaseRow>();
    tradeCases.forEach((tc) => {
      if (tc.order_id != null) m.set(tc.order_id, tc);
    });
    return m;
  }, [tradeCases]);

  const flowRows = useMemo((): FlowRow[] => {
    return orders.map((order) => {
      const quotation = order.quotation_id != null ? quotationById.get(order.quotation_id) ?? null : null;
      const inquiry = quotation?.inquiry_id != null ? inquiryById.get(quotation.inquiry_id) ?? null : null;
      const proformasForOrder = proformasByOrderId.get(order.id) ?? [];
      const customer = customerById.get(order.customer_id) ?? null;
      return { order, quotation, inquiry, proformas: proformasForOrder, customer };
    });
  }, [orders, quotationById, inquiryById, proformasByOrderId, customerById]);

  const filteredRows = useMemo(() => {
    let rows = flowRows;
    if (filterCustomerId) {
      const cid = Number(filterCustomerId);
      rows = rows.filter((r) => r.order.customer_id === cid);
    }
    if (filterOrderStatus) {
      rows = rows.filter((r) => r.order.status === filterOrderStatus);
    }
    if (filterOrderDateFrom) {
      rows = rows.filter((r) => {
        const d = r.order.order_date;
        return d != null && d >= filterOrderDateFrom;
      });
    }
    if (filterOrderDateTo) {
      rows = rows.filter((r) => {
        const d = r.order.order_date;
        return d != null && d <= filterOrderDateTo;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.order.order_code ?? "").toLowerCase().includes(q) ||
          (r.order.style_ref ?? "").toLowerCase().includes(q) ||
          (r.quotation?.quotation_code ?? "").toLowerCase().includes(q) ||
          (r.inquiry?.inquiry_code ?? "").toLowerCase().includes(q) ||
          (r.customer?.name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [flowRows, filterCustomerId, filterOrderStatus, filterOrderDateFrom, filterOrderDateTo, search]);

  const orderStatuses = useMemo(() => {
    const set = new Set(orders.map((o) => o.status).filter(Boolean));
    return Array.from(set).sort();
  }, [orders]);

  const downloadCsv = useCallback(() => {
    const headers = [
      "Order Code",
      "Customer",
      "Inquiry Code",
      "Quotation Code",
      "Order Status",
      "Order Date",
      "Delivery Date",
      "Style Ref",
      "Quantity",
      "Proforma Count",
      "Proforma Refs",
      "Trade Case Ref",
      "Trade Docs",
      "Shipments",
    ];
    const lines = [
      headers.join(","),
      ...filteredRows.map((r) =>
        [
          escapeCsvCell(r.order.order_code),
          escapeCsvCell(r.customer?.name),
          escapeCsvCell(r.inquiry?.inquiry_code),
          escapeCsvCell(r.quotation?.quotation_code),
          escapeCsvCell(r.order.status),
          escapeCsvCell(r.order.order_date),
          escapeCsvCell(r.order.delivery_date),
          escapeCsvCell(r.order.style_ref),
          escapeCsvCell(r.order.quantity),
          String(r.proformas.length),
          escapeCsvCell(r.proformas.map((p) => p.reference ?? `#${p.id}`).join("; ")),
          escapeCsvCell(tradeCaseByOrderId.get(r.order.id)?.reference),
          String(tradeCaseByOrderId.get(r.order.id) ? tradeDocCounts[tradeCaseByOrderId.get(r.order.id)!.id] ?? 0 : ""),
          String(tradeCaseByOrderId.get(r.order.id) ? tradeShipCounts[tradeCaseByOrderId.get(r.order.id)!.id] ?? 0 : ""),
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `document-flow-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRows, tradeCaseByOrderId, tradeDocCounts, tradeShipCounts]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Document Flow</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Track the full document chain: Inquiry → Quotation → Order → Proforma Invoice. See at a glance which
            documents exist at each stage for every order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>
      )}

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Link
          to={`${PREFIX}/inquiries`}
          className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-brand-primary/30 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-primary/10 p-2">
              <ClipboardList className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Inquiries</p>
              <p className="text-2xl font-bold text-text-primary">{inquiries.length}</p>
            </div>
          </div>
        </Link>
        <Link
          to={`${PREFIX}/quotations`}
          className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-brand-primary/30 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-status-info-subtle p-2">
              <FileText className="h-5 w-5 text-status-info" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Quotations</p>
              <p className="text-2xl font-bold text-text-primary">{quotations.length}</p>
            </div>
          </div>
        </Link>
        <Link
          to={`${PREFIX}/orders`}
          className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-brand-primary/30 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-status-warning-subtle p-2">
              <ShoppingCart className="h-5 w-5 text-status-warning-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Orders</p>
              <p className="text-2xl font-bold text-text-primary">{orders.length}</p>
            </div>
          </div>
        </Link>
        <Link
          to={`${PREFIX}/commercial/proforma-invoices`}
          className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-brand-primary/30 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-status-success-subtle p-2">
              <Receipt className="h-5 w-5 text-status-success" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Proforma Invoices</p>
              <p className="text-2xl font-bold text-text-primary">{proformas.length}</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search order, style, customer, quote, inquiry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border-strong py-2 pl-9 pr-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
            />
          </div>
          <select
            value={filterCustomerId}
            onChange={(e) => setFilterCustomerId(e.target.value)}
            className="rounded-lg border border-border-strong py-2 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterOrderStatus}
            onChange={(e) => setFilterOrderStatus(e.target.value)}
            className="rounded-lg border border-border-strong py-2 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
          >
            <option value="">All statuses</option>
            {orderStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filterOrderDateFrom}
            onChange={(e) => setFilterOrderDateFrom(e.target.value)}
            className="rounded-lg border border-border-strong py-2 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
            placeholder="From"
          />
          <input
            type="date"
            value={filterOrderDateTo}
            onChange={(e) => setFilterOrderDateTo(e.target.value)}
            className="rounded-lg border border-border-strong py-2 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
            placeholder="To"
          />
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilterCustomerId("");
              setFilterOrderStatus("");
              setFilterOrderDateFrom("");
              setFilterOrderDateTo("");
            }}
            className="rounded-lg border border-border-strong py-2 px-3 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Flow table */}
      <div className="rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="text-sm text-text-muted">Loading document flow…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="rounded-full bg-surface-subtle p-4">
              <ArrowRight className="h-8 w-8 text-text-muted" />
            </div>
            <p className="font-medium text-text-secondary">No orders match the current filters</p>
            <p className="text-sm text-text-muted">
              Add orders from Quotations or create orders directly. Document flow will show the chain Inquiry → Quotation → Order → Proforma.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilterCustomerId("");
                setFilterOrderStatus("");
                setFilterOrderDateFrom("");
                setFilterOrderDateTo("");
              }}
              className="mt-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border bg-surface-subtle text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Flow</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Order</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Inquiry</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Quotation</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Delivery</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Proforma</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Trade Case</th>
                  <th className="px-4 py-3 font-semibold text-text-secondary uppercase tracking-wider">Docs / Shipments</th>
                  <th className="px-4 py-3 text-right font-semibold text-text-secondary uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.order.id}
                    className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        {row.inquiry ? (
                          <Link
                            to={`${PREFIX}/inquiries/${row.inquiry.id}`}
                            className="inline-flex items-center rounded bg-brand-primary/10 px-2 py-0.5 font-medium text-brand-primary hover:bg-brand-primary/15"
                          >
                            INQ
                          </Link>
                        ) : (
                          <span className="rounded bg-surface-subtle px-2 py-0.5 text-text-muted">—</span>
                        )}
                        <ChevronRight className="h-3.5 w-3 text-border-strong" />
                        {row.quotation ? (
                          <Link
                            to={`${PREFIX}/quotations/${row.quotation.id}`}
                            className="inline-flex items-center rounded bg-status-info-subtle px-2 py-0.5 font-medium text-status-info-foreground hover:bg-status-info-subtle/80"
                          >
                            QT
                          </Link>
                        ) : (
                          <span className="rounded bg-surface-subtle px-2 py-0.5 text-text-muted">—</span>
                        )}
                        <ChevronRight className="h-3.5 w-3 text-border-strong" />
                        <Link
                          to={`${PREFIX}/orders/${row.order.id}`}
                          className="inline-flex items-center rounded bg-status-warning-subtle px-2 py-0.5 font-medium text-status-warning-foreground hover:bg-status-warning-subtle"
                        >
                          ORD
                        </Link>
                        <ChevronRight className="h-3.5 w-3 text-border-strong" />
                        {row.proformas.length > 0 ? (
                          <span className="rounded bg-status-success-subtle px-2 py-0.5 font-medium text-status-success-foreground">
                            PI ×{row.proformas.length}
                          </span>
                        ) : (
                          <span className="rounded bg-surface-subtle px-2 py-0.5 text-text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`${PREFIX}/orders/${row.order.id}`} className="font-medium text-brand-primary hover:underline">
                        {row.order.order_code ?? `#${row.order.id}`}
                      </Link>
                      {row.order.style_ref && (
                        <span className="ml-1 block text-xs text-text-muted">{row.order.style_ref}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {row.customer?.name ?? `#${row.order.customer_id}`}
                    </td>
                    <td className="px-4 py-3">
                      {row.inquiry ? (
                        <Link to={`${PREFIX}/inquiries/${row.inquiry.id}`} className="text-brand-primary hover:underline">
                          {row.inquiry.inquiry_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.quotation ? (
                        <Link to={`${PREFIX}/quotations/${row.quotation.id}`} className="text-brand-primary hover:underline">
                          {row.quotation.quotation_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                        {row.order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{formatDate(row.order.delivery_date)}</td>
                    <td className="px-4 py-3">
                      {row.proformas.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.proformas.slice(0, 3).map((pi) => (
                            <Link
                              key={pi.id}
                              to={`${PREFIX}/commercial/proforma-invoices/${pi.id}/edit`}
                              className="inline-flex rounded border border-status-success/30 bg-status-success-subtle px-2 py-0.5 text-xs font-medium text-status-success-foreground hover:bg-status-success-subtle"
                            >
                              {pi.reference ?? `#${pi.id}`}
                            </Link>
                          ))}
                          {row.proformas.length > 3 && (
                            <span className="text-xs text-text-muted">+{row.proformas.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tradeCaseByOrderId.get(row.order.id) ? (
                        <div className="flex flex-wrap gap-1">
                          <Link
                            to={`${PREFIX}/trade/cases/${tradeCaseByOrderId.get(row.order.id)!.id}`}
                            className="inline-flex rounded border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/15"
                          >
                            {tradeCaseByOrderId.get(row.order.id)!.reference}
                          </Link>
                          <Link
                            to={`${PREFIX}/logistics?trade_case_id=${tradeCaseByOrderId.get(row.order.id)!.id}`}
                            className="text-xs text-text-muted hover:underline"
                          >
                            Logistics
                          </Link>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {(() => {
                        const tc = tradeCaseByOrderId.get(row.order.id);
                        if (!tc) return "—";
                        const d = tradeDocCounts[tc.id] ?? 0;
                        const sh = tradeShipCounts[tc.id] ?? 0;
                        return (
                          <div className="flex flex-col gap-1">
                            <Link
                              to={`${PREFIX}/trade/cases/${tc.id}#trade-case-documents`}
                              className="text-brand-primary hover:underline"
                            >
                              {d} doc{d === 1 ? "" : "s"}
                            </Link>
                            <Link
                              to={`${PREFIX}/logistics?trade_case_id=${tc.id}`}
                              className="text-text-muted hover:underline"
                            >
                              {sh} shipment{sh === 1 ? "" : "s"}
                            </Link>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`${PREFIX}/orders/${row.order.id}`}
                        className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
                      >
                        View order
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && filteredRows.length > 0 && (
        <p className="text-xs text-text-muted">
          Showing {filteredRows.length} of {orders.length} orders. Use filters to narrow down. Export CSV for the
          current view.
        </p>
      )}
    </div>
  );
}
