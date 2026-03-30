import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type QuotationResponse } from "@/api/client";
import { useListPagination } from "@/hooks/useListPagination";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import { QuotationStatusBadge } from "./quotations/QuotationStatusBadge";
import { QuotationListSkeleton } from "./quotations/QuotationListSkeleton";
import {
  canConvertQuotationToOrder,
  getQuotationWorkflowAction,
  humanizeStatus,
  QUOTATION_STATUS_FILTER_OPTIONS,
} from "@/features/merch/workflow";
import { SecureImage } from "@/components/SecureImage";
import { formatMoney, toSafeNumber } from "@/features/quotations/workspace/mappers/quotationNumeric";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageChipActiveClass,
  listPageChipInactiveClass,
  listPageChipRowClass,
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageKpiCardClass,
  listPageKpiGridClass3,
  listPageKpiLabelClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThCenterClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";

export function QuotationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuotationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { page, setPage, pageSize, setPageSize } = useListPagination();
  const [listTotal, setListTotal] = useState(0);
  const [quickFilter, setQuickFilter] = useState<"all" | "has_inquiry" | "has_style_image" | "ready_to_convert">("all");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listQuotationsPaginated({
        search: search || undefined,
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
        ai_indicators: 1,
        benchmark_hint: 1,
      });
      setItems(res.items);
      setListTotal(res.total);
      if (res.page !== page) setPage(res.page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (quickFilter === "has_inquiry") return items.filter((q) => q.inquiry_id != null);
    if (quickFilter === "has_style_image") return items.filter((q) => Boolean(q.style_image_url));
    if (quickFilter === "ready_to_convert") {
      return items.filter((q) => canConvertQuotationToOrder(q.status) && !q.is_converted_to_order);
    }
    return items;
  }, [items, quickFilter]);

  const displayCustomerName = (q: QuotationResponse) =>
    q.customer_name?.trim() ? q.customer_name : `#${q.customer_id}`;

  const displayInquiryCode = (q: QuotationResponse) =>
    q.inquiry_id == null ? "—" : q.inquiry_code?.trim() ? q.inquiry_code : `#${q.inquiry_id}`;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page, pageSize]);

  const openCreate = () => {
    navigate("/app/quotations/new");
  };

  const approvedCount = filteredItems.filter((q) => q.status === "APPROVED").length;
  const pendingCount = filteredItems.filter((q) => ["DRAFT", "NEW", "SUBMITTED"].includes(q.status)).length;

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Quotations"
        description="Costing & commercial · Track quotations from inquiry through approval; list rows include server AI indicators and benchmark hints where enabled."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            New quotation
          </button>
        }
      />
      <div className={listPageFilterBarClass}>
        <input
          type="text"
          placeholder="Search by code…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarInputClass}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
        >
          <option value="">All statuses</option>
          {QUOTATION_STATUS_FILTER_OPTIONS.map((statusValue) => (
            <option key={statusValue} value={statusValue}>
              {humanizeStatus(statusValue)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setStatusFilter("");
            setQuickFilter("all");
            setPage(1);
          }}
          className={listPageToolbarButtonClass}
        >
          Clear filters
        </button>
        <button
          type="button"
          onClick={load}
          className={listPageToolbarButtonClass}
        >
          Refresh
        </button>
      </div>

      <div className={listPageChipRowClass}>
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
            className={quickFilter === chip.key ? listPageChipActiveClass : listPageChipInactiveClass}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className={listPageKpiGridClass3}>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Total on page</div>
          <div className="mt-2 text-xl font-bold text-text-primary">{filteredItems.length}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Approved</div>
          <div className="mt-2 text-xl font-bold text-status-success-foreground">{approvedCount}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Needs action</div>
          <div className="mt-2 text-xl font-bold text-status-warning-foreground">{pendingCount}</div>
        </div>
      </div>

      {error && (
        <div className={listPageErrorClass}>
          {error}
        </div>
      )}

      <div className={listPageTableCardClass}>
        {loading ? (
          <QuotationListSkeleton />
        ) : filteredItems.length === 0 ? (
          <div className={cn(listPageEmptyClass, "space-y-3")}>
            <div>No quotations found for current filters.</div>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground"
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
                className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          <>
          <ResponsiveTableContainer>
          <table className={cn(listTableBaseClass, "min-w-[1120px]")}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Code</th>
                <th className={cn(listTableThClass, "min-w-[120px]")}>Customer</th>
                <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Inquiry</th>
                <th className={cn(listTableThClass, "min-w-[140px]")}>Style</th>
                <th className={cn(listTableThClass, "min-w-[100px] whitespace-nowrap")}>Intermediary</th>
                <th className={cn(listTableThClass, "w-20 whitespace-nowrap")}>Shipping</th>
                <th className={cn(listTableThClass, "min-w-[120px] whitespace-nowrap")}>Commission</th>
                <th className={cn(listTableThRightClass, "w-20 whitespace-nowrap")}>Qty</th>
                <th className={cn(listTableThRightClass, "min-w-[90px] whitespace-nowrap")}>Offer total</th>
                <th className={cn(listTableThRightClass, "w-28 whitespace-nowrap")}>vs inquiry target</th>
                <th className={cn(listTableThClass, "min-w-[140px] whitespace-nowrap")}>Status</th>
                <th className={cn(listTableThCenterClass, "min-w-[5.5rem] whitespace-nowrap")}>C-ready</th>
                <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Created</th>
                <th className={cn(listTableThRightClass, "w-24 whitespace-nowrap")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((q) => {
                const qty = q.projected_quantity ?? null;
                const target = q.target_price ? Number(q.target_price) : null;
                const quoted = q.total_amount ? Number(q.total_amount) : null;
                let profitPct: string | null = null;
                const workflowAction = getQuotationWorkflowAction(q.status);
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
                  <tr key={q.id} className={listTableTrClass}>
                    <td className={cn(listTableTdPrimaryClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={q.quotation_code}>
                      <Link
                        to={`/app/quotations/${q.id}`}
                        className="text-status-info hover:underline"
                      >
                        {q.quotation_code}
                      </Link>
                    </td>
                    <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={displayCustomerName(q)}>
                      {displayCustomerName(q)}
                    </td>
                    <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={displayInquiryCode(q)}>
                      {displayInquiryCode(q)}
                    </td>
                    <td className={listTableTdClass}>
                      <div className="flex items-center gap-2 min-w-0">
                        {q.style_image_url ? (
                          <SecureImage
                            url={q.style_image_url}
                            alt={q.style_name ?? q.style_ref ?? "Style"}
                            className="h-9 w-9 shrink-0 rounded object-cover border border-border"
                          />
                        ) : (
                          <div className="h-9 w-9 shrink-0 rounded bg-surface-subtle border border-border" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className="font-medium text-text-primary truncate text-sm"
                            title={q.style_name ?? q.style_ref ?? undefined}
                          >
                            {q.style_name ?? q.style_ref ?? "—"}
                          </div>
                          <div
                            className="text-xs text-text-muted whitespace-nowrap truncate"
                            title={
                              q.style_ref && q.style_name && q.style_ref !== q.style_name ? q.style_ref : undefined
                            }
                          >
                            {q.style_ref && q.style_name && q.style_ref !== q.style_name ? q.style_ref : "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={q.intermediary_name ?? undefined}>
                      {q.intermediary_name ?? "—"}
                    </td>
                    <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={q.shipping_term ?? undefined}>
                      {q.shipping_term ?? "—"}
                    </td>
                    <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={q.commission_mode || q.commission_type || q.commission_value ? `${q.commission_mode ?? "-"} / ${q.commission_type ?? "-"} / ${q.commission_value ?? "-"}` : undefined}>
                      {q.commission_mode || q.commission_type || q.commission_value
                        ? `${q.commission_mode ?? "-"} / ${q.commission_type ?? "-"} / ${q.commission_value ?? "-"}`
                        : "—"}
                    </td>
                    <td className={cn(listTableTdClass, "text-right whitespace-nowrap")}>
                      {qty != null ? qty.toLocaleString() : "—"}
                    </td>
                    <td className={cn(listTableTdClass, "text-right whitespace-nowrap overflow-hidden text-ellipsis")} title={`${formatMoney(toSafeNumber(q.total_amount))} ${q.currency ?? ""}`.trim()}>
                      {formatMoney(toSafeNumber(q.total_amount))} {q.currency ?? ""}
                    </td>
                    <td className={cn(listTableTdClass, "text-right whitespace-nowrap overflow-hidden text-ellipsis")} title={profitPct ?? undefined}>
                      {profitPct ?? "—"}
                    </td>
                    <td className={cn(listTableTdClass, "overflow-hidden text-ellipsis")} title={[q.status, q.is_converted_to_order ? "Converted to order" : null].filter(Boolean).join(" · ")}>
                      <div className="flex items-center gap-1.5 flex-wrap whitespace-nowrap min-w-0">
                        <QuotationStatusBadge status={q.status} />
                        {q.is_converted_to_order && (
                          <span className="inline-flex rounded-full bg-status-info-subtle px-2 py-0.5 text-xs font-medium text-status-info-foreground">
                            Converted to order
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={cn(listTableTdClass, "text-center text-xs whitespace-nowrap")}>
                      {q.ai_indicators ? (() => {
                        const ai = q.ai_indicators;
                        const titleParts = [
                          ai.flags.length ? `Flags: ${ai.flags.join(", ")}` : "",
                          ai.cost_completeness_score != null ? `Cost completeness: ${ai.cost_completeness_score}%` : "",
                          ai.costing_phase1_enabled === false ? "Costing Phase 1 disabled" : "",
                          ai.signal_scope === "header_only" ? "Indicators use header only (open detail for lines)" : "",
                          ai.limited_confidence || ai.confidence_basis === "partial" ? "Limited / partial confidence" : "",
                          ai.urgent_costing_review ? "Urgent costing review" : "",
                          ai.fx_sensitivity ? "FX sensitivity" : "",
                          ai.anomaly_severity && ai.anomaly_severity !== "none"
                            ? `Anomaly: ${ai.anomaly_severity}`
                            : "",
                          ai.cost_benchmark_enabled && ai.cost_benchmark_label
                            ? `Benchmark: ${ai.cost_benchmark_label}`
                            : "",
                        ].filter(Boolean);
                        const warn =
                          ai.urgent_costing_review ||
                          ai.flags.length > 0 ||
                          ai.limited_confidence ||
                          ai.confidence_basis === "partial" ||
                          (ai.anomaly_severity != null && ai.anomaly_severity !== "none");
                        return (
                          <span title={titleParts.length ? titleParts.join(" · ") : "Costing readiness"}>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                ai.costing_readiness_score >= 80
                                  ? "bg-status-success-subtle text-status-success-foreground"
                                  : ai.costing_readiness_score >= 50
                                    ? "bg-status-warning-subtle text-status-warning-foreground"
                                    : "bg-status-danger-subtle text-status-danger-foreground"
                              }`}
                            >
                              {ai.costing_readiness_score}%
                            </span>
                            {ai.cost_completeness_score != null ? (
                              <span className="text-text-muted"> · C:{ai.cost_completeness_score}%</span>
                            ) : null}
                            {warn ? <span className="ml-0.5 text-status-warning-foreground">!</span> : null}
                          </span>
                        );
                      })() : (
                        "—"
                      )}
                    </td>
                    <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={new Date(q.created_at).toLocaleDateString()}>
                      {new Date(q.created_at).toLocaleDateString()}
                    </td>
                    <td className={cn(listTableTdClass, "text-right whitespace-nowrap")}>
                      <div className="relative inline-block text-left">
                        <button
                          type="button"
                          onClick={() => setOpenActionsId((prev) => (prev === q.id ? null : q.id))}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === q.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <Link
                              to={`/app/quotations/${q.id}`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              View
                            </Link>
                            <Link
                              to={`/app/quotations/${q.id}/print`}
                              onClick={() => setOpenActionsId(null)}
                              className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Print
                            </Link>
                            {workflowAction && (
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenActionsId(null);
                                  try {
                                    setError("");
                                    if (workflowAction.action === "submit") {
                                      await api.submitQuotation(q.id);
                                    } else if (workflowAction.action === "approve") {
                                      await api.approveQuotation(q.id);
                                    } else {
                                      await api.sendQuotation(q.id);
                                    }
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Workflow action failed");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                {workflowAction.label}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenActionsId(null);
                                try {
                                  setError("");
                                  const duplicated = await api.reviseQuotation(q.id);
                                  navigate(`/app/quotations/${duplicated.id}`);
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "Duplicate version failed");
                                }
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setOpenActionsId(null);
                                if (!window.confirm("Delete this quotation?")) return;
                                try {
                                  setError("");
                                  await api.deleteQuotation(q.id);
                                  await load();
                                } catch (e) {
                                  setError(e instanceof Error ? e.message : "Delete failed");
                                }
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Delete
                            </button>
                            {q.is_converted_to_order ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Already converted
                              </div>
                            ) : !canConvertQuotationToOrder(q.status) ? (
                              <div className="block rounded-md px-2 py-1.5 text-left text-xs text-text-muted">
                                Send first
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  setOpenActionsId(null);
                                  try {
                                    setError("");
                                    const order = await api.convertQuotationToOrder(q.id);
                                    alert(`Order ${order.order_code} created from quotation.`);
                                    await load();
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Conversion failed");
                                  }
                                }}
                                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Convert to order
                              </button>
                            )}
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
          />
          </>
        )}
      </div>
    </div>
  );
}

