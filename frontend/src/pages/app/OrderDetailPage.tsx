import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  api,
  type OrderResponse,
  type OrderAmendmentResponse,
  type CustomerResponse,
  type QuotationResponse,
  type MaterialRequirementResponse,
  type OrderPromiseCheckResponse,
} from "@/api/client";
import { OrderAiPanel } from "@/components/orders/OrderAiPanel";
import { OrderAiAuditHistory } from "@/components/orders/OrderAiAuditHistory";
import { PlanningGroundingCard } from "@/components/orders/PlanningGroundingCard";
import { CommercialAlignmentCard } from "@/components/orders/CommercialAlignmentCard";
import { ChangeRequestPanel } from "@/components/orders/ChangeRequestPanel";
import { CommercialTimelineCard } from "@/components/orders/CommercialTimelineCard";
import { ORDER_PROTECTED_FIELD_DEFS } from "@/lib/commercialChangeFields";
import {
  getOrderStatusChoices,
  PIPELINE_STAGES,
  suggestNaSteps,
  humanizePipelineStatus,
} from "@/features/merch/workflow";
import { OrderMilestoneTracker } from "@/components/app/OrderMilestoneTracker";
import { useAuth } from "@/context/AuthContext";
import { useOrderAi } from "@/hooks/useOrderAi";
import { logApiError } from "@/utils/logApiError";
import { useSecureImage } from "@/hooks/useSecureImage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { WorkflowSummaryStrip } from "@/components/app/WorkflowSummaryStrip";

