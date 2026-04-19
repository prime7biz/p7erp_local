import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type OrderCreate,
  type CustomerResponse,
  type QuotationResponse,
  type PlanningGroundingSummaryRow,
  type OrderFinancialStatusOut,
  type OrderSewingLineSummaryOut,
} from "@/api/client";
import { useListPagination } from "@/hooks/useListPagination";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";
import { getOrderStatusChoices } from "@/features/merch/workflow";
import { SecureImage } from "@/components/SecureImage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { OrderPipelineListCell } from "@/components/app/OrderMilestoneTracker";
import {
  listPageChipActiveClass,
  listPageChipInactiveClass,
  listPageChipRowClass,
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
  listTableThCenterClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function financialStatusTooltip(f: OrderFinancialStatusOut): string {
  const docKind = f.master_contract_type === "SALES_CONTRACT" ? "sales contract" : "export LC";
  return [
    f.pi_issued ? "Proforma invoice issued to customer." : "No qualifying proforma invoice yet.",
    f.buyer_document_received
      ? `Buyer ${docKind} is received (master contract active).`
      : "Buyer LC / sales contract not yet received.",
    f.bank_facility_linked
      ? "A bank facility is linked to this export master contract."
      : "No bank facility linked to the master contract.",
    f.btb_utilization_pct != null
      ? `BTB LCs: ${f.btb_lc_opened_count ?? 0} opened of ${f.btb_lc_count ?? 0} total; ${f.btb_utilization_pct.toFixed(1)}% of master contract amount.`
      : "No BTB utilization percentage (set master contract amount and BTB LCs).",
    f.in_production ? "Production has started." : "Production not started.",
    f.shipped ? "Shipped." : "Not shipped yet.",
  ].join(" ");
}

function OrderFinancialStatusCell({ f }: { f: OrderFinancialStatusOut | null | undefined }) {
  if (!f) return <span className="text-text-muted text-xs">—</span>;
  const docLabel = f.master_contract_type === "SALES_CONTRACT" ? "SC" : "LC";
  const chips: { k: string; label: string; ok: boolean }[] = [
    { k: "pi", label: "PI", ok: !!f.pi_issued },
    { k: "doc", label: docLabel, ok: !!f.buyer_document_received },
    { k: "bank", label: "Bank", ok: !!f.bank_facility_linked },
    {
      k: "btb",
      label: f.btb_utilization_pct != null ? `BTB ${f.btb_utilization_pct.toFixed(0)}%` : "BTB",
      ok: (f.btb_lc_count ?? 0) > 0 || f.btb_utilization_pct != null,
    },
    { k: "prod", label: "Prod", ok: !!f.in_production },
    { k: "ship", label: "Ship", ok: !!f.shipped },
  ];
  return (
    <div
      className="flex flex-wrap gap-0.5 max-w-[200px]"
      title={financialStatusTooltip(f)}
    >
      {chips.map((c) => (
        <span
          key={c.k}
          className={cn(
            "rounded px-1 py-0.5 text-[10px] font-semibold",
            c.ok ? "bg-status-success-subtle text-status-success-foreground" : "bg-surface-subtle text-text-muted",
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function OrderSewingLineCell({ s }: { s: OrderSewingLineSummaryOut | null | undefined }) {
  if (!s || (!s.primary_line_code && (s.allocations?.length ?? 0) === 0)) {
    return <span className="text-text-muted text-xs">—</span>;
  }
  const track =
    s.delivery_on_track === "yes"
      ? { text: "On track", cls: "text-status-success-foreground" }
      : s.delivery_on_track === "no"
        ? { text: "At risk", cls: "text-status-danger-foreground" }
        : { text: "—", cls: "text-text-muted" };
  const line = s.primary_line_code ?? s.allocations?.[0]?.line_code ?? "—";
  const extra = (s.extra_allocation_count ?? 0) > 0 ? ` +${s.extra_allocation_count}` : "";
  const tipLines =
    s.allocations?.map(
      (a) =>
        `${a.line_code} · ${a.reservation_status} · start ${fmtShortDate(a.start_date)} · end ${fmtShortDate(a.planned_end_date ?? a.actual_end_date)} · booked ${fmtShortDate(a.booked_at)}`,
    ) ?? [];
  const title = [
    ...tipLines,
    `Delivery vs plan: ${s.delivery_on_track === "yes" ? "on time" : s.delivery_on_track === "no" ? "behind schedule" : "unknown"}`,
  ].join("\n");

  return (
    <div className="max-w-[220px] text-xs leading-snug" title={title}>
      <div className="font-medium text-text-primary truncate">
        {line}
        {extra}
      </div>
      <div className="text-text-muted">
        Book {fmtShortDate(s.primary_booked_at)} · End {fmtShortDate(s.primary_planned_end_date)}
      </div>
      <div className={cn("font-semibold", track.cls)}>{track.text}</div>
    </div>
  );
}

export function OrdersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "linked_quotation" | "draft" | "active">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OrderResponse | null>(null);
  const [form, setForm] = useState<OrderCreate>({ customer_id: 0 });
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [quotations, setQuotations] = useState<QuotationResponse[]>([]);
  const { page, setPage, pageSize, setPageSize } = useListPagination();
  const [listTotal, setListTotal] = useState(0);
  const [groundingByOrderId, setGroundingByOrderId] = useState<Record<number, PlanningGroundingSummaryRow>>({});

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listOrdersPaginated({
        search: search || undefined,
        status: statusFilter || undefined,
        ai_indicators: 1,
        page,
        page_size: pageSize,
      });
      setItems(res.items);
      setListTotal(res.total);
      if (res.page !== page) setPage(res.page);
      let gmap: Record<number, PlanningGroundingSummaryRow> = {};
      if (res.items.length) {
        try {
          const summary = await api.getOrdersPlanningGroundingSummary(res.items.map((x) => x.id));
          gmap = Object.fromEntries(summary.map((s) => [s.order_id, s]));
        } catch {
          gmap = {};
        }
      }
      setGroundingByOrderId(gmap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (quickFilter === "linked_quotation") return items.filter((row) => row.quotation_id != null);
    if (quickFilter === "draft") return items.filter((row) => row.status === "DRAFT");
    if (quickFilter === "active")
      return items.filter((row) => ["NEW", "CONFIRMED", "IN_PROGRESS"].includes(row.status));
    return items;
  }, [items, quickFilter]);

  const displayCustomerName = (o: OrderResponse) =>
    o.customer_name?.trim() ? o.customer_name : `#${o.customer_id}`;

  const displayQuotationCode = (o: OrderResponse) =>
    o.quotation_id == null ? "—" : o.quotation_code?.trim() ? o.quotation_code : `#${o.quotation_id}`;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page, pageSize]);

  useEffect(() => {
    if (!modalOpen || !editing) return;
    let cancelled = false;
    (async () => {
      try {
        const [custRes, quotRes] = await Promise.all([
          api.listCustomersPaginated({ page: 1, page_size: 500 }),
          api.listQuotationsPaginated({ page: 1, page_size: 200 }),
        ]);
        if (!cancelled) {
          setCustomers(custRes.items);
          setQuotations(quotRes.items);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, editing]);

  const openCreate = () => {
    navigate("/app/orders/new");
  };

  const groundingPillClass = (overall: string) => {
    const o = (overall || "").toLowerCase();
    if (o === "ready") return "bg-status-success-subtle text-status-success-foreground";
    if (o === "at_risk") return "bg-status-warning-subtle text-status-warning-foreground";
    if (o === "blocked") return "bg-status-danger-subtle text-status-danger-foreground";
    return "bg-surface-subtle text-text-muted";
  };

  const statusClass = (statusValue: string) => {
    const value = statusValue.toUpperCase();
    if (value === "COMPLETED") return "bg-status-success-subtle text-status-success-foreground";
    if (value === "IN_PROGRESS") return "bg-status-info-subtle text-status-info-foreground";
    if (value === "CONFIRMED") return "bg-status-success-subtle/80 text-status-success-foreground";
    if (value === "NEW") return "bg-brand-primary/10 text-brand-primary";
    return "bg-status-neutral-subtle text-status-neutral-foreground";
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm({ customer_id: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customer_id) {
      setError("Customer ID is required");
      return;
    }
    setError("");
    try {
      if (!editing) return;
      await api.updateOrder(editing.id, form);
      closeModal();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  };

  const draftCount = filteredItems.filter((row) => row.status === "DRAFT").length;
  const activeCount = filteredItems.filter((row) =>
    ["NEW", "CONFIRMED", "IN_PROGRESS"].includes(row.status),
  ).length;
  const completedCount = filteredItems.filter((row) => row.status === "COMPLETED").length;

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Orders"
        description="Execution hub · Sales orders with quotation linkage, planning grounding hints, and commercial controls. Open a row for change requests and alignment cards."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            New order
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
          <option value="DRAFT">Draft</option>
          <option value="NEW">New</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
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
          { key: "linked_quotation", label: "Linked quotation" },
          { key: "draft", label: "Draft only" },
          { key: "active", label: "Active" },
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

      <div className={listPageKpiGridClass}>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Total on page</div>
          <div className="mt-2 text-xl font-bold text-text-primary">{filteredItems.length}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Draft</div>
          <div className="mt-2 text-xl font-bold text-status-neutral-foreground">{draftCount}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Active</div>
          <div className="mt-2 text-xl font-bold text-status-info-foreground">{activeCount}</div>
        </div>
        <div className={listPageKpiCardClass}>
          <div className={listPageKpiLabelClass}>Completed</div>
          <div className="mt-2 text-xl font-bold text-status-success-foreground">{completedCount}</div>
        </div>
      </div>

      {error && (
        <div className={listPageErrorClass}>
          {error}
        </div>
      )}

      <div className={listPageTableCardClass}>
        {loading ? (
          <div className={listPageLoadingClass}>Loading orders…</div>
        ) : filteredItems.length === 0 ? (
          <div className={listPageEmptyClass}>No orders yet.</div>
        ) : (
          <>
          <ResponsiveTableContainer>
          <table className={cn(listTableBaseClass, "min-w-[1480px]")}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Code</th>
                <th className={cn(listTableThClass, "min-w-[120px]")}>Customer</th>
                <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Quotation</th>
                <th className={cn(listTableThClass, "min-w-[140px]")}>Style</th>
                <th className={cn(listTableThClass, "w-28 whitespace-nowrap")}>Delivery date</th>
                <th className={cn(listTableThRightClass, "w-20 whitespace-nowrap")}>Qty</th>
                <th
                  className={cn(listTableThClass, "w-[100px] whitespace-nowrap")}
                  title="Execution readiness / completeness (AI)"
                >
                  Exec AI
                </th>
                <th
                  className={cn(listTableThClass, "w-[88px] whitespace-nowrap")}
                  title="Deterministic planning grounding"
                >
                  Grounding
                </th>
                <th
                  className={cn(listTableThCenterClass, "w-14 whitespace-nowrap")}
                  title="Pending commercial change requests"
                >
                  CR
                </th>
                <th
                  className={cn(listTableThClass, "w-[200px] whitespace-nowrap")}
                  title="PI, LC, bank facility, BTB, production, shipment"
                >
                  Financial
                </th>
                <th
                  className={cn(listTableThClass, "w-[220px] whitespace-nowrap")}
                  title="Sewing line booking and delivery vs plan"
                >
                  Sewing line
                </th>
                <th className={cn(listTableThClass, "w-[220px] whitespace-nowrap")} title="Auto pipeline milestone">
                  Pipeline
                </th>
                <th className={cn(listTableThClass, "w-24 whitespace-nowrap")}>Status</th>
                <th className={cn(listTableThRightClass, "w-24 whitespace-nowrap")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((o) => {
                const styleName = o.style_name ?? null;
                const styleRef = o.style_ref ?? null;
                const styleImageForRow = o.style_image_url ?? null;
                const g = groundingByOrderId[o.id];

                return (
                <tr key={o.id} className={listTableTrClass}>
                  <td className={cn(listTableTdPrimaryClass, "whitespace-nowrap")}>
                    <Link
                      to={`/app/orders/${o.id}`}
                      className="text-status-info hover:underline"
                    >
                      {o.order_code}
                    </Link>
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={displayCustomerName(o)}>
                    {displayCustomerName(o)}
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={displayQuotationCode(o)}>
                    {displayQuotationCode(o)}
                  </td>
                  <td className={listTableTdClass}>
                    <div className="flex items-center gap-2 min-w-0">
                      {styleImageForRow ? (
                        <SecureImage
                          url={styleImageForRow}
                          alt={styleName ?? styleRef ?? "Style"}
                          className="h-9 w-9 shrink-0 rounded object-cover border border-border"
                        />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded bg-surface-subtle border border-border" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-text-primary" title={styleName ?? styleRef ?? undefined}>
                          {styleName ?? styleRef ?? "—"}
                        </div>
                        {styleName && styleRef && styleName !== styleRef && (
                          <div className="text-xs text-text-muted truncate whitespace-nowrap" title={styleRef}>
                            {styleRef}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap overflow-hidden text-ellipsis")} title={o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : undefined}>
                    {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString() : "—"}
                  </td>
                  <td className={cn(listTableTdClass, "text-right whitespace-nowrap")}>
                    {o.quantity != null ? o.quantity.toLocaleString() : "—"}
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap text-xs")}>
                    {o.ai_indicators ? (() => {
                      const ai = o.ai_indicators;
                      const warn =
                        ai.urgent_planning_flag ||
                        ai.duplicate_risk_score >= 40 ||
                        ai.capacity_bottleneck_flag ||
                        ai.missing_dependency_count > 0;
                      const titleParts = [
                        ai.flags?.length ? `Flags: ${ai.flags.join(", ")}` : "",
                        `Material ${ai.material_readiness_score}% · Promise risk ${ai.promise_date_risk_score}%`,
                        ai.missing_dependency_count > 0 ? `Missing deps: ${ai.missing_dependency_count}` : "",
                        ai.urgent_planning_flag ? "Urgent planning" : "",
                        ai.duplicate_risk_score >= 40 ? "Duplicate risk" : "",
                        ai.capacity_bottleneck_flag ? "Line load hint" : "",
                        ai.promise_sensitivity_score != null ? `Promise sensitivity: ${ai.promise_sensitivity_score}` : "",
                      ].filter(Boolean);
                      return (
                        <span title={titleParts.length ? titleParts.join(" · ") : "Execution readiness"}>
                          E {ai.execution_readiness_score}% · C {ai.completeness_score}%
                          {warn ? <span className="ml-0.5 text-status-warning-foreground">!</span> : null}
                        </span>
                      );
                    })() : (
                      "—"
                    )}
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap text-xs")}>
                    {g ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${groundingPillClass(g.overall_readiness)}`}
                        title={g.overall_readiness}
                      >
                        {g.overall_readiness.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className={cn(listTableTdClass, "text-center text-xs whitespace-nowrap")}>
                    {g && g.pending_change_requests > 0 ? (
                      <span
                        className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-status-warning-subtle px-1.5 py-0.5 text-[10px] font-bold text-status-warning-foreground"
                        title="Pending commercial change requests"
                      >
                        {g.pending_change_requests}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap align-top")}>
                    <OrderFinancialStatusCell f={o.financial_status} />
                  </td>
                  <td className={cn(listTableTdClass, "align-top")}>
                    <OrderSewingLineCell s={o.sewing_line_summary} />
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap align-top")}>
                    <OrderPipelineListCell pipelineStatus={o.pipeline_status} rmPct={o.rm_inhouse_pct} />
                  </td>
                  <td className={cn(listTableTdClass, "whitespace-nowrap")}>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className={cn(listTableTdClass, "text-right whitespace-nowrap")}>
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((prev) => (prev === o.id ? null : o.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Actions
                      </button>
                      {openActionsId === o.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                          <Link
                            to={`/app/orders/${o.id}`}
                            onClick={() => setOpenActionsId(null)}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            View
                          </Link>
                          <Link
                            to={`/app/orders/${o.id}/print`}
                            onClick={() => setOpenActionsId(null)}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Print
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              setEditing(o);
                              setForm({
                                customer_id: o.customer_id,
                                quotation_id: o.quotation_id ?? undefined,
                                style_id: o.style_id ?? undefined,
                                style_ref: o.style_ref ?? undefined,
                                customer_intermediary_id: o.customer_intermediary_id ?? undefined,
                                shipping_term: o.shipping_term ?? undefined,
                                commission_mode: o.commission_mode ?? undefined,
                                commission_type: o.commission_type ?? undefined,
                                commission_value: o.commission_value ?? undefined,
                                order_date: o.order_date ?? undefined,
                                delivery_date: o.delivery_date ?? undefined,
                                quantity: o.quantity ?? undefined,
                                status: o.status ?? undefined,
                                remarks: o.remarks ?? undefined,
                              });
                              setModalOpen(true);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setOpenActionsId(null);
                              if (!window.confirm("Delete this order?")) return;
                              try {
                                setError("");
                                await api.deleteOrder(o.id);
                                await load();
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "Delete failed");
                              }
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

      {modalOpen && editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Edit order</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Customer
                </label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_id: Number(e.target.value) || 0 }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value={0}>Select customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Linked quotation (optional)
                </label>
                <select
                  value={form.quotation_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => {
                      const nextQuotationId = e.target.value ? Number(e.target.value) : undefined;
                      const quote = nextQuotationId
                        ? quotations.find((q) => q.id === nextQuotationId) ?? null
                        : null;
                      return {
                        ...f,
                        quotation_id: nextQuotationId,
                        style_id: quote?.style_id ?? f.style_id,
                        style_ref: quote?.style_ref ?? f.style_ref,
                        customer_intermediary_id:
                          quote?.customer_intermediary_id ?? f.customer_intermediary_id,
                        shipping_term: quote?.shipping_term ?? f.shipping_term,
                        commission_mode: quote?.commission_mode ?? f.commission_mode,
                        commission_type: quote?.commission_type ?? f.commission_type,
                        commission_value: quote?.commission_value ?? f.commission_value,
                      };
                    })
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value="">No linked quotation</option>
                  {quotations.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.quotation_code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Style ref
                </label>
                <input
                  type="text"
                  value={form.style_ref ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, style_ref: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Style ID
                  </label>
                  <input
                    type="number"
                    value={form.style_id ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        style_id: e.target.value ? Number(e.target.value) : undefined,
                      }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Shipping term
                  </label>
                  <select
                    value={form.shipping_term ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, shipping_term: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select shipping term</option>
                    {withLegacyOption(form.shipping_term, SHIPPING_TERM_OPTIONS).map((term) => (
                      <option key={term} value={term}>
                        {SHIPPING_TERM_OPTIONS.includes(term as (typeof SHIPPING_TERM_OPTIONS)[number])
                          ? term
                          : `${term} (legacy)`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Commission mode
                  </label>
                  <select
                    value={form.commission_mode ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_mode: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select mode</option>
                    {withLegacyOption(form.commission_mode, COMMISSION_MODE_OPTIONS).map((mode) => (
                      <option key={mode} value={mode}>
                        {COMMISSION_MODE_OPTIONS.includes(mode as (typeof COMMISSION_MODE_OPTIONS)[number])
                          ? mode
                          : `${mode} (legacy)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Commission type
                  </label>
                  <select
                    value={form.commission_type ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_type: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    {withLegacyOption(form.commission_type, COMMISSION_TYPE_OPTIONS).map((type) => (
                      <option key={type} value={type}>
                        {COMMISSION_TYPE_OPTIONS.includes(type as (typeof COMMISSION_TYPE_OPTIONS)[number])
                          ? type
                          : `${type} (legacy)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Commission value
                  </label>
                  <input
                    type="text"
                    value={form.commission_value ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, commission_value: e.target.value || undefined }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Delivery date
                </label>
                <input
                  type="date"
                  value={form.delivery_date ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, delivery_date: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Quantity (pcs)
                </label>
                <input
                  type="number"
                  value={form.quantity ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Status
                </label>
                <select
                  value={form.status ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value || undefined }))
                  }
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  {getOrderStatusChoices(editing?.status).map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {statusValue}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

