import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type QuotationResponse,
  type InquiryResponse,
  type ProformaInvoiceRow,
  type TradeCaseRow,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageKpiCardClass,
  listPageKpiGridClass,
  listPageKpiLabelClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { useListPagination } from "@/hooks/useListPagination";
import { cn } from "@/lib/utils";
import {
  FileText,
  ClipboardList,
  ShoppingCart,
  Receipt,
  RefreshCw,
  Search,
  ChevronRight,
  Download,
  ArrowRight,
} from "lucide-react";

const PREFIX = "/app";

/** Matches orders paginated API filters (created_at range, not order_date). */
const ORDER_STATUS_OPTIONS = ["DRAFT", "NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const AUX_PAGE_SIZE = 500;
const PROFORMA_LIMIT = 500;
const TRADE_CASE_LIMIT = 500;

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
  customerLabel: string;
}

export function DocumentFlowPage() {
  const { page, setPage, pageSize, setPageSize, allowedSizes } = useListPagination();
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [quotationById, setQuotationById] = useState<Map<number, QuotationResponse>>(() => new Map());
  const [inquiryById, setInquiryById] = useState<Map<number, InquiryResponse>>(() => new Map());
  const [proformas, setProformas] = useState<ProformaInvoiceRow[]>([]);
  const [tradeCases, setTradeCases] = useState<TradeCaseRow[]>([]);
  const [tradeDocCounts, setTradeDocCounts] = useState<Record<number, number>>({});
  const [tradeShipCounts, setTradeShipCounts] = useState<Record<number, number>>({});
  const [kpiInquiriesTotal, setKpiInquiriesTotal] = useState<number | null>(null);
  const [kpiQuotationsTotal, setKpiQuotationsTotal] = useState<number | null>(null);
  const [kpiProformasCount, setKpiProformasCount] = useState<number | null>(null);
  const [kpiProformasCapped, setKpiProformasCapped] = useState(false);

  const [ordersLoading, setOrdersLoading] = useState(true);
  const [auxLoading, setAuxLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterOrderStatus, setFilterOrderStatus] = useState("");
  const [filterCreatedFrom, setFilterCreatedFrom] = useState("");
  const [filterCreatedTo, setFilterCreatedTo] = useState("");
  const [openActionsOrderId, setOpenActionsOrderId] = useState<number | null>(null);

  const loadAuxiliary = useCallback(async () => {
    setAuxLoading(true);
    try {
      const [
        inqMeta,
        quotMeta,
        profList,
        tcList,
        countRes,
        quotPage,
        inqPage,
      ] = await Promise.all([
        api.listInquiriesPaginated({ page: 1, page_size: 1 }),
        api.listQuotationsPaginated({ page: 1, page_size: 1 }),
        api.listProformaInvoices({ limit: PROFORMA_LIMIT, offset: 0 }),
        api.listTradeCases({ limit: TRADE_CASE_LIMIT }),
        api.getTradeCaseDocumentCounts().catch(() => ({ documents: {}, shipments: {} })),
        api.listQuotationsPaginated({ page: 1, page_size: AUX_PAGE_SIZE }),
        api.listInquiriesPaginated({ page: 1, page_size: AUX_PAGE_SIZE }),
      ]);

      setKpiInquiriesTotal(inqMeta.total);
      setKpiQuotationsTotal(quotMeta.total);
      const plen = Array.isArray(profList) ? profList.length : 0;
      setKpiProformasCount(plen);
      setKpiProformasCapped(plen >= PROFORMA_LIMIT);

      setProformas(Array.isArray(profList) ? profList : []);
      setTradeCases(Array.isArray(tcList) ? tcList : []);

      const qMap = new Map<number, QuotationResponse>();
      quotPage.items.forEach((q) => qMap.set(q.id, q));
      setQuotationById(qMap);

      const iMap = new Map<number, InquiryResponse>();
      inqPage.items.forEach((i) => iMap.set(i.id, i));
      setInquiryById(iMap);

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
    } catch {
      setKpiInquiriesTotal(null);
      setKpiQuotationsTotal(null);
      setKpiProformasCount(null);
      setKpiProformasCapped(false);
      setProformas([]);
      setTradeCases([]);
      setQuotationById(new Map());
      setInquiryById(new Map());
      setTradeDocCounts({});
      setTradeShipCounts({});
    } finally {
      setAuxLoading(false);
    }
  }, []);

  const loadOrdersPage = useCallback(async () => {
    setOrdersLoading(true);
    setError("");
    try {
      const res = await api.listOrdersPaginated({
        search: search.trim() || undefined,
        status: filterOrderStatus || undefined,
        created_from: filterCreatedFrom || undefined,
        created_to: filterCreatedTo || undefined,
        page,
        page_size: pageSize,
      });
      setOrders(res.items);
      setListTotal(res.total);
      if (res.page !== page) setPage(res.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load document flow");
      setOrders([]);
      setListTotal(0);
    } finally {
      setOrdersLoading(false);
    }
  }, [search, filterOrderStatus, filterCreatedFrom, filterCreatedTo, page, pageSize, setPage]);

  useEffect(() => {
    void loadAuxiliary();
  }, [loadAuxiliary]);

  useEffect(() => {
    void loadOrdersPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterOrderStatus, filterCreatedFrom, filterCreatedTo, page, pageSize]);

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
      const quotation =
        order.quotation_id != null ? quotationById.get(order.quotation_id) ?? null : null;
      const inquiry =
        quotation?.inquiry_id != null ? inquiryById.get(quotation.inquiry_id) ?? null : null;
      const proformasForOrder = proformasByOrderId.get(order.id) ?? [];
      const customerLabel =
        order.customer_name?.trim() ? order.customer_name.trim() : `#${order.customer_id}`;
      return { order, quotation, inquiry, proformas: proformasForOrder, customerLabel };
    });
  }, [orders, quotationById, inquiryById, proformasByOrderId]);

  const quotationLinkId = (order: OrderResponse) => order.quotation_id;
  const quotationLinkCode = (row: FlowRow) =>
    row.quotation?.quotation_code ?? row.order.quotation_code ?? null;

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
      ...flowRows.map((r) =>
        [
          escapeCsvCell(r.order.order_code),
          escapeCsvCell(r.customerLabel),
          escapeCsvCell(r.inquiry?.inquiry_code),
          escapeCsvCell(quotationLinkCode(r)),
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
    a.download = `document-flow-page${page}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [flowRows, tradeCaseByOrderId, tradeDocCounts, tradeShipCounts, page]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setFilterOrderStatus("");
    setFilterCreatedFrom("");
    setFilterCreatedTo("");
    setPage(1);
  }, [setPage]);

  const refreshAll = useCallback(async () => {
    setOpenActionsOrderId(null);
    await Promise.all([loadAuxiliary(), loadOrdersPage()]);
  }, [loadAuxiliary, loadOrdersPage]);

  const loading = ordersLoading || auxLoading;
  const kpiOrdersDisplay = listTotal;
  const kpiInqDisplay = kpiInquiriesTotal == null ? "—" : kpiInquiriesTotal;
  const kpiQuotDisplay = kpiQuotationsTotal == null ? "—" : kpiQuotationsTotal;
  const kpiProfDisplay =
    kpiProformasCount == null ? "—" : kpiProformasCapped ? `${kpiProformasCount}+` : kpiProformasCount;

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Document Flow"
        description="Track the full document chain: Inquiry → Quotation → Order → Proforma Invoice. Orders load by page; link data refreshes on Refresh (up to 500 quotations / inquiries / proformas / trade cases for matching)."
        actions={
          <>
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-text-secondary shadow-sm hover:bg-surface-subtle disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={flowRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 py-2.5 text-sm font-semibold text-text-secondary shadow-sm hover:bg-surface-subtle disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </>
        }
      />

      {error && <div className={listPageErrorClass}>{error}</div>}

      <div className={listPageKpiGridClass}>
        <Link
          to={`${PREFIX}/inquiries`}
          className={cn(listPageKpiCardClass, "transition hover:border-brand-primary/30 hover:shadow")}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-brand-primary/10 p-2">
              <ClipboardList className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <p className={listPageKpiLabelClass}>Inquiries</p>
              <p className="text-2xl font-bold text-text-primary">{kpiInqDisplay}</p>
            </div>
          </div>
        </Link>
        <Link
          to={`${PREFIX}/quotations`}
          className={cn(listPageKpiCardClass, "transition hover:border-brand-primary/30 hover:shadow")}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-status-info-subtle p-2">
              <FileText className="h-5 w-5 text-status-info" />
            </div>
            <div>
              <p className={listPageKpiLabelClass}>Quotations</p>
              <p className="text-2xl font-bold text-text-primary">{kpiQuotDisplay}</p>
            </div>
          </div>
        </Link>
        <Link
          to={`${PREFIX}/orders`}
          className={cn(listPageKpiCardClass, "transition hover:border-brand-primary/30 hover:shadow")}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-status-warning-subtle p-2">
              <ShoppingCart className="h-5 w-5 text-status-warning-foreground" />
            </div>
            <div>
              <p className={listPageKpiLabelClass}>Orders</p>
              <p className="text-2xl font-bold text-text-primary">{kpiOrdersDisplay}</p>
            </div>
          </div>
        </Link>
        <Link
          to={`${PREFIX}/commercial/proforma-invoices`}
          className={cn(listPageKpiCardClass, "transition hover:border-brand-primary/30 hover:shadow")}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-status-success-subtle p-2">
              <Receipt className="h-5 w-5 text-status-success" />
            </div>
            <div>
              <p className={listPageKpiLabelClass}>Proforma Invoices</p>
              <p className="text-2xl font-bold text-text-primary">{kpiProfDisplay}</p>
              {kpiProformasCapped ? (
                <p className="mt-0.5 text-[10px] text-text-muted">Linked list capped at {PROFORMA_LIMIT}</p>
              ) : null}
            </div>
          </div>
        </Link>
      </div>

      <div className={listPageFilterBarClass}>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search order code or style…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={cn(listPageToolbarInputClass, "pl-9")}
          />
        </div>
        <select
          value={filterOrderStatus}
          onChange={(e) => {
            setFilterOrderStatus(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
        >
          <option value="">All statuses</option>
          {ORDER_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filterCreatedFrom}
          onChange={(e) => {
            setFilterCreatedFrom(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
          title="Created from (order record)"
        />
        <input
          type="date"
          value={filterCreatedTo}
          onChange={(e) => {
            setFilterCreatedTo(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
          title="Created to (order record)"
        />
        <button type="button" onClick={clearFilters} className={listPageToolbarButtonClass}>
          Clear filters
        </button>
      </div>

      <div className={cn(listPageTableCardClass, "min-w-0")}>
        {ordersLoading ? (
          <div className={listPageLoadingClass}>Loading document flow…</div>
        ) : flowRows.length === 0 ? (
          <div className={cn(listPageEmptyClass, "space-y-3")}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-subtle">
              <ArrowRight className="h-8 w-8 text-text-muted" />
            </div>
            <p className="font-medium text-text-secondary">No orders match the current filters</p>
            <p className="text-sm text-text-muted">
              Add orders from Quotations or create orders directly. Document flow shows the chain Inquiry → Quotation → Order → Proforma.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <ResponsiveTableContainer
              maxHeightClass="max-h-[52vh] sm:max-h-[62vh] lg:max-h-[70vh]"
              className="min-w-0"
            >
              <table className={cn(listTableBaseClass, "min-w-[1100px]")}>
                <thead className={listTableTheadClass}>
                  <tr>
                    <th className={listTableThClass}>Flow</th>
                    <th className={listTableThClass}>Order</th>
                    <th className={listTableThClass}>Customer</th>
                    <th className={listTableThClass}>Inquiry</th>
                    <th className={listTableThClass}>Quotation</th>
                    <th className={listTableThClass}>Status</th>
                    <th className={listTableThClass}>Delivery</th>
                    <th className={listTableThClass}>Proforma</th>
                    <th className={listTableThClass}>Trade Case</th>
                    <th className={listTableThClass}>Docs / Shipments</th>
                    <th className={cn(listTableThRightClass, "w-28 whitespace-nowrap")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flowRows.map((row) => {
                    const tc = tradeCaseByOrderId.get(row.order.id);
                    const firstPi = row.proformas[0];
                    const qid = quotationLinkId(row.order);
                    const qcode = quotationLinkCode(row);
                    return (
                      <tr key={row.order.id} className={listTableTrClass}>
                        <td className={cn(listTableTdClass, "max-w-[14rem]")}>
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
                            {qid != null && qcode ? (
                              <Link
                                to={`${PREFIX}/quotations/${qid}`}
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
                        <td className={listTableTdPrimaryClass}>
                          <Link
                            to={`${PREFIX}/orders/${row.order.id}`}
                            className="font-medium text-status-info hover:underline"
                          >
                            {row.order.order_code ?? `#${row.order.id}`}
                          </Link>
                          {row.order.style_ref && (
                            <span className="ml-1 block text-xs text-text-muted">{row.order.style_ref}</span>
                          )}
                        </td>
                        <td
                          className={cn(listTableTdClass, "max-w-[12rem] truncate")}
                          title={row.customerLabel}
                        >
                          {row.customerLabel}
                        </td>
                        <td className={listTableTdClass}>
                          {row.inquiry ? (
                            <Link
                              to={`${PREFIX}/inquiries/${row.inquiry.id}`}
                              className="text-status-info hover:underline"
                            >
                              {row.inquiry.inquiry_code}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={listTableTdClass}>
                          {qid != null && qcode ? (
                            <Link
                              to={`${PREFIX}/quotations/${qid}`}
                              className="text-status-info hover:underline"
                            >
                              {qcode}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={listTableTdClass}>
                          <span className="inline-flex rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                            {row.order.status}
                          </span>
                        </td>
                        <td className={listTableTdClass}>{formatDate(row.order.delivery_date)}</td>
                        <td className={listTableTdClass}>
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
                        <td className={listTableTdClass}>
                          {tc ? (
                            <div className="flex flex-wrap gap-1">
                              <Link
                                to={`${PREFIX}/trade/cases/${tc.id}`}
                                className="inline-flex rounded border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/15"
                              >
                                {tc.reference}
                              </Link>
                              <Link
                                to={`${PREFIX}/logistics?trade_case_id=${tc.id}`}
                                className="text-xs text-text-muted hover:underline"
                              >
                                Logistics
                              </Link>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={cn(listTableTdClass, "text-xs")}>
                          {!tc ? (
                            "—"
                          ) : (
                            <div className="flex flex-col gap-1">
                              <Link
                                to={`${PREFIX}/trade/cases/${tc.id}#trade-case-documents`}
                                className="text-status-info hover:underline"
                              >
                                {(tradeDocCounts[tc.id] ?? 0)} doc{(tradeDocCounts[tc.id] ?? 0) === 1 ? "" : "s"}
                              </Link>
                              <Link
                                to={`${PREFIX}/logistics?trade_case_id=${tc.id}`}
                                className="text-text-muted hover:underline"
                              >
                                {(tradeShipCounts[tc.id] ?? 0)} shipment{(tradeShipCounts[tc.id] ?? 0) === 1 ? "" : "s"}
                              </Link>
                            </div>
                          )}
                        </td>
                        <td className={cn(listTableTdClass, "text-right whitespace-nowrap")}>
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenActionsOrderId((prev) => (prev === row.order.id ? null : row.order.id))
                              }
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Actions
                            </button>
                            {openActionsOrderId === row.order.id && (
                              <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                                <Link
                                  to={`${PREFIX}/orders/${row.order.id}`}
                                  onClick={() => setOpenActionsOrderId(null)}
                                  className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  View order
                                </Link>
                                {row.inquiry ? (
                                  <Link
                                    to={`${PREFIX}/inquiries/${row.inquiry.id}`}
                                    onClick={() => setOpenActionsOrderId(null)}
                                    className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    View inquiry
                                  </Link>
                                ) : null}
                                {qid != null ? (
                                  <Link
                                    to={`${PREFIX}/quotations/${qid}`}
                                    onClick={() => setOpenActionsOrderId(null)}
                                    className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    View quotation
                                  </Link>
                                ) : null}
                                {firstPi ? (
                                  <Link
                                    to={`${PREFIX}/commercial/proforma-invoices/${firstPi.id}/edit`}
                                    onClick={() => setOpenActionsOrderId(null)}
                                    className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    Open proforma
                                  </Link>
                                ) : null}
                                {tc ? (
                                  <Link
                                    to={`${PREFIX}/trade/cases/${tc.id}`}
                                    onClick={() => setOpenActionsOrderId(null)}
                                    className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    Trade case
                                  </Link>
                                ) : null}
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
            <DataTablePagination
              page={page}
              pageSize={pageSize}
              total={listTotal}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              allowedSizes={allowedSizes}
            />
          </>
        )}
      </div>
    </div>
  );
}
