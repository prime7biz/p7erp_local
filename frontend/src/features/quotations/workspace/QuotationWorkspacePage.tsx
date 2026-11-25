import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  api,
  type CustomerResponse,
  type InventoryItemResponse,
  type QuotationManufacturingLine,
  type QuotationOtherCostLine,
  type StyleResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { WorkflowSummaryStrip, type WorkflowStripItem } from "@/components/app/WorkflowSummaryStrip";
import { LinkedRecordsSection, type LinkedRecordRow } from "@/components/app/LinkedRecordsSection";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import { MasterQuickAddModal } from "@/components/app/MasterQuickAddModal";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { logApiError } from "@/utils/logApiError";
import { SecureImage } from "@/components/SecureImage";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";
import {
  fetchActiveCustomerPage,
  fetchStylePage,
  hydrateCustomer,
  hydrateStyle,
} from "@/lib/remoteSelectFetchers";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { MaterialItemCombobox } from "./components/MaterialItemCombobox";
import { DozenCmLines } from "./components/DozenCmLines";
import { FobStudioCard } from "./sidebar/FobStudioCard";
import { persistableIndexes } from "./mappers/quotationCostingAdapter";
import { useQuotationWorkspaceController } from "./useQuotationWorkspaceController";
import { useQuotationWiring } from "./useQuotationWiring";
import { ManufacturingWiringHint, QuotationWiringPanel } from "./components/QuotationWiringPanel";
import { comparableHintText, isQuotationCostingLocked } from "./mappers/wiringDraftRows";
import { CostSummaryCard } from "./sidebar/CostSummaryCard";
import { MarginPricingCard } from "./sidebar/MarginPricingCard";
import { CostBreakdownCard } from "./sidebar/CostBreakdownCard";
import { calculateQuotationTotals } from "./mappers/calculateQuotationTotals";
import {
  applyOtherCostCalculation,
  computeCommissionAmount,
  formatMoney,
  isPersistableOtherCostRow,
  lineFxToQuotation,
  resolveOtherCostAmount,
  sizeQuantityFromRatio,
  toSafeNumber,
} from "./mappers/quotationNumeric";
import { canConvertQuotationToOrder } from "@/features/merch/workflow";
import { useQuotationAi } from "@/hooks/useQuotationAi";
import { QuotationAiPanel } from "@/components/quotations/QuotationAiPanel";
import { QuotationCostingIntelligencePanel } from "@/components/quotations/QuotationCostingIntelligencePanel";
import { QuotationCostingSuggestionsPanel } from "@/components/quotations/QuotationCostingSuggestionsPanel";
import { QuotationCostBenchmarkPanel } from "@/components/quotations/QuotationCostBenchmarkPanel";
import { ChangeRequestPanel } from "@/components/orders/ChangeRequestPanel";
import { CommercialTimelineCard } from "@/components/orders/CommercialTimelineCard";
import { QUOTATION_PROTECTED_FIELD_DEFS } from "@/lib/commercialChangeFields";
import { QuotationAiAuditHistory } from "@/components/quotations/QuotationAiAuditHistory";