export function OrderDetailPage() {
  const { me } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<OrderResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [quotation, setQuotation] = useState<QuotationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amendments, setAmendments] = useState<OrderAmendmentResponse[]>([]);
  const [newStatus, setNewStatus] = useState("");
  const [materialReqModalOpen, setMaterialReqModalOpen] = useState(false);
  const [materialReq, setMaterialReq] = useState<MaterialRequirementResponse | null>(null);
  const [materialReqLoading, setMaterialReqLoading] = useState(false);
  const [materialReqError, setMaterialReqError] = useState("");
  const [promiseCheck, setPromiseCheck] = useState<OrderPromiseCheckResponse | null>(null);
  const [promiseLoading, setPromiseLoading] = useState(false);
  const [promiseError, setPromiseError] = useState("");
  const [milestoneTick, setMilestoneTick] = useState(0);
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineDraftType, setPipelineDraftType] = useState<string>("export");
  const [pipelineDraftNa, setPipelineDraftNa] = useState<Set<string>>(() => new Set());
  const [forcePipeline, setForcePipeline] = useState("");
  const styleImageUrl = useSecureImage(item?.style_image_url);
  const orderAi = useOrderAi();
  const isTenantAdmin = (me?.role_name || "").toLowerCase() === "admin";
  const featureFlags = me?.feature_flags as Record<string, boolean> | undefined;
  const controlTowerOn = featureFlags?.control_tower_enabled === true;

  const orderAiFormSnapshot = useMemo(
    () =>
      item
        ? {
            customer_id: item.customer_id,
            quotation_id: item.quotation_id,
            style_id: item.style_id,
            style_ref: item.style_ref,
            customer_intermediary_id: item.customer_intermediary_id,
            shipping_term: item.shipping_term,
            commission_mode: item.commission_mode,
            commission_type: item.commission_type,
            commission_value: item.commission_value,
            order_date: item.order_date,
            delivery_date: item.delivery_date,
            quantity: item.quantity,
            status: item.status,
            remarks: item.remarks,
          }
        : {},
    [item],
  );

  const refreshOrder = async (orderId: number) => {
    const order = await api.getOrder(orderId, { ai_indicators: 1 });
    setItem(order);
    setNewStatus(order.status);
    setMilestoneTick((t) => t + 1);
  };

  const syncPipelineDraftFromApi = (orderType: string | null | undefined, na: string[] | null | undefined) => {
    setPipelineDraftType((orderType || "export").toLowerCase());
    setPipelineDraftNa(new Set((na || []).map((x) => String(x).toUpperCase())));
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const order = await api.getOrder(Number(id), { ai_indicators: 1 });
        setItem(order);
        const [cust, quote, promise] = await Promise.all([
          api.getCustomer(order.customer_id),
          order.quotation_id ? api.getQuotation(order.quotation_id) : Promise.resolve(null),
          api.getOrderPromiseCheck(order.id).catch((e) => {
            logApiError("OrderDetailPage.getOrderPromiseCheck", e);
            return null;
          }),
        ]);
        setCustomer(cust);
        setQuotation(quote);
        setPromiseCheck(promise);
        setAmendments(await api.listOrderAmendments(order.id));
        setNewStatus(order.status);
        try {
          const ms = await api.getOrderMilestones(order.id);
          syncPipelineDraftFromApi(ms.order_type, ms.pipeline_na_steps);
        } catch {
          syncPipelineDraftFromApi(order.order_type, order.pipeline_na_steps ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load order");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return <div className="p-6 text-text-muted">Loading order…</div>;
  }

  if (error || !item) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-status-danger text-sm">{error || "Order not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/orders")}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Back to orders
        </button>
      </div>
    );
  }

  const execHint = item.ai_indicators
    ? `Readiness ${item.ai_indicators.execution_readiness_score}% · Material ${item.ai_indicators.material_readiness_score}% · Plan ${item.ai_indicators.planning_confidence_score}%`
    : "Operational metrics from API when available";

  return (
    <div className="p-6 space-y-6">
      <AppPageHeader
        backTo={{ label: "Back to orders", to: "/app/orders" }}
        title={`Order ${item.order_code}`}
        description={`${customer?.name ?? `Customer #${item.customer_id}`} · Status ${item.status}${
          item.pipeline_status ? ` · Pipeline ${humanizePipelineStatus(item.pipeline_status)}` : ""
        }. ${execHint}${
          item.ai_indicators && item.ai_indicators.duplicate_risk_score >= 35 ? " · Possible duplicate risk." : ""
        }`}
        belowTitle={
          <WorkflowSummaryStrip
            items={[
              {
                label: "Customer",
                value: customer?.name ?? `#${item.customer_id}`,
                to: customer ? `/app/customers/${customer.id}` : undefined,
              },
              {
                label: "Quotation",
                value: quotation?.quotation_code ?? "—",
                to: quotation ? `/app/quotations/${quotation.id}` : undefined,
              },
              {
                label: "Production",
                value: "Planning",
                to: `/app/production/planning?order_id=${item.id}`,
                hint: "Manufacturing planning for this order",
              },
              ...(controlTowerOn
                ? [
                    {
                      label: "Control Tower",
                      value: "Open",
                      to: `/app/operations/control-tower?focus_order=${item.id}`,
                      hint: "Cross-functional execution snapshot",
                    },
                  ]
                : []),
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                setError("");
                const created = await api.createTradeCase({
                  direction: "EXPORT",
                  reference: `TC-${item.order_code}`,
                  status: "DRAFT",
                  current_stage: "DRAFT",
                  order_id: item.id,
                  customer_id: item.customer_id,
                  proforma_invoice_id: undefined,
                });
                navigate(`/app/trade/cases/${created.id}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create trade case");
              }
            }}
            className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-1.5 text-sm font-medium text-status-info-foreground hover:bg-status-info-subtle/80"
          >
            Create Trade Case
          </button>
          <button
            type="button"
            onClick={() => {
              setMaterialReqModalOpen(true);
              setMaterialReq(null);
              setMaterialReqError("");
              setMaterialReqLoading(true);
              api
                .getOrderMaterialRequirement(item.id)
                .then((res) => {
                  setMaterialReq(res);
                  setMaterialReqError("");
                })
                .catch((e) => {
                  setMaterialReqError(e instanceof Error ? e.message : "Failed to load material requirement");
                  setMaterialReq(null);
                })
                .finally(() => setMaterialReqLoading(false));
            }}
            className="rounded-lg border border-brand-primary bg-surface-raised px-3 py-1.5 text-sm font-medium text-brand-primary hover:bg-brand-primary/5"
          >
            Material requirement
          </button>
          <Link
            to={`/app/orders/${item.id}/print`}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Print / Save PDF
          </Link>
          <button
            type="button"
            onClick={() => navigate("/app/orders")}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          >
            Back to list
          </button>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <OrderMilestoneTracker key={`mt-${item.id}-${milestoneTick}`} orderId={item.id} variant="full" />
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Pipeline settings</h2>
        <p className="text-xs text-text-muted">
          Mark steps as N/A when they do not apply (for example local orders with no LC).
        </p>
        <div className="flex flex-wrap gap-3 text-xs items-center">
          {(["export", "local", "both"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="order_type"
                checked={pipelineDraftType === t}
                onChange={() => setPipelineDraftType(t)}
              />
              {t}
            </label>
          ))}
          <button
            type="button"
            className="rounded border border-border-strong px-2 py-0.5 hover:bg-surface-subtle"
            onClick={() => setPipelineDraftNa(new Set(suggestNaSteps(pipelineDraftType)))}
          >
            Apply suggested N/A for type
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {PIPELINE_STAGES.map((stage) => (
            <label key={stage} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={pipelineDraftNa.has(stage)}
                onChange={(e) => {
                  const next = new Set(pipelineDraftNa);
                  if (e.target.checked) next.add(stage);
                  else next.delete(stage);
                  setPipelineDraftNa(next);
                }}
              />
              {humanizePipelineStatus(stage)}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pipelineSaving}
          className="rounded-lg border border-brand-primary bg-brand-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={async () => {
            setPipelineSaving(true);
            setError("");
            try {
              await api.updateOrderPipelineSettings(item.id, {
                order_type: pipelineDraftType,
                na_steps: [...pipelineDraftNa],
              });
              await refreshOrder(item.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save pipeline settings");
            } finally {
              setPipelineSaving(false);
            }
          }}
        >
          {pipelineSaving ? "Saving…" : "Save pipeline settings"}
        </button>
      </div>

      {isTenantAdmin ? (
        <div className="rounded-xl border border-status-warning/40 bg-status-warning-subtle p-4 text-sm">
          <h2 className="font-semibold text-status-warning-foreground">Admin: force pipeline stage</h2>
          <p className="mt-1 text-xs text-text-muted">
            Use only when auto-advance is stuck. Legacy order status is unchanged unless you also update it above.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={forcePipeline}
              onChange={(e) => setForcePipeline(e.target.value)}
              className="rounded border border-border-strong bg-surface-raised px-2 py-1 text-xs"
            >
              <option value="">Select stage…</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-border-strong px-2 py-1 text-xs hover:bg-surface-subtle"
              disabled={!forcePipeline}
              onClick={async () => {
                try {
                  setError("");
                  await api.updateOrderStatus(item.id, item.status, { force_pipeline_status: forcePipeline });
                  await refreshOrder(item.id);
                  setForcePipeline("");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Force failed");
                }
              }}
            >
              Apply force
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-text-primary">Related Records</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.customer_id ? (
            <Link
              to={`/app/customers/${item.customer_id}`}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Customer
            </Link>
          ) : null}
          {item.quotation_id ? (
            <Link
              to={`/app/quotations/${item.quotation_id}`}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Quotation
            </Link>
          ) : null}
          <Link
            to="/app/inventory/delivery-challans"
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Create delivery challan
          </Link>
          <Link
            to={`/app/commercial/proforma-invoices/new?order_id=${item.id}&customer_id=${item.customer_id}`}
            className="rounded-lg border border-status-info/30 bg-status-info-subtle px-2.5 py-1 text-xs font-medium text-status-info-foreground hover:bg-status-info-subtle/80"
          >
            Create Proforma Invoice
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
          <div className="text-sm text-text-secondary space-y-1">
            <div>
              <span className="font-medium">Customer:</span>{" "}
              {customer?.name ?? `#${item.customer_id}`}
            </div>
            <div>
              <span className="font-medium">Quotation:</span>{" "}
              {quotation ? (
                <Link
                  to={`/app/quotations/${quotation.id}`}
                  className="text-status-info hover:underline"
                >
                  {quotation.quotation_code}
                </Link>
              ) : (
                "—"
              )}
            </div>
            <div>
              <span className="font-medium">Style ref:</span>{" "}
              {item.style_ref ?? "—"}
            </div>
            <div>
              <span className="font-medium">Style ID:</span>{" "}
              {item.style_id != null ? String(item.style_id) : "—"}{" "}
              <span className="text-xs text-text-muted">(authoritative link to garment style)</span>
            </div>
            <div>
              <span className="font-medium">Style name:</span>{" "}
              {item.style_name ?? "—"}
            </div>
            <div>
              <span className="font-medium">Intermediary:</span>{" "}
              {item.intermediary_name ?? "—"}
            </div>
            <div>
              <span className="font-medium">Shipping term:</span>{" "}
              {item.shipping_term ?? "—"}
            </div>
            <div>
              <span className="font-medium">Commission:</span>{" "}
              {item.commission_mode || item.commission_type || item.commission_value
                ? `${item.commission_mode ?? "-"} / ${item.commission_type ?? "-"} / ${item.commission_value ?? "-"}`
                : "—"}
            </div>
            <div>
              <span className="font-medium">Reporting / book currency:</span>{" "}
              {item.commercial_book_currency ?? "—"}{" "}
              <span className="text-xs text-text-muted">(see Commercial alignment for quotation context)</span>
            </div>
            {styleImageUrl && (
              <img
                src={styleImageUrl}
                alt={item.style_name ?? item.style_ref ?? "Style"}
                className="h-20 w-20 rounded object-cover border border-border"
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Schedule & Quantity</h2>
          <div className="text-sm text-text-secondary space-y-1">
            <div>
              <span className="font-medium">Order date:</span>{" "}
              {item.order_date
                ? new Date(item.order_date).toLocaleDateString()
                : "—"}
            </div>
            <div>
              <span className="font-medium">Delivery date:</span>{" "}
              {item.delivery_date
                ? new Date(item.delivery_date).toLocaleDateString()
                : "—"}
            </div>
            <div>
              <span className="font-medium">Quantity:</span>{" "}
              {item.quantity != null ? item.quantity.toLocaleString() : "—"}
            </div>
            <div className="pt-2 flex items-center gap-2">
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="rounded border border-border-strong bg-surface-raised px-2 py-1 text-xs"
              >
                {getOrderStatusChoices(item.status).map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {statusValue}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  try {
                    setError("");
                    const updated = await api.updateOrderStatus(item.id, newStatus);
                    await refreshOrder(updated.id);
                    const latestPromise = await api.getOrderPromiseCheck(item.id).catch((e) => {
                      logApiError("OrderDetailPage.getOrderPromiseCheck(refresh)", e);
                      return null;
                    });
                    if (latestPromise) {
                      setPromiseCheck(latestPromise);
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to update order status");
                  }
                }}
                className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary"
              >
                Update status
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">ATP / CTP Promise Check</h2>
          <button
            type="button"
            onClick={async () => {
              setPromiseLoading(true);
              setPromiseError("");
              try {
                const check = await api.getOrderPromiseCheck(item.id);
                setPromiseCheck(check);
              } catch (e) {
                setPromiseError(e instanceof Error ? e.message : "Failed to load promise check");
              } finally {
                setPromiseLoading(false);
              }
            }}
            className="rounded border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
          >
            Refresh check
          </button>
        </div>
        {promiseLoading && <div className="text-xs text-text-muted">Checking promise...</div>}
        {promiseError && <div className="text-xs text-status-danger">{promiseError}</div>}
        {promiseCheck && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${promiseCheck.atp_ok ? "bg-status-success-subtle text-status-success-foreground" : "bg-status-danger-subtle text-status-danger-foreground"}`}>
                ATP: {promiseCheck.atp_ok ? "OK" : "Blocked"}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${promiseCheck.ctp_ok ? "bg-status-success-subtle text-status-success-foreground" : "bg-status-danger-subtle text-status-danger-foreground"}`}>
                CTP: {promiseCheck.ctp_ok ? "OK" : "Blocked"}
              </span>
            </div>
            {promiseCheck.reasons.length > 0 && (
              <div className="rounded border border-status-warning/20 bg-status-warning-subtle p-2 text-xs text-status-warning-foreground">
                {promiseCheck.reasons.join("; ")}
              </div>
            )}
          </div>
        )}
      </div>

      <CommercialAlignmentCard orderId={item.id} quotationId={item.quotation_id} />
      <PlanningGroundingCard orderId={item.id} />

      <CommercialTimelineCard entityType="order" entityId={item.id} />

      <ChangeRequestPanel
        entityType="order"
        entityId={item.id}
        entityStatus={item.status}
        fieldDefs={ORDER_PROTECTED_FIELD_DEFS}
        record={{
          delivery_date: item.delivery_date,
          quantity: item.quantity,
          commission_mode: item.commission_mode,
          commission_type: item.commission_type,
          commission_value: item.commission_value,
          shipping_term: item.shipping_term,
        }}
      />

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Order AI</h2>
        <p className="text-xs text-text-muted">
          Review-first assistance for PO extraction, context enrich, validation, overlap checks, summary, and follow-up
          ideas. Planning checks in this panel are read-only: they do not change status, dates, costing, or production
          plan commitments.
        </p>
        <OrderAiPanel
          mode="edit"
          orderId={item.id}
          ai={orderAi}
          formSnapshot={orderAiFormSnapshot}
          onAfterApply={() => void refreshOrder(item.id)}
        />
        <OrderAiAuditHistory orderId={item.id} mode="planning" />
        <OrderAiAuditHistory orderId={item.id} mode="simulation" />
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Remarks</h2>
        <p className="text-sm text-text-secondary">
          {item.remarks || "No remarks added."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">Amendments</h2>
          <button
            onClick={async () => {
              await api.createOrderAmendment(item.id, {
                field_changed: "status",
                old_value: item.status,
                new_value: newStatus,
                reason: "Manual update",
              });
              setAmendments(await api.listOrderAmendments(item.id));
            }}
            className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary"
          >
            Add amendment snapshot
          </button>
        </div>
        {amendments.length === 0 ? (
          <div className="text-xs text-text-muted">No amendments yet.</div>
        ) : (
          <div className="space-y-1">
            {amendments.map((a) => (
              <div key={a.id} className="rounded border border-border px-2 py-1 text-xs text-text-secondary">
                #{a.amendment_no} · {a.field_changed}: {a.old_value ?? "—"} {" -> "} {a.new_value ?? "—"} ({a.status})
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-text-muted">
        Created at {new Date(item.created_at).toLocaleString()} · Updated at{" "}
        {new Date(item.updated_at).toLocaleString()}
      </div>

      {materialReqModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !materialReqLoading && setMaterialReqModalOpen(false)}
        >
          <div
            className="rounded-xl border border-border bg-surface-raised p-5 shadow-lg w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Material requirement · {item.order_code}
            </h3>
            {materialReqLoading && (
              <p className="text-sm text-text-muted py-4">Loading…</p>
            )}
            {materialReqError && (
              <p className="text-sm text-status-danger py-2">{materialReqError}</p>
            )}
            {!materialReqLoading && materialReq && (
              <>
                <p className="text-xs text-text-muted mb-3">
                  Order qty: {materialReq.quantity_used.toLocaleString()} · BOM #{materialReq.bom_id} · Style #{materialReq.style_id}
                </p>
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                  <table className="min-w-[520px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left">Item</th>
                        <th className="px-3 py-2 text-left">UOM</th>
                        <th className="px-3 py-2 text-right">Required</th>
                        <th className="px-3 py-2 text-right">Available</th>
                        <th className="px-3 py-2 text-right">Shortage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materialReq.lines.map((line) => (
                        <tr key={line.item_id} className="border-b border-border-subtle last:border-0">
                          <td className="px-3 py-2 text-text-primary">
                            {line.item_code} · {line.item_name}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{line.uom ?? "—"}</td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {line.required_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {line.available_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={line.shortage_qty > 0 ? "font-medium text-status-warning-foreground" : "text-text-secondary"}>
                              {line.shortage_qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setMaterialReqModalOpen(false)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