function QuotationRowActions({
  rowKey,
  openKey,
  setOpenKey,
  onDelete,
}: {
  rowKey: string;
  openKey: string | null;
  setOpenKey: (k: string | null) => void;
  onDelete: () => void;
}) {
  const expanded = openKey === rowKey;
  return (
    <div className="relative inline-block text-left" data-quotation-row-actions>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={expanded}
        onClick={() => setOpenKey(expanded ? null : rowKey)}
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
      >
        Actions
      </button>
      {expanded && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpenKey(null);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

const OTHER_COST_PRESETS: ReadonlyArray<{
  cost_head: string;
  cost_type: string;
  value: string;
  based_on: string;
}> = [
  { cost_head: "Washing", cost_type: "percentage", value: "5", based_on: "subtotal" },
  { cost_head: "Finishing", cost_type: "percentage", value: "3", based_on: "subtotal" },
  { cost_head: "Factory overhead", cost_type: "percentage", value: "8", based_on: "subtotal" },
  { cost_head: "Freight / logistics", cost_type: "fixed", value: "0", based_on: "subtotal" },
  { cost_head: "Bank / LC charges", cost_type: "percentage", value: "1.5", based_on: "subtotal" },
];

const SECTION_NAV = [
  { key: "basics", label: "Basics" },
  { key: "materials", label: "Materials" },
  { key: "cm", label: "CM" },
  { key: "other", label: "Other Costs" },
  { key: "size", label: "Size Ratios" },
  { key: "breakdown", label: "Breakdown" },
] as const;

const WORKFLOW_STAGES = ["DRAFT", "SUBMITTED", "APPROVED", "SENT", "CONVERTED"] as const;

function commissionValueLabel(
  commissionType: string | null | undefined,
  commissionValue: unknown,
): string {
  const t = (commissionType ?? "").toLowerCase();
  const n = toSafeNumber(commissionValue as number | string | null | undefined);
  if (t.includes("percent") || t === "percentage" || t === "%") {
    return `${n.toFixed(1)}%`;
  }
  return commissionValue != null && String(commissionValue).trim() !== "" ? String(commissionValue) : "—";
}

export function QuotationWorkspacePage({ id }: { id?: string }) {
  const {
    isNew,
    quotation,
    customer,
    inquiry,
    categories,
    items,
    units,
    inquiries,
    showQuickStyleCreate,
    setShowQuickStyleCreate,
    quickStyleName,
    setQuickStyleName,
    quickStyleSeason,
    setQuickStyleSeason,
    quickStyleDepartment,
    setQuickStyleDepartment,
    quickStyleImageFile,
    creatingStyle,
    quickStyleNotice,
    materials,
    setMaterials,
    manufacturing,
    setManufacturing,
    otherCosts,
    setOtherCosts,
    sizeRatios,
    setSizeRatios,
    loading,
    saving,
    error,
    success,
    isEditing,
    setIsEditing,
    duplicatingVersion,
    previousVersionQuote,
    latestRevision,
    isSuperseded,
    currencies,
    fetchingRates,
    rateSource,
    runningWorkflowAction,
    useManualQuotedPrice,
    setUseManualQuotedPrice,
    manualQuotedPrice,
    setManualQuotedPrice,
    selectedStyle,
    totals,
    costingFlagOn,
    dozenFirst,
    costing,
    costingError,
    convertToDozenFirst,
    updateQuotationHeader,
    onMaterialChange,
    onManufacturingChange,
    onOtherCostChange,
    onSizeRatioChange,
    handleInquirySelect,
    handleCustomerSelect,
    onStyleSelect,
    onQuickStyleImageChange,
    createStyleInline,
    handleSave,
    refreshExchangeRates,
    submitForReview,
    approveQuotation,
    sendQuotation,
    cancelEdit,
    allLinks,
    revisions,
    duplicateAsNewVersion,
    navigate,
    reloadQuotationDetail,
    refreshCostingMasters,
  } = useQuotationWorkspaceController(id);
  const location = useLocation();
  const isPrintMode = new URLSearchParams(location.search).get("print") === "1";
  const [sizeRatioCollapsed, setSizeRatioCollapsed] = useState(false);
  const [openRowActions, setOpenRowActions] = useState<string | null>(null);
  // Numeric fields stored as numbers: remember which are blank so the user can clear them while typing.
  const [machinesBlank, setMachinesBlank] = useState<Record<number, boolean>>({});
  const [sizeQtyBlank, setSizeQtyBlank] = useState<Record<number, boolean>>({});
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderCreateError, setOrderCreateError] = useState("");
  const [quickAdd, setQuickAdd] = useState<
    { kind: "category" | "item"; rowIdx: number } | null
  >(null);
  const quotationAi = useQuotationAi();
  const { prefill: wiringPrefill, wiring: wiringContext, hints: priceHints } = useQuotationWiring({
    quotationId: quotation && quotation.id > 0 ? quotation.id : null,
    styleId: quotation?.style_id,
    customerId: quotation?.customer_id,
    currency: quotation?.currency,
    materialItemIds: materials.map((m) => m.item_id),
  });
  const [activeSection, setActiveSection] = useState<string>("basics");

  const scrollToSection = (key: string) => {
    setActiveSection(key);
    document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("section", key);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* URL sync is optional */
    }
  };

  // Optional deep link: ?section=materials scrolls once after the page has loaded.
  const sectionDeepLinkDone = useRef(false);
  useEffect(() => {
    if (loading || sectionDeepLinkDone.current) return;
    const key = new URLSearchParams(location.search).get("section");
    if (!key || !SECTION_NAV.some((s) => s.key === key)) return;
    sectionDeepLinkDone.current = true;
    window.setTimeout(() => {
      setActiveSection(key);
      document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [loading, location.search]);

  const aiFormSnapshot = useMemo(() => {
    if (!quotation) return {};
    return {
      customer_id: String(quotation.customer_id ?? ""),
      style_ref: quotation.style_ref ?? "",
      style_id: quotation.style_id != null ? String(quotation.style_id) : "",
      department: quotation.department ?? "",
      projected_quantity: quotation.projected_quantity != null ? String(quotation.projected_quantity) : "",
      target_price: quotation.target_price ?? "",
      target_price_currency: quotation.target_price_currency ?? "",
      exchange_rate: quotation.exchange_rate ?? "",
      currency: quotation.currency ?? "",
      shipping_term: quotation.shipping_term ?? "",
      commission_mode: quotation.commission_mode ?? "",
      commission_type: quotation.commission_type ?? "",
      commission_value: quotation.commission_value != null ? String(quotation.commission_value) : "",
      valid_until: quotation.valid_until ?? "",
      notes: quotation.notes ?? "",
    };
  }, [quotation]);

  useEffect(() => {
    if (!openRowActions) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.("[data-quotation-row-actions]")) setOpenRowActions(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openRowActions]);

  // Deep link: /app/quotations/new?inquiry_id=123 pre-fills from that inquiry (once).
  const inquiryDeepLinkDone = useRef(false);
  useEffect(() => {
    if (!isNew || inquiryDeepLinkDone.current) return;
    const raw = new URLSearchParams(location.search).get("inquiry_id");
    const inquiryId = raw ? Number(raw) : 0;
    if (!Number.isFinite(inquiryId) || inquiryId <= 0) return;
    inquiryDeepLinkDone.current = true;
    void handleInquirySelect(inquiryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, location.search]);

  // Deep link: /app/quotations/new?customer_id=123 pre-selects buyer (once; skipped if inquiry_id set).
  const customerDeepLinkDone = useRef(false);
  useEffect(() => {
    if (!isNew || customerDeepLinkDone.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get("inquiry_id")) return;
    const raw = params.get("customer_id");
    const customerId = raw ? Number(raw) : 0;
    if (!Number.isFinite(customerId) || customerId <= 0) return;
    customerDeepLinkDone.current = true;
    void (async () => {
      try {
        const c = await api.getCustomer(customerId);
        handleCustomerSelect(c.id, c);
      } catch (e) {
        logApiError("QuotationWorkspacePage.customerDeepLink", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, location.search]);

  const appendOtherCostPreset = (preset: (typeof OTHER_COST_PRESETS)[number]) => {
    const { matTotal, mfgTotal } = calculateQuotationTotals(
      materials,
      manufacturing,
      [],
      quotation?.currency ?? "USD",
    );
    setOtherCosts((rows) => {
      const serial = rows.length + 1;
      const row = applyOtherCostCalculation(
        {
          serial_no: serial,
          cost_head: preset.cost_head,
          percentage: preset.cost_type === "percentage" ? preset.value : "0",
          total_amount: "0",
          cost_type: preset.cost_type,
          value: preset.value,
          based_on: preset.based_on,
          cost_basis: dozenFirst ? "PER_DOZEN" : null,
          calculated_amount: "0",
          notes: null,
          currency: quotation?.currency ?? "USD",
          exchange_rate: "1",
          base_amount: "0",
          local_amount: "0",
        },
        matTotal,
        mfgTotal,
      );
      return [...rows, row];
    });
  };

  if (loading) return <div className="p-6 text-text-muted">Loading quotation...</div>;
  if (error && !quotation) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-status-danger-foreground text-sm">{error}</div>
        <button
          type="button"
          onClick={() => navigate("/app/quotations")}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary"
        >
          Back to quotations
        </button>
      </div>
    );
  }
  if (!quotation) return null;

  const showEditableHeader = isNew || (isEditing && !isSuperseded);
  const canChangeQuotation = !isNew && !isSuperseded;
  const currencyOptions = currencies.length > 0 ? currencies.map((entry) => entry.code) : ["USD", "BDT", "EUR", "GBP", "JPY"];
  const docCur = quotation.currency ?? "USD";
  const mfgLineInQuotation = (m: QuotationManufacturingLine) =>
    toSafeNumber(m.total_order_cost) * lineFxToQuotation(m, docCur);
  const otherLineInQuotation = (c: QuotationOtherCostLine) => {
    const raw = resolveOtherCostAmount(c);
    if (c.cost_type === "percentage") return raw;
    return raw * lineFxToQuotation(c, docCur);
  };
  const findCategoryName = (value: number | null) =>
    value == null ? "" : categories.find((c) => c.id === value)?.name ?? "";
  const findItemName = (value: number | null) =>
    value == null ? "" : items.find((c) => c.id === value)?.name ?? "";

  // Each other-cost line goes into exactly ONE bucket (trim, wash/finish, overhead, else misc)
  // so nothing is counted twice. Amounts are converted into the quotation currency.
  let trimsCost = 0;
  let washFinishCost = 0;
  let overheadCost = 0;
  let otherMiscCost = 0;
  for (const c of otherCosts) {
    const key = (c.cost_head || "").toLowerCase();
    const amount = otherLineInQuotation(c);
    if (key.includes("trim")) trimsCost += amount;
    else if (key.includes("wash") || key.includes("finish")) washFinishCost += amount;
    else if (key.includes("overhead")) overheadCost += amount;
    else otherMiscCost += amount;
  }

  const projectedQty = toSafeNumber(quotation.projected_quantity);
  const dozenResult = costing && costing.ok ? costing.result : null;
  /** Dozen-first lists show per-dozen amounts, so their shares are taken from per-dozen totals. */
  const matBase = dozenFirst ? dozenResult?.materialPerDozen ?? 0 : totals.matTotal;
  const mfgBase = dozenFirst ? dozenResult?.manufacturingPerDozen ?? 0 : totals.mfgTotal;
  const otherBase = dozenFirst ? dozenResult?.otherPerDozen ?? 0 : totals.otherTotal;
  const otherResultIndex = persistableIndexes(otherCosts, isPersistableOtherCostRow);
  const dozenCommissionOrder = dozenResult ? (dozenResult.commissionMemoPerDozen * projectedQty) / 12 : 0;
  const costNum = toSafeNumber(quotation.total_cost) || totals.total;
  const quotedPriceNum = useManualQuotedPrice
    ? toSafeNumber(manualQuotedPrice)
    : toSafeNumber(quotation.quoted_price) || toSafeNumber(quotation.total_amount);
  const factoryMarginAmount = quotedPriceNum - costNum;
  const factoryMarginPercent = useManualQuotedPrice
    ? totals.total > 0
      ? (factoryMarginAmount / totals.total) * 100
      : 0
    : toSafeNumber(quotation.profit_percentage);
  const commissionAmount = computeCommissionAmount({
    mode: quotation.commission_mode,
    type: quotation.commission_type,
    value: quotation.commission_value,
    baseForPercent: costNum + factoryMarginAmount,
  }).amount;
  const costPerPc =
    toSafeNumber(quotation.cost_per_piece) || (projectedQty > 0 ? costNum / projectedQty : 0);

  const isCostingLocked = ["APPROVED", "SENT", "CONVERTED"].includes(quotation.status);
  const orderAlreadyCreated = Boolean(quotation.is_converted_to_order) || quotation.status === "CONVERTED";
  const currentStage = quotation.status === "NEW" ? "DRAFT" : quotation.status;
  const currentStageIdx = WORKFLOW_STAGES.indexOf(currentStage as (typeof WORKFLOW_STAGES)[number]);
  const workflowStripItems: WorkflowStripItem[] = WORKFLOW_STAGES.map((stage, i) => ({
    label: stage.charAt(0) + stage.slice(1).toLowerCase(),
    value: currentStageIdx === -1 ? "·" : i < currentStageIdx ? "✓" : i === currentStageIdx ? "● Current" : "·",
    hint: i === currentStageIdx ? `Status: ${quotation.status}` : undefined,
  }));
  /** Document chain when this quotation came from an inquiry. */
  const documentChainStripItems: WorkflowStripItem[] | null = quotation.inquiry_id
    ? [
        {
          label: "Customer",
          value: customer?.name ?? `#${quotation.customer_id}`,
          to: quotation.customer_id ? `/app/customers/${quotation.customer_id}` : undefined,
        },
        {
          label: "Inquiry",
          value: inquiry?.inquiry_code ?? `#${quotation.inquiry_id}`,
          to: `/app/inquiries/${quotation.inquiry_id}`,
        },
        {
          label: "Quotation",
          value: quotation.quotation_code,
          hint: quotation.status,
        },
        {
          label: "Order",
          value: quotation.converted_order_id ? `#${quotation.converted_order_id}` : "—",
          to: quotation.converted_order_id ? `/app/orders/${quotation.converted_order_id}` : undefined,
        },
      ]
    : null;
  const linkedCustomerRows: LinkedRecordRow[] = quotation.customer_id
    ? [{ id: quotation.customer_id, label: customer?.name ?? `Customer #${quotation.customer_id}`, to: `/app/customers/${quotation.customer_id}` }]
    : [];
  const linkedInquiryRows: LinkedRecordRow[] = quotation.inquiry_id
    ? [{ id: quotation.inquiry_id, label: inquiry?.inquiry_code ?? `Inquiry #${quotation.inquiry_id}`, to: `/app/inquiries/${quotation.inquiry_id}` }]
    : [];
  const linkedStyleRows: LinkedRecordRow[] = quotation.style_id
    ? [{ id: quotation.style_id, label: quotation.style_name ?? quotation.style_ref ?? `Style #${quotation.style_id}`, to: `/app/merchandising/styles/${quotation.style_id}` }]
    : [];
  const linkedOrderRows: LinkedRecordRow[] = quotation.converted_order_id
    ? [{ id: quotation.converted_order_id, label: `Order #${quotation.converted_order_id}`, to: `/app/orders/${quotation.converted_order_id}` }]
    : [];
  const intermediaryOptions = allLinks
    .filter((l) => l.customer_id === quotation.customer_id)
    .map((l) => ({
      value: l.id,
      label: `${l.intermediary_name ?? `#${l.intermediary_id}`}${l.intermediary_code ? ` (${l.intermediary_code})` : ""}${
        l.is_primary ? " · primary" : ""
      }`,
    }));
  const ratioSum = sizeRatios.reduce((a, r) => a + toSafeNumber(r.ratio_percentage), 0);
  const applySizePreset = (ratios: string[]) => {
    const names = ["S", "M", "L", "XL"];
    setSizeRatios(
      names.map((size, i) => {
        const ratio = ratios[i] ?? "0";
        return {
          serial_no: i + 1,
          size,
          ratio_percentage: ratio,
          fabric_factor: "1.0",
          quantity: sizeQuantityFromRatio(projectedQty, ratio),
        };
      }),
    );
  };

  return (
    <div className="print-report space-y-5 p-4 lg:space-y-6 lg:p-6">
      <div className="print-only mb-3 border-b border-border pb-2">
        <h1 className="text-2xl font-bold text-text-primary">Quotation {quotation.quotation_code}</h1>
        <div className="text-sm text-text-secondary">
          Created {new Date(quotation.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
          {customer?.name ?? `Customer #${quotation.customer_id}`} · {quotation.status}
        </div>
      </div>

      <AppPageHeader
        className="no-print"
        title={`Quotation ${quotation.quotation_code}`}
        description={`Created ${new Date(quotation.created_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })} · ${customer?.name ?? `Customer #${quotation.customer_id}`} · ${quotation.status}${
          !isNew ? ` · v${quotation.version_no}` : ""
        }${isSuperseded ? " · Superseded" : ""}${showEditableHeader ? " · Fields marked with ** are mandatory." : ""}`}
        backTo={{ label: "Quotations", to: "/app/quotations" }}
        belowTitle={
          !isNew ? (
            <div className="space-y-2">
              {documentChainStripItems ? (
                <WorkflowSummaryStrip items={documentChainStripItems} />
              ) : null}
              <WorkflowSummaryStrip items={workflowStripItems} />
              {revisions.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Revisions">
                  <span className="font-medium text-text-muted">Revisions:</span>
                  {revisions.map((r) => (
                    <Link
                      key={r.id}
                      to={`/app/quotations/${r.id}`}
                      title={r.quotation_code}
                      aria-current={r.id === quotation.id ? "page" : undefined}
                      className={`rounded-md border px-2 py-0.5 ${
                        r.id === quotation.id
                          ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary"
                          : "border-border bg-surface-raised text-text-secondary hover:bg-surface-subtle"
                      }`}
                    >
                      v{r.version_no}
                      {r.is_latest_revision ? " (latest)" : ""}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null
        }
        actions={
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={() => window.open(`/app/quotations/${quotation.id}/print`, "_blank", "noopener,noreferrer")}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary"
            >
              Print / Save PDF
            </button>
          )}
          {canChangeQuotation && orderAlreadyCreated && quotation.converted_order_id ? (
            <Link
              to={`/app/orders/${quotation.converted_order_id}`}
              className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-1.5 text-sm font-medium text-status-info-foreground"
            >
              View order
            </Link>
          ) : null}
          {canChangeQuotation && quotation.status === "APPROVED" && !orderAlreadyCreated && (
            <button
              type="button"
              disabled
              title="Send the quotation to the customer first"
              className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-sm text-text-muted opacity-60"
            >
              Send first
            </button>
          )}
          {canChangeQuotation && canConvertQuotationToOrder(quotation.status) && !orderAlreadyCreated && (
            <button
              type="button"
              onClick={async () => {
                if (creatingOrder) return;
                setCreatingOrder(true);
                try {
                  setOrderCreateError("");
                  const order = await api.convertQuotationToOrder(quotation.id);
                  navigate(`/app/orders/${order.id}`);
                } catch (e) {
                  logApiError("QuotationWorkspace.createOrder", e);
                  setOrderCreateError(
                    e instanceof Error ? e.message : "Failed to create order from quotation",
                  );
                } finally {
                  setCreatingOrder(false);
                }
              }}
              disabled={creatingOrder}
              className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-1.5 text-sm font-medium text-status-info-foreground disabled:opacity-60"
            >
              {creatingOrder ? "Creating Order..." : "Create Order"}
            </button>
          )}
          {canChangeQuotation && (
            <button
              type="button"
              onClick={duplicateAsNewVersion}
              disabled={duplicatingVersion}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary disabled:opacity-60"
            >
              {duplicatingVersion ? "Duplicating..." : "Duplicate as new version"}
            </button>
          )}
          {isNew ? (
            <button
              type="button"
              onClick={() => navigate("/app/quotations")}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary"
            >
              Cancel
            </button>
          ) : (
            <>
              {!isSuperseded && (
                <button
                  type="button"
                  onClick={() => (isEditing ? cancelEdit() : setIsEditing(true))}
                  disabled={(!isEditing && isCostingLocked) || (quotation.costing_basis != null && !costingFlagOn)}
                  title={
                    !isEditing && isCostingLocked
                      ? "Costing is locked after approval. Use a change request or duplicate as a new version."
                      : undefined
                  }
                  className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary disabled:opacity-60"
                >
                  {isEditing ? "Cancel edit" : "Edit costing"}
                </button>
              )}
              {!isSuperseded && !isEditing && isCostingLocked && (
                <span className="text-xs text-text-muted">Costing locked ({quotation.status})</span>
              )}
              <button
                type="button"
                onClick={() => navigate("/app/quotations")}
                className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary"
              >
                Back to list
              </button>
            </>
          )}
          {isEditing && !isSuperseded && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || creatingStyle}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save draft"}
            </button>
          )}
          {canChangeQuotation && ["DRAFT", "NEW"].includes(quotation.status) && (
            <button
              type="button"
              onClick={submitForReview}
              disabled={runningWorkflowAction !== ""}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary disabled:opacity-60"
            >
              {runningWorkflowAction === "submit" ? "Submitting..." : "Submit for review"}
            </button>
          )}
          {canChangeQuotation && quotation.status === "SUBMITTED" && (
            <button
              type="button"
              onClick={approveQuotation}
              disabled={runningWorkflowAction !== ""}
              className="rounded-lg border border-status-success/40 bg-status-success-subtle px-3 py-1.5 text-sm text-status-success-foreground disabled:opacity-60"
            >
              {runningWorkflowAction === "approve" ? "Approving..." : "Approve"}
            </button>
          )}
          {canChangeQuotation && quotation.status === "APPROVED" && (
            <button
              type="button"
              onClick={sendQuotation}
              disabled={runningWorkflowAction !== ""}
              className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-1.5 text-sm text-status-info-foreground disabled:opacity-60"
            >
              {runningWorkflowAction === "send" ? "Sending..." : "Send to customer"}
            </button>
          )}
        </div>
        }
      />

      {isCostingLocked && !isNew && (
        <div
          className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-sm text-status-warning-foreground"
          role="status"
        >
          <span>
            <span className="font-semibold">Commercial lock:</span> costing is locked ({quotation.status}). To change
            protected fields, raise a change request or duplicate as a new version.
          </span>
          <button
            type="button"
            onClick={() => {
              document
                .getElementById("section-change-requests")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="font-semibold underline"
          >
            Go to change requests
          </button>
        </div>
      )}

      <nav
        aria-label="Quotation sections"
        className="no-print sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface-raised/95 px-2 py-1.5 shadow-sm backdrop-blur"
      >
        {SECTION_NAV.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => scrollToSection(s.key)}
            className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium ${
              activeSection === s.key
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {isSuperseded && (
        <div
          className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-sm text-status-warning-foreground"
          role="status"
        >
          <span>
            <span className="font-semibold">Superseded:</span> this is version v{quotation.version_no} and is read-only
            because a newer revision replaced it.
          </span>
          {latestRevision && latestRevision.id !== quotation.id && (
            <Link to={`/app/quotations/${latestRevision.id}`} className="font-semibold underline">
              View latest v{latestRevision.version_no} ({latestRevision.quotation_code})
            </Link>
          )}
        </div>
      )}

      {!isNew && !isSuperseded && quotation.costing_basis == null && costingFlagOn && !isCostingLocked && (
        <div
          className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-info/30 bg-status-info-subtle px-4 py-3 text-sm text-status-info-foreground"
          role="status"
        >
          <span>
            <span className="font-semibold">Older costing method.</span> This quotation is costed for the whole order.
            You can switch it to dozen-first costing (per 12 pcs, price per piece). Nothing changes until you save.
          </span>
          <button
            type="button"
            onClick={convertToDozenFirst}
            disabled={isEditing && dozenFirst}
            className="rounded-lg border border-status-info/40 bg-surface-raised px-3 py-1.5 text-xs font-semibold"
          >
            Switch to dozen-first costing
          </button>
        </div>
      )}

      {quotation.costing_basis != null && !costingFlagOn && !isNew && (
        <div
          className="no-print rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-sm text-status-warning-foreground"
          role="status"
        >
          <span className="font-semibold">Read-only:</span> this quotation uses dozen-first costing, which is switched off
          for your company. Its saved values stay visible. Ask an admin to switch it back on in Settings → Configuration to
          edit it.
        </div>
      )}

      {dozenFirst && isEditing && costingError && (
        <div
          className="no-print rounded-lg border border-status-danger/30 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground"
          role="alert"
        >
          <span className="font-semibold">Costing needs attention:</span> {costingError.message}
        </div>
      )}

      {(error || success || orderCreateError) && (
        <div className="space-y-2">
          {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}
          {success && <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">{success}</div>}
          {orderCreateError && (
            <div
              className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground"
              role="alert"
            >
              {orderCreateError}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
        <div className="space-y-5 xl:col-span-8 2xl:col-span-9">
          <CollapsibleSection id="section-basics" title={showEditableHeader ? "Quotation Basics" : "Quotation Summary"}>
            {showEditableHeader ? (
              <div className="space-y-4 text-sm">
                {isNew && (
                  <>
                    <div>
                      <label className="mb-0.5 block font-medium text-text-secondary">Customer **</label>
                      <RemoteSearchSelect<CustomerResponse>
                        className="w-full"
                        value={quotation.customer_id || ""}
                        onChange={(next, opt) => {
                          const id = typeof next === "number" && next > 0 ? next : 0;
                          handleCustomerSelect(id, opt?.meta ?? null);
                        }}
                        fetchPage={fetchActiveCustomerPage}
                        hydrateById={hydrateCustomer}
                        placeholder="Search customer…"
                        aria-label="Customer"
                        allowClear
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block font-medium text-text-secondary">Link to inquiry (optional)</label>
                      <LocalSearchSelect
                        className="w-full"
                        value={quotation.inquiry_id ?? ""}
                        options={inquiries.map((inq) => ({
                          value: inq.id,
                          label: `${inq.inquiry_code} · ${inq.style_ref ?? "—"}`,
                        }))}
                        onChange={(next) => handleInquirySelect(next === "" ? null : Number(next))}
                        placeholder="None"
                        aria-label="Link to inquiry"
                        allowClear
                      />
                    </div>
                  </>
                )}

                {!isNew && (
                  <div className="space-y-1 text-text-secondary">
                    <div>
                      <span className="font-medium">Customer:</span> {customer?.name ?? `#${quotation.customer_id}`}
                    </div>
                    <div>
                      <span className="font-medium">Linked inquiry:</span>{" "}
                      {inquiry ? (
                        <Link to={`/app/inquiries/${inquiry.id}`} className="text-brand-primary hover:underline">
                          {inquiry.inquiry_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="mb-0.5 block font-medium text-text-secondary">Style</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                      <RemoteSearchSelect<StyleResponse>
                        className="w-full"
                        value={quotation.style_id ?? ""}
                        onChange={(next, opt) => {
                          const id = next === "" ? null : Number(next);
                          onStyleSelect(id, opt?.meta ?? null);
                        }}
                        fetchPage={fetchStylePage}
                        hydrateById={hydrateStyle}
                        placeholder="Search style…"
                        aria-label="Style"
                        allowClear
                      />
                      <button
                        type="button"
                        onClick={() => setShowQuickStyleCreate((v) => !v)}
                        className="rounded border border-border px-3 py-2 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        {showQuickStyleCreate ? "Close quick add" : "Quick add style"}
                      </button>
                    </div>
                    {showQuickStyleCreate && (
                      <div className="space-y-2 rounded-lg border border-status-info/20 bg-status-info-subtle p-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <input
                            type="text"
                            value={quickStyleName}
                            onChange={(e) => setQuickStyleName(e.target.value)}
                            placeholder="Style name **"
                            className="rounded border border-border px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            value={quickStyleSeason}
                            onChange={(e) => setQuickStyleSeason(e.target.value)}
                            placeholder="Season (optional)"
                            className="rounded border border-border px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            value={quickStyleDepartment}
                            onChange={(e) => setQuickStyleDepartment(e.target.value)}
                            placeholder="Department (optional)"
                            className="rounded border border-border px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="cursor-pointer rounded border border-border px-2 py-1 text-xs text-status-info-foreground hover:bg-status-info-subtle">
                            {quickStyleImageFile ? `Image: ${quickStyleImageFile.name}` : "Choose picture (optional)"}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                              onChange={onQuickStyleImageChange}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={createStyleInline}
                            disabled={creatingStyle}
                            className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {creatingStyle ? "Creating..." : "Create style"}
                          </button>
                        </div>
                      </div>
                    )}
                    {quickStyleNotice && (
                      <div className="rounded border border-status-warning/20 bg-status-warning-subtle px-2 py-1 text-xs text-status-warning-foreground">
                        {quickStyleNotice}
                      </div>
                    )}
                    {(selectedStyle || quotation.style_ref) && (
                      <div className="text-xs text-text-muted">
                        {selectedStyle ? `${selectedStyle.style_code} - ${selectedStyle.name}` : quotation.style_ref}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Intermediary / agent</label>
                    <LocalSearchSelect
                      className="w-full"
                      value={quotation.customer_intermediary_id ?? ""}
                      options={intermediaryOptions}
                      onChange={(next) =>
                        updateQuotationHeader({ customer_intermediary_id: next === "" ? null : Number(next) })
                      }
                      placeholder={intermediaryOptions.length ? "None" : "No intermediary linked to this customer"}
                      aria-label="Intermediary"
                      allowClear
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Shipping term</label>
                    <select
                      value={quotation.shipping_term ?? ""}
                      onChange={(e) => updateQuotationHeader({ shipping_term: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <option value="">Select shipping term</option>
                      {withLegacyOption(quotation.shipping_term, SHIPPING_TERM_OPTIONS).map((term) => (
                        <option key={term} value={term}>
                          {SHIPPING_TERM_OPTIONS.includes(term as (typeof SHIPPING_TERM_OPTIONS)[number])
                            ? term
                            : `${term} (legacy)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Department</label>
                    <input
                      type="text"
                      value={quotation.department ?? ""}
                      onChange={(e) => updateQuotationHeader({ department: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Projected quantity</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={quotation.projected_quantity ?? ""}
                      onChange={(e) =>
                        updateQuotationHeader({ projected_quantity: e.target.value ? Number(e.target.value) : null })
                      }
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                    {dozenFirst ? (
                      <p className="mt-1 text-xs text-text-muted">
                        Costing is per dozen (12 pcs), so you can quote before the quantity is known. A quantity is only
                        needed for whole-order amounts such as a fixed commission.
                      </p>
                    ) : (
                      toSafeNumber(quotation.projected_quantity) <= 0 && (
                        <p className="mt-1 text-xs text-text-muted">
                          Material subtotals and CM order totals use this quantity. Set it above zero for costing to show
                          amounts.
                        </p>
                      )
                    )}
                  </div>
                  <div className="sm:col-span-2 -mt-1 border-t border-border-subtle pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Currencies and FX</div>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Buyer target (reference)</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={quotation.target_price ?? ""}
                        onChange={(e) => updateQuotationHeader({ target_price: e.target.value || null })}
                        className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                      />
                      <select
                        value={quotation.target_price_currency ?? "USD"}
                        onChange={(e) => updateQuotationHeader({ target_price_currency: e.target.value || null })}
                        className="w-24 rounded-lg border border-border px-2 py-2 text-sm"
                      >
                        {currencyOptions.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Quotation date</label>
                    <input
                      type="date"
                      value={quotation.quotation_date ? quotation.quotation_date.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateQuotationHeader({ quotation_date: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Projected delivery date</label>
                    <input
                      type="date"
                      value={quotation.projected_delivery_date ? quotation.projected_delivery_date.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateQuotationHeader({ projected_delivery_date: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Valid until</label>
                    <input
                      type="date"
                      value={quotation.valid_until ? quotation.valid_until.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateQuotationHeader({ valid_until: e.target.value || null })
                      }
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Exchange rate (header FX)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.0001"
                        min={0}
                        value={quotation.exchange_rate ?? ""}
                        onChange={(e) => updateQuotationHeader({ exchange_rate: e.target.value })}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={refreshExchangeRates}
                        disabled={fetchingRates}
                        className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-text-secondary disabled:opacity-60"
                      >
                        {fetchingRates ? "Syncing..." : "Sync rate"}
                      </button>
                    </div>
                    {rateSource && (
                      <p className="mt-1 text-xs text-text-muted">
                        {rateSource === "live" ? "Live rate loaded." : "Fallback rate loaded."}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-text-muted">
                      BDT per 1 unit of document / quote currency (for local books and line local amounts). “Sync rate” uses live USD cross-rates. Cost lines can use their own currency and FX below.
                    </p>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Document / quote currency</label>
                    <select
                      value={quotation.currency ?? "USD"}
                      onChange={(e) => updateQuotationHeader({ currency: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      {currencyOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-text-muted">
                      Reporting / book currency (numéraire):{" "}
                      <span className="font-medium text-text-secondary">
                        {quotation.commercial_book_currency ?? quotation.currency ?? "—"}
                      </span>
                      . Costing line rollups use document currency; tenant override{" "}
                      <code className="rounded bg-surface-subtle px-0.5">feature_flags.commercial_book_currency</code>{" "}
                      can fix a single reporting code across documents.
                    </p>
                  </div>
                  {dozenFirst ? (
                    <div className="sm:col-span-2 rounded-lg border border-status-info/20 bg-status-info-subtle px-3 py-2 text-xs text-text-secondary">
                      Margin method, margin %, and the price per piece are set in the <strong>FOB Studio</strong> panel on
                      the right.
                    </div>
                  ) : (
                  <>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Markup on factory cost (%)</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={quotation.profit_percentage ?? ""}
                      onChange={(e) => updateQuotationHeader({ profit_percentage: e.target.value })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2 rounded-lg border border-border bg-surface-subtle p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={useManualQuotedPrice}
                          onChange={(e) => setUseManualQuotedPrice(e.target.checked)}
                        />
                        Manual quoted price override
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!useManualQuotedPrice}
                        value={manualQuotedPrice}
                        onChange={(e) => setManualQuotedPrice(e.target.value)}
                        placeholder="Auto"
                        className="w-40 rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
                      />
                    </div>
                  </div>
                  </>
                  )}
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Commission mode</label>
                    <select
                      value={quotation.commission_mode ?? ""}
                      onChange={(e) => updateQuotationHeader({ commission_mode: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <option value="">Select mode</option>
                      {withLegacyOption(quotation.commission_mode, COMMISSION_MODE_OPTIONS).map((mode) => (
                        <option key={mode} value={mode}>
                          {COMMISSION_MODE_OPTIONS.includes(mode as (typeof COMMISSION_MODE_OPTIONS)[number])
                            ? mode
                            : `${mode} (legacy)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Commission type</label>
                    <select
                      value={quotation.commission_type ?? ""}
                      onChange={(e) => updateQuotationHeader({ commission_type: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <option value="">Select type</option>
                      {withLegacyOption(quotation.commission_type, COMMISSION_TYPE_OPTIONS).map((type) => (
                        <option key={type} value={type}>
                          {COMMISSION_TYPE_OPTIONS.includes(type as (typeof COMMISSION_TYPE_OPTIONS)[number])
                            ? type
                            : `${type} (legacy)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Commission value</label>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={quotation.commission_value ?? ""}
                      onChange={(e) => updateQuotationHeader({ commission_value: e.target.value })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">Pack ratio</label>
                    <input
                      type="text"
                      value={quotation.pack_ratio ?? ""}
                      onChange={(e) => updateQuotationHeader({ pack_ratio: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-text-secondary">PCS per carton</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={quotation.pcs_per_carton ?? ""}
                      onChange={(e) =>
                        updateQuotationHeader({ pcs_per_carton: e.target.value ? Number(e.target.value) : null })
                      }
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-0.5 block font-medium text-text-secondary">Notes / Assumptions</label>
                  <textarea
                    rows={3}
                    value={quotation.notes ?? ""}
                    onChange={(e) => updateQuotationHeader({ notes: e.target.value || null })}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="Add commercial assumptions, exclusions, and remarks."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm text-text-secondary">
                <div><span className="font-medium">Customer:</span> {customer?.name ?? `#${quotation.customer_id}`}</div>
                <div><span className="font-medium">Department:</span> {quotation.department ?? "—"}</div>
                <div><span className="font-medium">Style:</span> {quotation.style_name ?? quotation.style_ref ?? "—"}</div>
                <div><span className="font-medium">Shipping:</span> {quotation.shipping_term ?? "—"}</div>
                <div>
                  <span className="font-medium">Commission:</span> {quotation.commission_mode ?? "-"} /{" "}
                  {quotation.commission_type ?? "-"} /{" "}
                  {commissionValueLabel(quotation.commission_type, quotation.commission_value)}
                </div>
              </div>
            )}
          </CollapsibleSection>

          <QuotationWiringPanel
            quotation={quotation}
            isNew={isNew}
            isEditing={isEditing}
            locked={isQuotationCostingLocked(quotation.status, isSuperseded)}
            prefill={wiringPrefill}
            wiring={wiringContext}
            items={items}
            units={units}
            materials={materials}
            sizeRatios={sizeRatios}
            projectedQty={projectedQty}
            setMaterials={setMaterials}
            setManufacturing={setManufacturing}
            setOtherCosts={setOtherCosts}
            setSizeRatios={setSizeRatios}
            updateQuotationHeader={updateQuotationHeader}
          />

          <CollapsibleSection
            id="section-materials"
            title="Materials"
            actions={isEditing ? (
              <button
                type="button"
                onClick={() =>
                  setMaterials((rows) => [
                    ...rows,
                    {
                      serial_no: rows.length + 1,
                      category_id: null,
                      item_id: null,
                      description: null,
                      unit: "",
                      consumption_per_dozen: "0",
                      unit_price: "0",
                      amount_per_dozen: "0",
                      total_amount: "0",
                      currency: quotation.currency ?? "USD",
                      exchange_rate: "1",
                      base_amount: "0",
                      local_amount: "0",
                    },
                  ])
                }
                className="no-print rounded-lg border border-border px-3 py-1 text-xs text-text-secondary bg-surface-raised"
              >
                + Add Material
              </button>
            ) : null}
          >
            {materials.length === 0 ? (
              <div className="text-xs text-text-muted">No material lines.</div>
            ) : (
              <div className="relative max-h-[440px] overflow-auto rounded-lg border border-border-subtle">
                <table className="min-w-[980px] w-full text-sm">
                  <caption className="sr-only">Quotation material lines and costs</caption>
                  <thead className="sticky top-0 z-[1] border-b border-border bg-surface-subtle text-text-muted">
                    <tr>
                      <th scope="col" className="px-2 py-2 text-left">#</th>
                      <th scope="col" className="px-2 py-2 text-left">Material Category</th>
                      <th scope="col" className="px-2 py-2 text-left">Item / Description</th>
                      <th scope="col" className="px-2 py-2 text-left">UOM</th>
                      <th scope="col" className="px-2 py-2 text-right">Consumption / Doz</th>
                      {dozenFirst ? <th scope="col" className="px-2 py-2 text-right">Wastage %</th> : null}
                      <th scope="col" className="px-2 py-2 text-right">Unit Price</th>
                      <th scope="col" className="px-2 py-2 text-left">Curr</th>
                      <th scope="col" className="px-2 py-2 text-right">FX rate</th>
                      <th scope="col" className="px-2 py-2 text-right">{dozenFirst ? "Cost / dozen" : "Subtotal"}</th>
                      <th scope="col" className="px-2 py-2 text-right">% Total</th>
                      <th scope="col" className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m, idx) => (
                      <tr key={m._rowKey ?? idx} className="border-b border-border-subtle even:bg-surface-subtle/30 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <LocalSearchSelect
                                className="min-w-0 flex-1"
                                value={m.category_id ?? ""}
                                onChange={(next) =>
                                  onMaterialChange(idx, {
                                    category_id: next === "" ? null : Number(next),
                                    item_id: null,
                                    unit: "",
                                  })
                                }
                                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                                placeholder="—"
                                aria-label={`Material category row ${idx + 1}`}
                                menuPortal
                              />
                              <button
                                type="button"
                                className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-surface-subtle"
                                onClick={() => setQuickAdd({ kind: "category", rowIdx: idx })}
                                title="Add category"
                              >
                                + Add
                              </button>
                            </div>
                          ) : (
                            findCategoryName(m.category_id ?? null) || "—"
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <div className="space-y-1">
                              <MaterialItemCombobox
                                items={items}
                                categoryId={m.category_id ?? null}
                                itemId={m.item_id ?? null}
                                onSelect={(it) =>
                                  onMaterialChange(idx, {
                                    item_id: it?.id ?? null,
                                    description: it ? it.name : m.description,
                                  })
                                }
                                onRequestCreateNew={() => setQuickAdd({ kind: "item", rowIdx: idx })}
                              />
                              <input
                                type="text"
                                value={m.description ?? ""}
                                onChange={(e) => onMaterialChange(idx, { description: e.target.value || null })}
                                className="w-full rounded border border-border px-1 py-1 text-xs"
                                placeholder="Description override"
                              />
                            </div>
                          ) : (
                            findItemName(m.item_id ?? null) || m.description || "—"
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={m.unit ?? ""}
                              readOnly={m.item_id != null}
                              title={
                                m.item_id != null
                                  ? "UOM comes from the selected item"
                                  : "Select an item to set UOM automatically"
                              }
                              onChange={(e) => onMaterialChange(idx, { unit: e.target.value || null })}
                              className={`w-full rounded border border-border px-1 py-1 text-xs ${
                                m.item_id != null ? "cursor-not-allowed bg-surface-subtle" : ""
                              }`}
                            />
                          ) : (
                            m.unit ?? "—"
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              value={m.consumption_per_dozen}
                              onChange={(e) => onMaterialChange(idx, { consumption_per_dozen: e.target.value })}
                              className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.consumption_per_dozen
                          )}
                        </td>
                        {dozenFirst ? (
                          <td className="px-2 py-1 text-right">
                            {isEditing ? (
                              <input
                                type="number"
                                min={0}
                                max={1000}
                                step="any"
                                value={m.wastage_pct ?? ""}
                                onChange={(e) => onMaterialChange(idx, { wastage_pct: e.target.value || null })}
                                aria-label={`Wastage percent row ${idx + 1}`}
                                placeholder="0"
                                className="w-16 rounded border border-border px-1 py-1 text-right text-xs"
                              />
                            ) : (
                              m.wastage_pct ?? "0"
                            )}
                          </td>
                        ) : null}
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <>
                              <input
                                type="number"
                                min={0}
                                step="0.0001"
                                value={m.unit_price}
                                onChange={(e) => onMaterialChange(idx, { unit_price: e.target.value })}
                                className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                              />
                              {(() => {
                                const hintRow = m.item_id != null ? priceHints[m.item_id] : undefined;
                                const text = comparableHintText(hintRow, m.currency ?? quotation.currency);
                                const price = hintRow?.last_po?.unit_price;
                                if (!text || !price) return null;
                                return (
                                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-text-muted">
                                    <span>{text}</span>
                                    {m.unit_price !== price ? (
                                      <button
                                        type="button"
                                        className="rounded border border-border px-1 text-brand-primary hover:bg-surface-subtle"
                                        onClick={() => onMaterialChange(idx, { unit_price: price })}
                                        aria-label={`Use last PO price for row ${idx + 1}`}
                                      >
                                        Use
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </>
                          ) : (
                            m.unit_price
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <select
                              value={m.currency ?? quotation.currency ?? "USD"}
                              onChange={(e) => onMaterialChange(idx, { currency: e.target.value || "USD" })}
                              className="w-full rounded border border-border px-1 py-1 text-xs"
                            >
                              {currencyOptions.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          ) : (
                            m.currency ?? "USD"
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              value={m.exchange_rate}
                              onChange={(e) => onMaterialChange(idx, { exchange_rate: e.target.value })}
                              className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.exchange_rate
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-medium">
                          {formatMoney(toSafeNumber(dozenFirst ? m.amount_per_dozen : m.total_amount))}
                        </td>
                        <td className="px-2 py-1 text-right text-text-muted">
                          {matBase > 0
                            ? `${((toSafeNumber(dozenFirst ? m.amount_per_dozen : m.total_amount) / matBase) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing && (
                            <QuotationRowActions
                              rowKey={`material-${idx}`}
                              openKey={openRowActions}
                              setOpenKey={setOpenRowActions}
                              onDelete={() => setMaterials((rows) => rows.filter((_, rowIndex) => rowIndex !== idx))}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-surface-raised">
                    <tr className="border-t border-border bg-surface-subtle">
                      <td colSpan={dozenFirst ? 9 : 8} className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">
                        {dozenFirst ? "Material cost per dozen" : "Material Total"}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-text-primary">
                        {formatMoney(matBase)} {quotation.currency ?? ""}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="section-cm"
            title="Labor / CM (Cut and Make)"
            actions={isEditing ? (
              <button
                type="button"
                onClick={() =>
                  setManufacturing((rows) => [
                    ...rows,
                    {
                      serial_no: rows.length + 1,
                      ...(dozenFirst
                        ? { cm_mode: "SMV_CPM" as const, cpm_basis: "EARNED_MIN" as const, working_hours_per_day: "8" }
                        : {}),
                      style_part: "",
                      machines_required: 0,
                      production_per_hour: "0",
                      production_per_day: "0",
                      cost_per_machine: "0",
                      total_line_cost: "0",
                      cost_per_dozen: "0",
                      cm_per_piece: "0",
                      total_order_cost: "0",
                      currency: quotation.currency ?? "USD",
                      exchange_rate: "1",
                      base_amount: "0",
                      local_amount: "0",
                    },
                  ])
                }
                className="no-print rounded-lg border border-border px-3 py-1 text-xs text-text-secondary bg-surface-raised"
              >
                + Add CM
              </button>
            ) : null}
          >
            <ManufacturingWiringHint prefill={wiringPrefill} wiring={wiringContext} />
            {manufacturing.length === 0 ? (
              <div className="text-xs text-text-muted">No manufacturing lines.</div>
            ) : dozenFirst ? (
              <div className="space-y-2">
                <DozenCmLines
                  rows={manufacturing}
                  isEditing={isEditing}
                  docCur={docCur}
                  currencyOptions={currencyOptions}
                  onChange={onManufacturingChange}
                  renderRowActions={(idx) => (
                    <QuotationRowActions
                      rowKey={`cm-${idx}`}
                      openKey={openRowActions}
                      setOpenKey={setOpenRowActions}
                      onDelete={() => setManufacturing((rows) => rows.filter((_, rowIndex) => rowIndex !== idx))}
                    />
                  )}
                />
                <div className="flex items-center justify-end gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
                  <span className="font-semibold text-text-secondary">Labor / CM per dozen</span>
                  <span className="font-bold text-text-primary">
                    {formatMoney(mfgBase)} {quotation.currency ?? ""}
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative max-h-[420px] overflow-auto">
                <table className="min-w-[1020px] w-full text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-border bg-surface-subtle text-text-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Style part</th>
                      <th className="px-2 py-2 text-right">Machines</th>
                      <th className="px-2 py-2 text-right">Prod/hr</th>
                      <th className="px-2 py-2 text-right">Prod/day</th>
                      <th className="px-2 py-2 text-right">Cost/machine</th>
                      <th className="px-2 py-2 text-right">Total line</th>
                      <th className="px-2 py-2 text-right">CM/pc</th>
                      <th className="px-2 py-2 text-left">Curr</th>
                      <th className="px-2 py-2 text-right">FX rate</th>
                      <th className="px-2 py-2 text-right">Subtotal</th>
                      <th className="px-2 py-2 text-right">% Total</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manufacturing.map((m, idx) => (
                      <tr key={idx} className="border-b border-border-subtle even:bg-surface-subtle/30 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={m.style_part}
                              onChange={(e) => onManufacturingChange(idx, { style_part: e.target.value })}
                              className="w-full rounded border border-border px-1 py-1 text-xs"
                            />
                          ) : (
                            m.style_part || "—"
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={m.machines_required === 0 && machinesBlank[idx] ? "" : m.machines_required}
                              onChange={(e) => {
                                const blank = e.target.value === "";
                                setMachinesBlank((prev) => ({ ...prev, [idx]: blank }));
                                onManufacturingChange(idx, { machines_required: blank ? 0 : Number(e.target.value) });
                              }}
                              className="w-16 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.machines_required
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.production_per_hour}
                              onChange={(e) => onManufacturingChange(idx, { production_per_hour: e.target.value })}
                              className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.production_per_hour
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.production_per_day}
                              onChange={(e) => onManufacturingChange(idx, { production_per_day: e.target.value })}
                              className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                              title="Auto from prod/hr × machines × 8h; edit to override"
                            />
                          ) : (
                            m.production_per_day
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={m.cost_per_machine}
                              onChange={(e) => onManufacturingChange(idx, { cost_per_machine: e.target.value })}
                              className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.cost_per_machine
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{m.total_line_cost}</td>
                        <td className="px-2 py-1 text-right">{m.cm_per_piece}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <select
                              value={m.currency ?? docCur}
                              onChange={(e) => onManufacturingChange(idx, { currency: e.target.value })}
                              className="w-full min-w-[4.5rem] rounded border border-border px-1 py-1 text-xs"
                            >
                              {currencyOptions.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">{m.currency ?? docCur}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.000001"
                              value={m.exchange_rate}
                              onChange={(e) => onManufacturingChange(idx, { exchange_rate: e.target.value })}
                              className="w-24 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.exchange_rate
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-medium">{m.total_order_cost}</td>
                        <td className="px-2 py-1 text-right text-text-muted">
                          {totals.mfgTotal > 0
                            ? `${((mfgLineInQuotation(m) / totals.mfgTotal) * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing && (
                            <QuotationRowActions
                              rowKey={`cm-${idx}`}
                              openKey={openRowActions}
                              setOpenKey={setOpenRowActions}
                              onDelete={() => setManufacturing((rows) => rows.filter((_, rowIndex) => rowIndex !== idx))}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-surface-raised">
                    <tr className="border-t border-border bg-surface-subtle">
                      <td colSpan={10} className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">
                        Labor / CM Total
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-text-primary">
                        {formatMoney(totals.mfgTotal)} {quotation.currency ?? ""}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="section-other"
            title="Other Commercial Costs (Washing, Overheads, Logistics)"
            actions={
              isEditing ? (
                <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
                  {OTHER_COST_PRESETS.map((p) => (
                    <button
                      key={p.cost_head}
                      type="button"
                      onClick={() => appendOtherCostPreset(p)}
                      className="no-print whitespace-nowrap rounded-lg border border-border bg-surface-raised px-2 py-1 text-[10px] text-text-secondary hover:bg-surface-subtle"
                    >
                      + {p.cost_head}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const { matTotal, mfgTotal } = calculateQuotationTotals(
                        materials,
                        manufacturing,
                        [],
                        quotation?.currency ?? "USD",
                      );
                      setOtherCosts((rows) => {
                        const blank: QuotationOtherCostLine = applyOtherCostCalculation(
                          {
                            serial_no: rows.length + 1,
                            cost_head: "",
                            percentage: "0",
                            total_amount: "0",
                            cost_type: "fixed",
                            value: "0",
                            based_on: "subtotal",
                            cost_basis: dozenFirst ? "PER_DOZEN" : null,
                            calculated_amount: "0",
                            notes: null,
                            currency: quotation.currency ?? "USD",
                            exchange_rate: "1",
                            base_amount: "0",
                            local_amount: "0",
                          },
                          matTotal,
                          mfgTotal,
                        );
                        return [...rows, { ...blank, serial_no: rows.length + 1 }];
                      });
                    }}
                    className="no-print rounded-lg border border-border px-3 py-1 text-xs text-text-secondary bg-surface-raised"
                  >
                    + Add Cost Head
                  </button>
                </div>
              ) : null
            }
          >
            {otherCosts.length === 0 ? (
              <div className="text-xs text-text-muted">No other cost lines.</div>
            ) : (
              <div className="relative max-h-[420px] overflow-auto">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-border bg-surface-subtle text-text-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Cost head</th>
                      <th className="px-2 py-2 text-left">Type</th>
                      <th className="px-2 py-2 text-right">Value</th>
                      {dozenFirst ? <th className="px-2 py-2 text-left">Basis (fixed)</th> : null}
                      <th className="px-2 py-2 text-left">Based on</th>
                      <th className="px-2 py-2 text-left">Curr</th>
                      <th className="px-2 py-2 text-right">FX rate</th>
                      <th className="px-2 py-2 text-right">{dozenFirst ? "Cost / dozen" : "Amount"}</th>
                      <th className="px-2 py-2 text-right">% Total</th>
                      <th className="px-2 py-2 text-left">Notes</th>
                      <th className="px-2 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherCosts.map((c, idx) => (
                      <tr key={c._rowKey ?? idx} className="border-b border-border-subtle even:bg-surface-subtle/30 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={c.cost_head}
                              onChange={(e) => onOtherCostChange(idx, { cost_head: e.target.value })}
                              className="w-full rounded border border-border px-1 py-1 text-xs"
                            />
                          ) : (
                            c.cost_head || "—"
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <select
                              value={c.cost_type}
                              onChange={(e) => onOtherCostChange(idx, { cost_type: e.target.value })}
                              className="w-full rounded border border-border px-1 py-1 text-xs"
                            >
                              <option value="fixed">Fixed</option>
                              <option value="percentage">Percentage</option>
                            </select>
                          ) : (
                            c.cost_type
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={c.value}
                              onChange={(e) => onOtherCostChange(idx, { value: e.target.value })}
                              className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            c.value
                          )}
                        </td>
                        {dozenFirst ? (
                          <td className="px-2 py-1">
                            {c.cost_type === "percentage" ? (
                              <span className="text-xs text-text-muted">—</span>
                            ) : isEditing ? (
                              <select
                                value={c.cost_basis ?? "PER_ORDER"}
                                onChange={(e) =>
                                  onOtherCostChange(idx, { cost_basis: e.target.value as QuotationOtherCostLine["cost_basis"] })
                                }
                                aria-label={`Cost basis row ${idx + 1}`}
                                className="w-full rounded border border-border px-1 py-1 text-xs"
                              >
                                <option value="PER_DOZEN">Per dozen</option>
                                <option value="PER_PIECE">Per piece</option>
                                <option value="PER_ORDER">Whole order</option>
                              </select>
                            ) : (
                              <span className="text-xs">
                                {{ PER_DOZEN: "Per dozen", PER_PIECE: "Per piece", PER_ORDER: "Whole order" }[c.cost_basis ?? "PER_ORDER"]}
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <select
                              value={(c.based_on || "subtotal").toLowerCase()}
                              onChange={(e) => onOtherCostChange(idx, { based_on: e.target.value })}
                              className="w-full rounded border border-border px-1 py-1 text-xs"
                              aria-label={`Based on row ${idx + 1}`}
                            >
                              <option value="subtotal">Subtotal</option>
                              <option value="materials">Materials</option>
                              <option value="manufacturing">Manufacturing</option>
                            </select>
                          ) : (
                            c.based_on
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <select
                              value={c.currency ?? docCur}
                              disabled={c.cost_type === "percentage"}
                              onChange={(e) => onOtherCostChange(idx, { currency: e.target.value })}
                              className="w-full min-w-[4.5rem] rounded border border-border px-1 py-1 text-xs"
                            >
                              {currencyOptions.map((code) => (
                                <option key={code} value={code}>
                                  {code}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">{c.currency ?? docCur}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.000001"
                              min={0}
                              disabled={c.cost_type === "percentage"}
                              value={c.exchange_rate}
                              onChange={(e) => onOtherCostChange(idx, { exchange_rate: e.target.value })}
                              className="w-24 rounded border border-border px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            c.exchange_rate
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-medium">
                          {dozenFirst
                            ? formatMoney(dozenResult?.otherCosts[otherResultIndex[idx] ?? -1]?.amountPerDozen ?? 0)
                            : c.calculated_amount || c.total_amount}
                        </td>
                        <td className="px-2 py-1 text-right text-text-muted">
                          {dozenFirst
                            ? otherBase > 0
                              ? `${(((dozenResult?.otherCosts[otherResultIndex[idx] ?? -1]?.amountPerDozen ?? 0) / otherBase) * 100).toFixed(1)}%`
                              : "—"
                            : totals.otherTotal > 0
                              ? `${((otherLineInQuotation(c) / totals.otherTotal) * 100).toFixed(1)}%`
                              : "—"}
                        </td>
                        <td className="px-2 py-1 align-top">
                          {isEditing ? (
                            <input
                              type="text"
                              value={c.notes ?? ""}
                              onChange={(e) => onOtherCostChange(idx, { notes: e.target.value || null })}
                              className="w-full min-w-[100px] rounded border border-border px-1 py-1 text-xs"
                              placeholder="Optional"
                            />
                          ) : (
                            <span className="text-xs text-text-muted">{c.notes ?? "—"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing && (
                            <QuotationRowActions
                              rowKey={`other-${idx}`}
                              openKey={openRowActions}
                              setOpenKey={setOpenRowActions}
                              onDelete={() => setOtherCosts((rows) => rows.filter((_, rowIndex) => rowIndex !== idx))}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-surface-raised">
                    <tr className="border-t border-border bg-surface-subtle">
                      <td colSpan={dozenFirst ? 8 : 7} className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">
                        {dozenFirst ? "Other costs per dozen" : "Other Costs Total"}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-text-primary">
                        {formatMoney(otherBase)} {quotation.currency ?? ""}
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">100%</td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="section-size"
            title="Size Ratios"
            actions={isEditing ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={Boolean(quotation.size_ratio_enabled)}
                    onChange={(e) => updateQuotationHeader({ size_ratio_enabled: e.target.checked })}
                  />
                  Enable
                </label>
                <button
                  type="button"
                  onClick={() => applySizePreset(["25", "25", "25", "25"])}
                  className="no-print rounded-lg border border-border px-2 py-1 text-xs text-text-secondary bg-surface-raised"
                >
                  Equal preset
                </button>
                <button
                  type="button"
                  onClick={() => applySizePreset(["15", "35", "35", "15"])}
                  className="no-print rounded-lg border border-border px-2 py-1 text-xs text-text-secondary bg-surface-raised"
                >
                  Pyramid preset
                </button>
                <button
                  type="button"
                  onClick={() => setSizeRatioCollapsed((prev) => !prev)}
                  className="no-print rounded-lg border border-border px-2 py-1 text-xs text-text-secondary bg-surface-raised"
                >
                  {sizeRatioCollapsed ? "Expand" : "Collapse"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSizeRatios((rows) => [
                      ...rows,
                      { serial_no: rows.length + 1, size: "", ratio_percentage: "0", fabric_factor: "1.0", quantity: 0 },
                    ])
                  }
                  className="no-print rounded-lg border border-border px-3 py-1 text-xs text-text-secondary bg-surface-raised"
                >
                  + Add Size
                </button>
              </div>
            ) : null}
          >
            {!quotation.size_ratio_enabled ? (
              <div className="text-xs text-text-muted">Size ratio is disabled.</div>
            ) : sizeRatioCollapsed ? (
              <div className="text-xs text-text-muted">Size ratio section collapsed.</div>
            ) : sizeRatios.length === 0 ? (
              <div className="text-xs text-text-muted">No size ratios.</div>
            ) : (
              <>
                <div className="relative max-h-[360px] overflow-auto">
                  <table className="min-w-[860px] w-full text-sm">
                    <thead className="sticky top-0 z-[1] border-b border-border bg-surface-subtle text-text-muted">
                      <tr>
                        <th className="px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">Size</th>
                        <th className="px-2 py-2 text-right">Ratio %</th>
                        <th className="px-2 py-2 text-right">Fabric factor</th>
                        <th className="px-2 py-2 text-right">Weighted</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        {isEditing && <th className="px-2 py-2 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sizeRatios.map((s, idx) => {
                        const weighted = toSafeNumber(s.ratio_percentage) * toSafeNumber(s.fabric_factor);
                        return (
                          <tr key={idx} className="border-b border-border-subtle even:bg-surface-subtle/30 last:border-0">
                            <td className="px-2 py-1">{idx + 1}</td>
                            <td className="px-2 py-1">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={s.size}
                                  onChange={(e) => onSizeRatioChange(idx, { size: e.target.value })}
                                  className="w-20 rounded border border-border px-1 py-1 text-xs"
                                />
                              ) : (
                                s.size
                              )}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={s.ratio_percentage}
                                  onChange={(e) => {
                                    const nextRatio = e.target.value;
                                    onSizeRatioChange(idx, {
                                      ratio_percentage: nextRatio,
                                      quantity: sizeQuantityFromRatio(projectedQty, nextRatio),
                                    });
                                    setSizeQtyBlank((prev) => ({ ...prev, [idx]: false }));
                                  }}
                                  className="w-16 rounded border border-border px-1 py-1 text-right text-xs"
                                />
                              ) : (
                                s.ratio_percentage
                              )}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={s.fabric_factor}
                                  onChange={(e) => onSizeRatioChange(idx, { fabric_factor: e.target.value })}
                                  className="w-16 rounded border border-border px-1 py-1 text-right text-xs"
                                />
                              ) : (
                                s.fabric_factor
                              )}
                            </td>
                            <td className="px-2 py-1 text-right text-text-muted">{weighted.toFixed(2)}</td>
                            <td className="px-2 py-1 text-right">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={s.quantity === 0 && sizeQtyBlank[idx] ? "" : s.quantity}
                                  onChange={(e) => {
                                    const blank = e.target.value === "";
                                    setSizeQtyBlank((prev) => ({ ...prev, [idx]: blank }));
                                    onSizeRatioChange(idx, { quantity: blank ? 0 : Number(e.target.value) });
                                  }}
                                  className="w-20 rounded border border-border px-1 py-1 text-right text-xs"
                                />
                              ) : (
                                s.quantity
                              )}
                            </td>
                            {isEditing && (
                              <td className="px-2 py-1 text-right">
                                <QuotationRowActions
                                  rowKey={`size-${idx}`}
                                  openKey={openRowActions}
                                  setOpenKey={setOpenRowActions}
                                  onDelete={() => setSizeRatios((rows) => rows.filter((_, rowIdx) => rowIdx !== idx))}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 bg-surface-raised">
                      <tr className="border-t border-border bg-surface-subtle">
                        <td colSpan={5} className="px-2 py-2 text-right text-sm font-semibold text-text-secondary">
                          Total Qty
                        </td>
                        <td className="px-2 py-2 text-right text-sm font-bold text-text-primary">
                          {sizeRatios.reduce((acc, row) => acc + (row.quantity ?? 0), 0).toLocaleString()}
                        </td>
                        {isEditing && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {Math.abs(ratioSum - 100) > 0.5 && (
                  <div
                    className="no-print mt-2 rounded border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground"
                    role="alert"
                  >
                    Size ratios add up to {ratioSum.toFixed(1)}%, not 100%. Quantities will not match the projected
                    quantity.
                  </div>
                )}
                <div className="no-print mt-3 grid grid-cols-1 gap-2 rounded-lg border border-border-subtle bg-surface-subtle/50 p-3 text-xs text-text-secondary sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="font-semibold text-text-primary">Ratio total: </span>
                    {sizeRatios.reduce((a, r) => a + toSafeNumber(r.ratio_percentage), 0).toFixed(1)}%
                  </div>
                  <div>
                    <span className="font-semibold text-text-primary">Weighted total: </span>
                    {sizeRatios
                      .reduce((a, r) => a + toSafeNumber(r.ratio_percentage) * toSafeNumber(r.fabric_factor), 0)
                      .toFixed(2)}
                  </div>
                  <div>
                    <span className="font-semibold text-text-primary">Total cartons (est.): </span>
                    {(() => {
                      const q = sizeRatios.reduce((acc, row) => acc + (row.quantity ?? 0), 0);
                      const pcs = toSafeNumber(quotation.pcs_per_carton);
                      if (pcs <= 0) return "— (set PCS per carton)";
                      return (q / pcs).toLocaleString(undefined, { maximumFractionDigits: 1 });
                    })()}
                  </div>
                  <div>
                    <span className="font-semibold text-text-primary">Pack context: </span>
                    {quotation.pack_ratio?.trim() ? quotation.pack_ratio : "—"} ·{" "}
                    {quotation.pcs_per_carton != null && quotation.pcs_per_carton > 0
                      ? `${quotation.pcs_per_carton} pcs/ctn`
                      : "pcs/ctn not set"}
                  </div>
                </div>
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection id="section-breakdown" title="Final Commercial Breakdown" defaultOpen={!isPrintMode}>
            <div
              className="mb-3 rounded-lg border border-status-warning/30 bg-status-warning-subtle/40 p-3 text-xs text-text-secondary"
              role="note"
            >
              <span className="font-semibold text-text-primary">Protected commercial rollup: </span>
              FOB cost, quoted price, margin %, and FX-derived totals are controlled fields. Edit underlying costing
              lines; when the quotation is locked, use change requests. AI costing / benchmark panels are advisory unless
              you explicitly apply reviewed suggestions.
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-subtle p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">FOB Cost</div>
                <div className="text-xl font-bold text-text-primary">
                  {formatMoney(toSafeNumber(quotation.total_cost) || totals.total)} {quotation.currency ?? ""}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Factory Margin</div>
                <div className="text-xl font-bold text-brand-primary">
                  {formatMoney(factoryMarginAmount)} ({factoryMarginPercent.toFixed(1)}%)
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Agency Commission</div>
                <div className="text-xl font-bold text-text-primary">
                  {commissionValueLabel(quotation.commission_type, quotation.commission_value)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Final Quoted Price</div>
                <div className="text-xl font-bold text-brand-primary">
                  {formatMoney(toSafeNumber(quotation.quoted_price ?? quotation.total_amount))} {quotation.currency ?? ""}
                </div>
                {dozenFirst ? (
                  <div className="text-xs text-text-muted">
                    {toSafeNumber(quotation.quoted_price_per_piece).toFixed(4)} per piece · {" "}
                    {toSafeNumber(quotation.quoted_price_per_dozen).toFixed(4)} per dozen
                  </div>
                ) : null}
              </div>
            </div>
          </CollapsibleSection>

          {!isNew && (
            <LinkedRecordsSection
              className="no-print"
              title="Related records"
              columns={[
                { title: "Customer", rows: linkedCustomerRows },
                { title: "Inquiry", rows: linkedInquiryRows },
                { title: "Style", rows: linkedStyleRows },
                { title: "Converted order", rows: linkedOrderRows },
              ]}
            />
          )}

          <div className="text-xs text-text-muted">
            Updated at {new Date(quotation.updated_at).toLocaleString()}
          </div>

          <section className="print-only print-card rounded-xl border border-border bg-surface-raised p-4">
            <h3 className="text-sm font-semibold text-text-primary">Legal / Commercial Sign-off</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-text-secondary md:grid-cols-2">
              <div>
                <div><span className="font-semibold">Quotation Code:</span> {quotation.quotation_code}</div>
                <div><span className="font-semibold">Version:</span> {quotation.version_no}</div>
                <div><span className="font-semibold">Customer:</span> {customer?.name ?? `#${quotation.customer_id}`}</div>
                <div><span className="font-semibold">Currency:</span> {quotation.currency ?? "USD"}</div>
              </div>
              <div>
                <div><span className="font-semibold">FOB Cost:</span> {formatMoney(toSafeNumber(quotation.total_cost) || totals.total)}</div>
                <div><span className="font-semibold">Final Quoted Price:</span> {formatMoney(toSafeNumber(quotation.quoted_price ?? quotation.total_amount))}</div>
                <div><span className="font-semibold">Profit %:</span> {quotation.profit_percentage ?? "—"}</div>
                <div>
                  <span className="font-semibold">Commission:</span> {quotation.commission_mode ?? "-"} /{" "}
                  {quotation.commission_type ?? "-"} /{" "}
                  {commissionValueLabel(quotation.commission_type, quotation.commission_value)}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <div className="h-10 border-b border-border-strong" />
                <div className="mt-1 text-[11px] text-text-secondary">Prepared By</div>
              </div>
              <div>
                <div className="h-10 border-b border-border-strong" />
                <div className="mt-1 text-[11px] text-text-secondary">Reviewed By</div>
              </div>
              <div>
                <div className="h-10 border-b border-border-strong" />
                <div className="mt-1 text-[11px] text-text-secondary">Approved By</div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:col-span-4 2xl:col-span-3 self-start">
          {dozenFirst ? (
            <FobStudioCard
              quotation={quotation}
              costing={costing}
              isEditing={isEditing && !isSuperseded}
              useManualPrice={useManualQuotedPrice}
              setUseManualPrice={setUseManualQuotedPrice}
              manualPricePerPiece={manualQuotedPrice}
              setManualPricePerPiece={setManualQuotedPrice}
              updateHeader={updateQuotationHeader}
            />
          ) : (
            <>
          <CostSummaryCard
            currency={docCur}
            materialCost={quotation.material_cost}
            trimsCost={trimsCost}
            laborCost={quotation.manufacturing_cost}
            washFinishCost={washFinishCost}
            overheadCost={overheadCost}
            otherMiscCost={otherMiscCost}
            totalFobCost={quotation.total_cost}
            factoryMarginAmount={factoryMarginAmount}
            factoryMarginPercent={factoryMarginPercent}
          />
          <MarginPricingCard
            profitPercentage={quotation.profit_percentage}
            displayMarginPercent={factoryMarginPercent}
            commissionType={quotation.commission_type}
            commissionValue={quotation.commission_value}
            commissionAmount={commissionAmount}
            quotedPricePerPc={projectedQty > 0 ? quotedPriceNum / projectedQty : null}
            quotedOrderTotal={quotedPriceNum}
            costPerPc={costPerPc}
            currency={docCur}
          />
            </>
          )}
          <CostBreakdownCard
            currency={docCur}
            total={totals.total}
            rows={[
              { label: "Materials", value: quotation.material_cost ?? totals.matTotal },
              { label: "Manufacturing", value: quotation.manufacturing_cost ?? totals.mfgTotal },
              { label: "Other Costs", value: quotation.other_cost ?? totals.otherTotal },
              { label: "Commission", value: dozenFirst ? dozenCommissionOrder : commissionAmount },
            ]}
          />
          <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
            <h3 className="text-sm font-semibold text-text-primary">
              Scenario Compare (v{previousVersionQuote?.version_no ?? "-"} vs v{quotation.version_no})
            </h3>
            {previousVersionQuote ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">FOB Change</span>
                  <span className="font-semibold text-text-primary">
                    {(toSafeNumber(quotation.total_cost) || totals.total) - toSafeNumber(previousVersionQuote.total_cost) >= 0 ? "+" : ""}
                    {formatMoney((toSafeNumber(quotation.total_cost) || totals.total) - toSafeNumber(previousVersionQuote.total_cost))} {quotation.currency ?? ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Quoted Price Change</span>
                  <span className="font-semibold text-text-primary">
                    {(toSafeNumber(quotation.quoted_price ?? quotation.total_amount) - toSafeNumber(previousVersionQuote.quoted_price ?? previousVersionQuote.total_amount)) >= 0 ? "+" : ""}
                    {formatMoney(toSafeNumber(quotation.quoted_price ?? quotation.total_amount) - toSafeNumber(previousVersionQuote.quoted_price ?? previousVersionQuote.total_amount))} {quotation.currency ?? ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Profit % Change</span>
                  <span className="font-semibold text-text-primary">
                    {(toSafeNumber(quotation.profit_percentage) - toSafeNumber(previousVersionQuote.profit_percentage)) >= 0 ? "+" : ""}
                    {(toSafeNumber(quotation.profit_percentage) - toSafeNumber(previousVersionQuote.profit_percentage)).toFixed(2)}%
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-text-muted">
                No previous version found yet. Create a duplicate version to compare scenarios.
              </p>
            )}
          </section>
          {quotation.style_image_url ? (
            <section className="rounded-2xl border border-border bg-surface-raised p-4 shadow-sm print-card">
              <h3 className="text-sm font-semibold text-text-primary">Style Preview</h3>
              <SecureImage
                url={quotation.style_image_url}
                alt={quotation.style_name ?? quotation.style_ref ?? "Style"}
                className="mt-2 h-36 w-full rounded object-cover border border-border"
              />
            </section>
          ) : null}
          {!isPrintMode && (
            <>
              {quotation.id ? (
                <CommercialTimelineCard entityType="quotation" entityId={quotation.id} />
              ) : null}
              {quotation.id ? (
                <div id="section-change-requests" className="scroll-mt-24">
                <ChangeRequestPanel
                  entityType="quotation"
                  entityId={quotation.id}
                  entityStatus={quotation.status}
                  fieldDefs={QUOTATION_PROTECTED_FIELD_DEFS}
                  record={{
                    target_price: quotation.target_price,
                    target_price_currency: quotation.target_price_currency,
                    exchange_rate: quotation.exchange_rate,
                    quoted_price: quotation.quoted_price,
                    currency: quotation.currency,
                    total_amount: quotation.total_amount,
                    shipping_term: quotation.shipping_term,
                    commission_mode: quotation.commission_mode,
                    commission_type: quotation.commission_type,
                    commission_value: quotation.commission_value,
                    projected_quantity: quotation.projected_quantity,
                    projected_delivery_date: quotation.projected_delivery_date,
                    valid_until: quotation.valid_until,
                  }}
                />
                </div>
              ) : null}
              <details open className="group rounded-2xl border border-border bg-surface-raised shadow-sm">
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-text-primary">
                  Insights &amp; AI
                </summary>
                <div className="space-y-4 border-t border-border-subtle p-3">
                  <QuotationCostingIntelligencePanel quotation={quotation} />
                  <QuotationCostingSuggestionsPanel
                    quotation={quotation}
                    mode={showEditableHeader ? "edit" : "view"}
                    onAfterApply={() => void reloadQuotationDetail()}
                  />
                  <QuotationCostBenchmarkPanel quotation={quotation} />
                  {/* AI extract works before the first save (no quotation id); other AI actions need a saved quotation. */}
                  <QuotationAiPanel
                    ai={quotationAi}
                    quotationId={quotation.id || undefined}
                    formSnapshot={aiFormSnapshot}
                    mode={showEditableHeader ? "edit" : "view"}
                    quotationStatus={quotation.status}
                    onAfterApply={() => void reloadQuotationDetail()}
                  />
                  {quotation.id ? <QuotationAiAuditHistory quotationId={quotation.id} /> : null}
                </div>
              </details>
            </>
          )}
        </aside>
      </div>

      {quickAdd ? (
        <MasterQuickAddModal
          open
          onClose={() => setQuickAdd(null)}
          masterType={quickAdd.kind}
          defaultCategoryId={
            quickAdd.kind === "item"
              ? materials[quickAdd.rowIdx]?.category_id ?? undefined
              : undefined
          }
          categories={categories}
          units={units}
          subcategories={[]}
          onCreated={async (record) => {
            await refreshCostingMasters();
            const rowIdx = quickAdd.rowIdx;
            if (quickAdd.kind === "category" && rowIdx != null) {
              onMaterialChange(rowIdx, {
                category_id: record.id,
                item_id: null,
                unit: "",
              });
            }
            if (quickAdd.kind === "item" && rowIdx != null) {
              const inv = record as InventoryItemResponse;
              // InventoryItemResponse has every field CostingItemResponse needs,
              // so it works as an override even if the refreshed list is not yet in state.
              onMaterialChange(
                rowIdx,
                { item_id: inv.id, description: inv.name, category_id: inv.category_id },
                inv,
              );
            }
            setQuickAdd(null);
          }}
        />
      ) : null}
    </div>
  );
}
