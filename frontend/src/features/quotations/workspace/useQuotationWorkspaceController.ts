import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type CurrencyMasterResponse,
  type CostingItemResponse,
  type CustomerIntermediaryLinkResponse,
  type CustomerResponse,
  type InquiryResponse,
  type ItemCategoryResponse,
  type ItemUnitResponse,
  type QuotationDetailResponse,
  type QuotationResponse,
  type QuotationManufacturingLine,
  type QuotationMaterialLine,
  type QuotationOtherCostLine,
  type QuotationSizeRatioLine,
  type StyleResponse,
} from "@/api/client";
import { canConvertInquiryToQuotation, isInquiryOpenForQuotationLink } from "@/features/merch/workflow";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { logApiError } from "@/utils/logApiError";
import { buildQuotationFullUpdatePayload } from "./mappers/buildQuotationFullUpdatePayload";
import { calculateQuotationTotals } from "./mappers/calculateQuotationTotals";
import { resolveRate } from "./mappers/currencyFx";
import { quotationDirtyValues } from "./mappers/quotationDirtyValues";
import {
  applyOtherCostCalculation,
  computeAutoQuotedPrice,
  computeCostPerPiece,
  computeManufacturingLineAmounts,
  computeMaterialLineAmounts,
  localDateYmd,
  QUOTATION_MANUFACTURING_HOURS_PER_DAY,
  sizeQuantityFromRatio,
  toSafeNumber,
} from "./mappers/quotationNumeric";
import { getCustomersCached } from "@/lib/masterData";
import {
  applyResultToManufacturing,
  applyResultToMaterials,
  applyResultToOtherCosts,
  computeWorkspaceCosting,
  headerPatchFromResult,
  orderTotalsFromResult,
} from "./mappers/quotationCostingAdapter";
import { ensureRowKeys, needsRowKeys } from "./mappers/rowKeys";
import { useQuotationCostingAccuracyV1 } from "./quotationCostingFlags";

/**
 * A dozen-first quotation does not store a "manual price" flag. If the saved per-piece price differs
 * from what the engine calculates, the user typed it, so the manual box is shown again.
 * Returns the manual per-piece price, or null when the saved price is the calculated one.
 */
function savedManualPricePerPiece(
  q: QuotationDetailResponse,
  mats: QuotationMaterialLine[],
  mfg: QuotationManufacturingLine[],
  oc: QuotationOtherCostLine[],
): string | null {
  if (q.costing_basis !== "PER_DOZEN") return null;
  const saved = toSafeNumber(q.quoted_price_per_piece);
  if (saved <= 0) return null;
  const auto = computeWorkspaceCosting({
    quotation: q,
    materials: mats,
    manufacturing: mfg,
    otherCosts: oc,
    manualPricePerPiece: null,
  });
  if (!auto.ok) return null;
  return Math.abs(auto.result.pricePerPiece - saved) > 0.00005 ? String(q.quoted_price_per_piece) : null;
}

export function useQuotationWorkspaceController(id?: string) {
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const [quotation, setQuotation] = useState<QuotationDetailResponse | null>(null);
  /** After POST succeeds but PUT fails, retry updates this id instead of creating duplicates. */
  const [pendingCreatedId, setPendingCreatedId] = useState<number | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    quotation: QuotationDetailResponse;
    materials: QuotationMaterialLine[];
    manufacturing: QuotationManufacturingLine[];
    otherCosts: QuotationOtherCostLine[];
    sizeRatios: QuotationSizeRatioLine[];
  } | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [inquiry, setInquiry] = useState<InquiryResponse | null>(null);
  const [categories, setCategories] = useState<ItemCategoryResponse[]>([]);
  const [items, setItems] = useState<CostingItemResponse[]>([]);
  const [units, setUnits] = useState<ItemUnitResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [inquiries, setInquiries] = useState<InquiryResponse[]>([]);
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [allLinks, setAllLinks] = useState<CustomerIntermediaryLinkResponse[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyMasterResponse[]>([]);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const [fetchingRates, setFetchingRates] = useState(false);
  const [rateSource, setRateSource] = useState<"" | "live" | "fallback">("");
  const [tenantDefaultCommissionMode, setTenantDefaultCommissionMode] = useState("");
  const [showQuickStyleCreate, setShowQuickStyleCreate] = useState(false);
  const [quickStyleName, setQuickStyleName] = useState("");
  const [quickStyleSeason, setQuickStyleSeason] = useState("");
  const [quickStyleDepartment, setQuickStyleDepartment] = useState("");
  const [quickStyleImageFile, setQuickStyleImageFile] = useState<File | null>(null);
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [quickStyleNotice, setQuickStyleNotice] = useState("");
  const [materials, setMaterials] = useState<QuotationMaterialLine[]>([]);
  const [manufacturing, setManufacturing] = useState<QuotationManufacturingLine[]>([]);
  const [otherCosts, setOtherCosts] = useState<QuotationOtherCostLine[]>([]);
  const [sizeRatios, setSizeRatios] = useState<QuotationSizeRatioLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [duplicatingVersion, setDuplicatingVersion] = useState(false);
  const [runningWorkflowAction, setRunningWorkflowAction] = useState<"" | "submit" | "approve" | "send">("");
  const [useManualQuotedPrice, setUseManualQuotedPrice] = useState(false);
  const [manualQuotedPrice, setManualQuotedPrice] = useState("");
  const [revisions, setRevisions] = useState<QuotationResponse[]>([]);
  const [formBaseline, setFormBaseline] = useState(0);
  /** Tenant flag quotation_costing_accuracy_v1: new quotations are costed per dozen when ON. */
  const costingFlagOn = useQuotationCostingAccuracyV1();
  /** This quotation is costed per dozen (12 pcs) and priced per piece. */
  const dozenFirst = quotation?.costing_basis === "PER_DOZEN";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      try {
        const [cats, itemsRes, unitsRes, customersRes, inquiriesRes, linksRes, settings, stylesRes, currenciesRes] =
          await Promise.all([
          api.listItemCategories(),
          api.listCostingItems(),
          api.listItemUnits(),
          isNew ? getCustomersCached() : Promise.resolve([] as CustomerResponse[]),
          isNew ? api.listInquiries() : Promise.resolve([] as InquiryResponse[]),
          api.listCustomerIntermediaryLinks(),
          api.getSettingsConfig(),
          api.listStyles({ status: "ACTIVE" }),
          api.listCurrencies(),
        ]);
        setCategories(cats);
        setItems(itemsRes);
        setUnits(unitsRes);
        setTenantDefaultCommissionMode(settings.default_commission_mode ?? "");
        setStyles(stylesRes);
        setCurrencies(currenciesRes.filter((currency) => currency.is_active));
        setAllLinks(linksRes);
        setPendingCreatedId(null);
        setUseManualQuotedPrice(false);
        setManualQuotedPrice("");
        if (isNew) {
          setCustomers(customersRes);
          setInquiries(inquiriesRes.filter(isInquiryOpenForQuotationLink));
        }

        if (isNew) {
          const today = localDateYmd();
          setQuotation({
            id: 0,
            tenant_id: 0,
            customer_id: 0,
            inquiry_id: null,
            quotation_code: "NEW",
            style_ref: null,
            style_id: null,
            department: null,
            projected_quantity: null,
            projected_delivery_date: null,
            quotation_date: today,
            target_price: null,
            target_price_currency: "USD",
            exchange_rate: "1",
            customer_intermediary_id: null,
            shipping_term: null,
            commission_mode: settings.default_commission_mode ?? null,
            commission_type: null,
            commission_value: null,
            costing_basis: costingFlagOn ? "PER_DOZEN" : null,
            margin_method: costingFlagOn ? "MARKUP_ON_COST" : null,
            fixed_commission_basis: costingFlagOn ? "PER_ORDER" : null,
            material_cost: null,
            manufacturing_cost: null,
            other_cost: null,
            total_cost: null,
            cost_per_piece: null,
            profit_percentage: "15",
            quoted_price: null,
            currency: "USD",
            total_amount: null,
            status: "DRAFT",
            version_no: 1,
            valid_until: null,
            size_ratio_enabled: false,
            pack_ratio: null,
            pcs_per_carton: null,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            materials: [],
            manufacturing: [],
            other_costs: [],
            size_ratios: [],
          });
          setMaterials([]);
          setManufacturing([]);
          setOtherCosts([]);
          setSizeRatios([]);
          setCustomer(null);
          setInquiry(null);
          setSavedSnapshot(null);
          setIsEditing(true);
        } else if (id) {
          const q = await api.getQuotation(Number(id), { ai_indicators: 1 });
          const mats = q.materials ?? [];
          const mfg = q.manufacturing ?? [];
          const oc = q.other_costs ?? [];
          const sr = q.size_ratios ?? [];
          setQuotation(q);
          setMaterials(mats);
          setManufacturing(mfg);
          setOtherCosts(oc);
          setSizeRatios(sr);
          setSavedSnapshot({
            quotation: q,
            materials: mats,
            manufacturing: mfg,
            otherCosts: oc,
            sizeRatios: sr,
          });
          setIsEditing(false);
          setFormBaseline((n) => n + 1);
          const [cust, inq] = await Promise.all([
            api.getCustomer(q.customer_id),
            q.inquiry_id ? api.getInquiry(q.inquiry_id) : Promise.resolve(null),
          ]);
          setCustomer(cust);
          setInquiry(inq);
          if (q.costing_basis === "PER_DOZEN") {
            const manualPc = savedManualPricePerPiece(q, mats, mfg, oc);
            setUseManualQuotedPrice(manualPc != null);
            setManualQuotedPrice(manualPc ?? "");
            return;
          }
          // Detect manual quoted price: differs from auto (total_cost * (1 + profit%)).
          const cost = toSafeNumber(q.total_cost);
          const profitPct = toSafeNumber(q.profit_percentage);
          const autoQuoted = cost + (cost * profitPct) / 100;
          const savedQuoted = toSafeNumber(q.quoted_price);
          if (savedQuoted > 0 && Math.abs(savedQuoted - autoQuoted) > 0.02) {
            setUseManualQuotedPrice(true);
            setManualQuotedPrice(String(q.quoted_price));
          } else {
            setUseManualQuotedPrice(false);
            setManualQuotedPrice(savedQuoted > 0 ? String(q.quoted_price) : "");
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quotation");
      } finally {
        setLoading(false);
        setFormBaseline((n) => n + 1);
      }
    };
    load();
  }, [id, isNew, costingFlagOn]);

  // All versions of this quotation (v1 first), from the server lineage.
  const savedQuotationId = !isNew && quotation ? quotation.id : 0;
  useEffect(() => {
    if (!savedQuotationId) {
      setRevisions([]);
      return;
    }
    let cancelled = false;
    api
      .listQuotationRevisions(savedQuotationId)
      .then((rows) => {
        if (!cancelled) setRevisions(rows);
      })
      .catch((e) => {
        logApiError("QuotationWorkspace.listRevisions", e);
        if (!cancelled) setRevisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [savedQuotationId]);

  const previousVersionQuote = useMemo(() => {
    if (!quotation) return null;
    const direct = revisions.find((r) => r.id === quotation.revision_of_id);
    if (direct) return direct;
    const older = revisions.filter((r) => r.version_no < quotation.version_no);
    return older.length > 0 ? older[older.length - 1] : null;
  }, [quotation, revisions]);

  const latestRevision = useMemo(
    () => revisions.find((r) => r.is_latest_revision) ?? null,
    [revisions],
  );
  // Older (replaced) revisions are read-only; the server also rejects edits with 409.
  const isSuperseded = Boolean(quotation?.superseded_at);

  const formDirty = useFormDirty(
    quotationDirtyValues({
      quotation,
      materials,
      manufacturing,
      otherCosts,
      sizeRatios,
      useManualQuotedPrice,
      manualQuotedPrice,
    }),
    `${isEditing}:${formBaseline}`,
  );
  useUnsavedChangesGuard(isEditing && !isSuperseded && formDirty);

  const reloadQuotationDetail = useCallback(async () => {
    if (isNew || !id) return;
    try {
      const q = await api.getQuotation(Number(id), { ai_indicators: 1 });
      setQuotation(q);
      setMaterials(q.materials ?? []);
      setManufacturing(q.manufacturing ?? []);
      setOtherCosts(q.other_costs ?? []);
      setSizeRatios(q.size_ratios ?? []);
      setFormBaseline((n) => n + 1);
      const [cust, inq] = await Promise.all([
        api.getCustomer(q.customer_id),
        q.inquiry_id ? api.getInquiry(q.inquiry_id) : Promise.resolve(null),
      ]);
      setCustomer(cust);
      setInquiry(inq);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reload quotation");
    }
  }, [id, isNew]);

  const quotationCurrency = quotation?.currency ?? "USD";

  /** Manual buyer price per piece (dozen-first) typed by the user, else null = calculated. */
  const manualPricePerPiece =
    useManualQuotedPrice && manualQuotedPrice.trim() !== "" ? toSafeNumber(manualQuotedPrice) : null;

  /** Dozen-first engine result (live preview; the server recalculates on save). */
  const costing = useMemo(
    () =>
      dozenFirst && quotation
        ? computeWorkspaceCosting({ quotation, materials, manufacturing, otherCosts, manualPricePerPiece })
        : null,
    [dozenFirst, quotation, materials, manufacturing, otherCosts, manualPricePerPiece],
  );
  const costingError = costing && !costing.ok ? costing : null;

  const totals = useMemo(() => {
    if (costing) {
      return costing.ok
        ? orderTotalsFromResult(costing.result, toSafeNumber(quotation?.projected_quantity))
        : { matTotal: 0, mfgTotal: 0, otherTotal: 0, total: 0 };
    }
    return calculateQuotationTotals(materials, manufacturing, otherCosts, quotationCurrency);
  }, [costing, quotation?.projected_quantity, materials, manufacturing, otherCosts, quotationCurrency]);

  // Every costing row gets a stable key so deleting a row never hands its picker state to the next row.
  useEffect(() => {
    if (needsRowKeys(materials)) setMaterials((rows) => ensureRowKeys(rows));
  }, [materials]);
  useEffect(() => {
    if (needsRowKeys(manufacturing)) setManufacturing((rows) => ensureRowKeys(rows));
  }, [manufacturing]);
  useEffect(() => {
    if (needsRowKeys(otherCosts)) setOtherCosts((rows) => ensureRowKeys(rows));
  }, [otherCosts]);

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === quotation?.style_id) ?? null,
    [styles, quotation?.style_id]
  );

  const updateQuotationHeader = (patch: Partial<QuotationDetailResponse>) => {
    setQuotation((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const onMaterialChange = useCallback(
    (
      index: number,
      patch: Partial<QuotationMaterialLine>,
      itemOverride?: CostingItemResponse | null,
    ) => {
      setMaterials((rows) => {
        const next = [...rows];
        const row = { ...next[index], ...patch } as QuotationMaterialLine;
        if ("item_id" in patch) {
          if (patch.item_id) {
            const selectedItem =
              itemOverride && itemOverride.id === patch.item_id
                ? itemOverride
                : items.find((i) => i.id === patch.item_id);
            if (selectedItem) {
              if (selectedItem.category_id != null && row.category_id == null) {
                row.category_id = selectedItem.category_id;
              }
              const u = units.find((x) => x.id === selectedItem.unit_id);
              row.unit =
                u?.name ??
                u?.unit_code ??
                selectedItem.unit_name ??
                selectedItem.unit_code ??
                row.unit ??
                "";
              if (!row.description?.trim()) {
                row.description = selectedItem.name;
              }
            }
          } else {
            row.unit = "";
          }
        }
        if (!dozenFirst) {
          const qc = quotation?.currency ?? "USD";
          const calculated = computeMaterialLineAmounts(
            row,
            toSafeNumber(quotation?.projected_quantity),
            qc,
          );
          row.amount_per_dozen = calculated.amount_per_dozen;
          row.total_amount = calculated.total_amount;
          row.base_amount = calculated.base_amount;
        }
        next[index] = row;
        return next;
      });
    },
    [items, units, quotation?.projected_quantity, quotation?.currency, dozenFirst],
  );

  // Depend on primitive header fields only: the rollup header sync replaces `quotation` with a new object.
  const quotationId = quotation?.id;
  const projectedQuantity = quotation?.projected_quantity;

  useEffect(() => {
    if (quotationId == null || dozenFirst) return;
    const pq = toSafeNumber(projectedQuantity);
    setMaterials((rows) =>
      rows.map((row) => {
        const c = computeMaterialLineAmounts(row, pq, quotationCurrency);
        return {
          ...row,
          amount_per_dozen: c.amount_per_dozen,
          total_amount: c.total_amount,
          base_amount: c.base_amount,
        };
      }),
    );
  }, [quotationId, quotationCurrency, projectedQuantity, dozenFirst]);

  useEffect(() => {
    if (quotationId == null || dozenFirst) return;
    const pq = toSafeNumber(projectedQuantity);
    setManufacturing((rows) =>
      rows.map((row) => ({
        ...row,
        ...computeManufacturingLineAmounts(row, pq),
      })),
    );
  }, [quotationId, projectedQuantity, dozenFirst]);

  const refreshCostingMasters = useCallback(async () => {
    const [cats, itemsRes, unitsRes] = await Promise.all([
      api.listItemCategories(),
      api.listCostingItems(),
      api.listItemUnits(),
    ]);
    setCategories(cats);
    setItems(itemsRes);
    setUnits(unitsRes);
  }, []);

  const onManufacturingChange = useCallback(
    (index: number, patch: Partial<QuotationManufacturingLine>) => {
      setManufacturing((rows) => {
        const next = [...rows];
        let row = { ...next[index], ...patch } as QuotationManufacturingLine;
        if (dozenFirst) {
          // The dozen-first engine fills the amounts; here only the typed value is stored.
          next[index] = row;
          return next;
        }
        if ("production_per_hour" in patch || "machines_required" in patch) {
          const pph = toSafeNumber(row.production_per_hour);
          const mach = Math.max(0, row.machines_required);
          row.production_per_day = String(
            Math.round(pph * mach * QUOTATION_MANUFACTURING_HOURS_PER_DAY),
          );
        }
        const pq = toSafeNumber(quotation?.projected_quantity);
        const derived = computeManufacturingLineAmounts(row, pq);
        row = { ...row, ...derived };
        next[index] = row;
        return next;
      });
    },
    [quotation?.projected_quantity, dozenFirst],
  );

  const onOtherCostChange = (index: number, patch: Partial<QuotationOtherCostLine>) => {
    setOtherCosts((rows) => {
      const next = [...rows];
      let row = { ...next[index], ...patch } as QuotationOtherCostLine;
      if (dozenFirst) {
        next[index] = row;
        return next;
      }
      const { matTotal, mfgTotal } = calculateQuotationTotals(
        materials,
        manufacturing,
        [],
        quotationCurrency,
      );
      row = applyOtherCostCalculation(row, matTotal, mfgTotal);
      next[index] = row;
      return next;
    });
  };

  useEffect(() => {
    if (dozenFirst) return;
    setOtherCosts((rows) => {
      const mapped = rows.map((row) =>
        applyOtherCostCalculation(row, totals.matTotal, totals.mfgTotal),
      );
      const same = mapped.every((r, i) => {
        const prev = rows[i];
        return (
          prev != null &&
          r.calculated_amount === prev.calculated_amount &&
          r.total_amount === prev.total_amount &&
          r.base_amount === prev.base_amount
        );
      });
      return same ? rows : mapped;
    });
  }, [totals.matTotal, totals.mfgTotal, dozenFirst]);

  const onSizeRatioChange = (index: number, patch: Partial<QuotationSizeRatioLine>) => {
    setSizeRatios((rows) => {
      const next = [...rows];
      const row = { ...next[index], ...patch } as QuotationSizeRatioLine;
      if ("ratio_percentage" in patch) {
        row.quantity = sizeQuantityFromRatio(
          toSafeNumber(quotation?.projected_quantity),
          row.ratio_percentage,
        );
      }
      next[index] = row;
      return next;
    });
  };

  // Keep size quantities in sync when projected quantity changes.
  useEffect(() => {
    if (quotationId == null) return;
    const pq = toSafeNumber(projectedQuantity);
    setSizeRatios((rows) =>
      rows.map((row) => ({
        ...row,
        quantity: sizeQuantityFromRatio(pq, row.ratio_percentage),
      })),
    );
  }, [quotationId, projectedQuantity]);

  const handleInquirySelect = async (inquiryId: number | null) => {
    if (!inquiryId) {
      setQuotation((prev) => (prev ? { ...prev, inquiry_id: null } : null));
      setInquiry(null);
      return;
    }
    try {
      const inq = await api.getInquiry(inquiryId);
      const cust = customers.find((c) => c.id === inq.customer_id) ?? null;
      setInquiry(inq);
      setCustomer(cust);
      setQuotation((prev) =>
        prev
          ? {
              ...prev,
              inquiry_id: inq.id,
              customer_id: inq.customer_id,
              style_id: inq.style_id ?? prev.style_id,
              style_ref: inq.style_ref ?? prev.style_ref,
              department: inq.department ?? prev.department,
              projected_quantity: inq.quantity ?? prev.projected_quantity,
              target_price: inq.target_price ?? prev.target_price,
              target_price_currency: inq.target_price_currency ?? prev.target_price_currency,
              currency: inq.currency ?? inq.target_price_currency ?? prev.currency,
              exchange_rate: inq.exchange_rate ?? prev.exchange_rate,
              projected_delivery_date: inq.expected_delivery_date ?? prev.projected_delivery_date,
              customer_intermediary_id: inq.customer_intermediary_id ?? prev.customer_intermediary_id,
              shipping_term: inq.shipping_term ?? prev.shipping_term,
              commission_mode: inq.commission_mode ?? prev.commission_mode,
              commission_type: inq.commission_type ?? prev.commission_type,
              commission_value: inq.commission_value ?? prev.commission_value,
            }
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiry");
    }
  };

  const handleCustomerSelect = (customerId: number, customerOverride?: CustomerResponse | null) => {
    const cust = customerOverride ?? customers.find((c) => c.id === customerId) ?? null;
    if (cust && !customers.some((c) => c.id === cust.id)) {
      setCustomers((prev) => [...prev, cust]);
    }
    const firstPrimaryLink =
      allLinks.find((l) => l.customer_id === customerId && l.is_primary) ??
      allLinks.find((l) => l.customer_id === customerId) ??
      null;
    setCustomer(cust);
    const prefCur = cust?.preferred_currency?.trim();
    const incoterm = cust?.default_incoterm?.trim();
    updateQuotationHeader({
      customer_id: customerId,
      customer_intermediary_id: firstPrimaryLink?.id ?? null,
      commission_mode: tenantDefaultCommissionMode || null,
      commission_type: firstPrimaryLink?.commission_type ?? null,
      commission_value: firstPrimaryLink?.commission_value != null ? String(firstPrimaryLink.commission_value) : null,
      ...(prefCur ? { currency: prefCur.toUpperCase() } : {}),
      ...(incoterm ? { shipping_term: incoterm } : {}),
    });
  };

  const onStyleSelect = (styleId: number | null, styleOverride?: StyleResponse | null) => {
    const style = styleOverride ?? styles.find((s) => s.id === styleId) ?? null;
    if (style && !styles.some((s) => s.id === style.id)) {
      setStyles((prev) => [style, ...prev]);
    }
    updateQuotationHeader({
      style_id: styleId,
      style_ref: style?.style_code ?? null,
      department: style?.department ?? quotation?.department ?? null,
      style_name: style?.name ?? null,
      style_image_url: style?.style_image_url ?? null,
    });
  };

  const onQuickStyleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setQuickStyleImageFile(null);
      return;
    }
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setError("Unsupported image type. Please use PNG, JPG, GIF, or WEBP.");
      setQuickStyleImageFile(null);
      event.target.value = "";
      return;
    }
    setQuickStyleImageFile(file);
  };

  const createStyleInline = async () => {
    if (!quickStyleName.trim()) {
      setError("Style name is required for quick create.");
      return;
    }
    setCreatingStyle(true);
    setError("");
    setQuickStyleNotice("");
    try {
      const created = await api.createStyle({
        name: quickStyleName.trim(),
        season: quickStyleSeason || null,
        department: quickStyleDepartment || null,
        status: "ACTIVE",
      });
      let styleForSelect: StyleResponse = created;
      if (quickStyleImageFile) {
        try {
          const upload = await api.uploadStyleImage(created.id, quickStyleImageFile);
          styleForSelect = { ...created, style_image_url: upload.style_image_url };
          setQuickStyleNotice("Style created and picture uploaded.");
        } catch (e) {
          logApiError("QuotationWorkspace.uploadStyleImage", e);
          setQuickStyleNotice("Style created. Picture upload failed, upload later from style detail.");
        }
      } else {
        setQuickStyleNotice("Style created successfully.");
      }
      setStyles((prev) => [styleForSelect, ...prev.filter((s) => s.id !== styleForSelect.id)]);
      onStyleSelect(styleForSelect.id, styleForSelect);
      setQuickStyleName("");
      setQuickStyleSeason("");
      setQuickStyleDepartment("");
      setQuickStyleImageFile(null);
      setShowQuickStyleCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to quick-create style");
    } finally {
      setCreatingStyle(false);
    }
  };

  const handleSave = async () => {
    if (!quotation) return;
    if (isNew && (quotation.customer_id === 0 || !quotation.customer_id)) {
      setError("Please select a customer before saving.");
      return;
    }
    for (let i = 0; i < materials.length; i++) {
      const line = materials[i];
      if (!line) continue;
      if (line.category_id != null && line.item_id == null) {
        setError(
          `Material line ${i + 1}: select an inventory item when a category is chosen (or clear the category).`,
        );
        return;
      }
    }
    const pq = toSafeNumber(quotation.projected_quantity);
    const hasCostLines =
      materials.some((m) => m.category_id != null || m.item_id != null || (m.description ?? "").trim()) ||
      manufacturing.some((m) => (m.style_part ?? "").trim()) ||
      otherCosts.some((c) => (c.cost_head ?? "").trim());
    if (dozenFirst && costingError) {
      setError(costingError.message);
      return;
    }
    if (!dozenFirst && pq <= 0 && hasCostLines) {
      setError(
        "Projected quantity is zero — costing line totals will be zero. Set a quantity or remove costing lines.",
      );
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let working: QuotationDetailResponse = quotation;
      let targetId = pendingCreatedId ?? quotation.id;
      const stillCreating = isNew && !pendingCreatedId;
      if (stillCreating) {
        const linkedInquiryId = quotation.inquiry_id;
        const useConvertPath =
          linkedInquiryId != null &&
          inquiry != null &&
          inquiry.id === linkedInquiryId &&
          canConvertInquiryToQuotation(inquiry.status);
        if (useConvertPath) {
          const base = await api.convertInquiryToQuotation(linkedInquiryId, {
            profit_percentage: toSafeNumber(quotation.profit_percentage) || 15,
          });
          targetId = base.id;
          working = {
            ...quotation,
            id: base.id,
            status: base.status,
            quotation_code: base.quotation_code,
          };
          setPendingCreatedId(base.id);
        } else {
          const base = await api.createQuotation({
            customer_id: quotation.customer_id,
            inquiry_id: quotation.inquiry_id ?? undefined,
            style_id: quotation.style_id ?? undefined,
            style_ref: quotation.style_ref ?? undefined,
            customer_intermediary_id: quotation.customer_intermediary_id ?? undefined,
            shipping_term: quotation.shipping_term ?? undefined,
            commission_mode: quotation.commission_mode ?? undefined,
            commission_type: quotation.commission_type ?? undefined,
            commission_value: quotation.commission_value ?? undefined,
            currency: quotation.currency ?? undefined,
            total_amount: quotation.total_amount ?? undefined,
            valid_until: quotation.valid_until ?? undefined,
            notes: quotation.notes ?? undefined,
          });
          targetId = base.id;
          working = {
            ...quotation,
            id: base.id,
            status: base.status,
            quotation_code: base.quotation_code,
          };
          setPendingCreatedId(base.id);
        }
      } else if (pendingCreatedId) {
        working = { ...quotation, id: pendingCreatedId, status: quotation.status };
      }
      const body = buildQuotationFullUpdatePayload({
        quotation: working,
        materials,
        manufacturing,
        otherCosts,
        sizeRatios,
        manualPricePerPiece: dozenFirst ? manualPricePerPiece : null,
      });
      const updated = await api.updateQuotationFull(targetId, body);
      setPendingCreatedId(null);
      setQuotation(updated);
      setMaterials(updated.materials ?? []);
      setManufacturing(updated.manufacturing ?? []);
      setOtherCosts(updated.other_costs ?? []);
      setSizeRatios(updated.size_ratios ?? []);
      setSavedSnapshot({
        quotation: updated,
        materials: updated.materials ?? [],
        manufacturing: updated.manufacturing ?? [],
        otherCosts: updated.other_costs ?? [],
        sizeRatios: updated.size_ratios ?? [],
      });
      setSuccess("Costing updated.");
      setIsEditing(false);
      if (isNew || pendingCreatedId) {
        navigate(`/app/quotations/${targetId}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save costing");
    } finally {
      setSaving(false);
    }
  };

  // Dozen-first: fill every line amount and the header numbers from the engine while editing.
  useEffect(() => {
    if (!dozenFirst || !isEditing || !quotation || !costing || !costing.ok) return;
    const qty = Math.max(0, Math.trunc(toSafeNumber(quotation.projected_quantity)));
    const cur = quotation.currency ?? "USD";
    setMaterials((rows) => applyResultToMaterials(rows, costing.result, qty));
    setManufacturing((rows) => applyResultToManufacturing(rows, costing.result, qty));
    setOtherCosts((rows) => applyResultToOtherCosts(rows, costing.result, qty, cur));
    const patch = headerPatchFromResult(costing.result, qty);
    const current = quotation as unknown as Record<string, unknown>;
    const changed = Object.entries(patch).some(([key, value]) => current[key] !== value);
    if (changed) setQuotation((prev) => (prev ? { ...prev, ...patch } : prev));
  }, [dozenFirst, isEditing, quotation, costing]);

  useEffect(() => {
    if (dozenFirst) return;
    if (!quotation || !isEditing) return;
    const projectedQty = toSafeNumber(quotation.projected_quantity);
    const totalCost = totals.total;
    const quotedAuto = computeAutoQuotedPrice({
      totalCost,
      profitPercentage: toSafeNumber(quotation.profit_percentage),
      commissionMode: quotation.commission_mode,
      commissionType: quotation.commission_type,
      commissionValue: quotation.commission_value,
    });
    const quotedFinal =
      useManualQuotedPrice && manualQuotedPrice.trim() !== ""
        ? toSafeNumber(manualQuotedPrice)
        : quotedAuto;
    // Backend parity: cost_per_piece = total_cost / qty (ex-profit).
    const costPerPiece = computeCostPerPiece(totalCost, projectedQty);

    const patch: Partial<QuotationDetailResponse> = {};
    const totalCostStr = totalCost.toFixed(2);
    const quotedStr = quotedFinal.toFixed(2);
    const costPerPieceStr = costPerPiece.toFixed(4);
    if (quotation.material_cost !== totals.matTotal.toFixed(2)) patch.material_cost = totals.matTotal.toFixed(2);
    if (quotation.manufacturing_cost !== totals.mfgTotal.toFixed(2)) patch.manufacturing_cost = totals.mfgTotal.toFixed(2);
    if (quotation.other_cost !== totals.otherTotal.toFixed(2)) patch.other_cost = totals.otherTotal.toFixed(2);
    if (quotation.total_cost !== totalCostStr) patch.total_cost = totalCostStr;
    if (quotation.total_amount !== quotedStr) patch.total_amount = quotedStr;
    if (quotation.quoted_price !== quotedStr) patch.quoted_price = quotedStr;
    if (quotation.cost_per_piece !== costPerPieceStr) patch.cost_per_piece = costPerPieceStr;
    if (Object.keys(patch).length > 0) {
      setQuotation((prev) => (prev ? { ...prev, ...patch } : prev));
    }
  }, [dozenFirst, isEditing, manualQuotedPrice, quotation, totals, useManualQuotedPrice]);

  const refreshExchangeRates = async () => {
    if (!quotation) return;
    setFetchingRates(true);
    setError("");
    try {
      const live = await api.getLiveRates("USD");
      const rates: Record<string, number> = { USD: 1, ...(live.rates ?? {}) };
      setLiveRates(rates);
      setRateSource(live.live ? "live" : "fallback");
      const quotCurr = (quotation.currency ?? "USD").toUpperCase();
      const bdtFx = resolveRate(quotCurr, "BDT", rates);
      if (bdtFx > 0) {
        updateQuotationHeader({ exchange_rate: bdtFx.toFixed(4) });
      }
      const pq = toSafeNumber(quotation.projected_quantity);

      const syncMaterialRow = (row: QuotationMaterialLine): QuotationMaterialLine => {
        const rowCurr = (row.currency ?? quotCurr).toUpperCase();
        if (rowCurr === quotCurr) {
          const calculated = computeMaterialLineAmounts(
            { ...row, exchange_rate: "1", currency: rowCurr },
            pq,
            quotCurr,
          );
          return {
            ...row,
            exchange_rate: "1",
            amount_per_dozen: calculated.amount_per_dozen,
            total_amount: calculated.total_amount,
            base_amount: calculated.base_amount,
          };
        }
        const rate = resolveRate(rowCurr, quotCurr, rates);
        const rateStr = rate > 0 ? rate.toFixed(6) : row.exchange_rate;
        const calculated = computeMaterialLineAmounts(
          { ...row, exchange_rate: rateStr, currency: row.currency },
          pq,
          quotCurr,
        );
        return {
          ...row,
          exchange_rate: rateStr,
          amount_per_dozen: calculated.amount_per_dozen,
          total_amount: calculated.total_amount,
          base_amount: calculated.base_amount,
        };
      };

      const syncFxRow = <T extends { currency?: string | null; exchange_rate?: string | null }>(row: T): T => {
        const rowCurr = (row.currency ?? quotCurr).toUpperCase();
        if (rowCurr === quotCurr) {
          return { ...row, exchange_rate: "1" };
        }
        const rate = resolveRate(rowCurr, quotCurr, rates);
        const rateStr = rate > 0 ? rate.toFixed(6) : row.exchange_rate;
        return { ...row, exchange_rate: rateStr };
      };

      setMaterials((rows) => rows.map(syncMaterialRow));
      setManufacturing((rows) => rows.map((r) => syncFxRow(r)));
      setOtherCosts((rows) => rows.map((r) => syncFxRow(r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh exchange rates");
    } finally {
      setFetchingRates(false);
    }
  };

  const submitForReview = async () => {
    if (!quotation || isNew) return;
    setRunningWorkflowAction("submit");
    setError("");
    try {
      const updated = await api.submitQuotation(quotation.id);
      setQuotation((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setSuccess("Quotation submitted for review.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit quotation");
    } finally {
      setRunningWorkflowAction("");
    }
  };

  const approveQuotation = async () => {
    if (!quotation || isNew) return;
    setRunningWorkflowAction("approve");
    setError("");
    try {
      const updated = await api.approveQuotation(quotation.id);
      setQuotation((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setSuccess("Quotation approved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve quotation");
    } finally {
      setRunningWorkflowAction("");
    }
  };

  const sendQuotation = async () => {
    if (!quotation || isNew) return;
    setRunningWorkflowAction("send");
    setError("");
    try {
      const updated = await api.sendQuotation(quotation.id);
      setQuotation((prev) => (prev ? { ...prev, status: updated.status } : prev));
      setSuccess("Quotation sent to customer.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send quotation");
    } finally {
      setRunningWorkflowAction("");
    }
  };

  const cancelEdit = () => {
    if (savedSnapshot) {
      setQuotation(savedSnapshot.quotation);
      setMaterials(savedSnapshot.materials);
      setManufacturing(savedSnapshot.manufacturing);
      setOtherCosts(savedSnapshot.otherCosts);
      setSizeRatios(savedSnapshot.sizeRatios);
      const q = savedSnapshot.quotation;
      if (q.costing_basis === "PER_DOZEN") {
        const manualPc = savedManualPricePerPiece(q, savedSnapshot.materials, savedSnapshot.manufacturing, savedSnapshot.otherCosts);
        setUseManualQuotedPrice(manualPc != null);
        setManualQuotedPrice(manualPc ?? "");
        setIsEditing(false);
        setError("");
        return;
      }
      const autoQuoted = computeAutoQuotedPrice({
        totalCost: toSafeNumber(q.total_cost),
        profitPercentage: toSafeNumber(q.profit_percentage),
        commissionMode: q.commission_mode,
        commissionType: q.commission_type,
        commissionValue: q.commission_value,
      });
      const savedQuoted = toSafeNumber(q.quoted_price);
      if (savedQuoted > 0 && Math.abs(savedQuoted - autoQuoted) > 0.02) {
        setUseManualQuotedPrice(true);
        setManualQuotedPrice(String(q.quoted_price));
      } else {
        setUseManualQuotedPrice(false);
        setManualQuotedPrice(savedQuoted > 0 ? String(q.quoted_price) : "");
      }
    }
    setIsEditing(false);
    setError("");
  };

  /**
   * Switch an older quotation to dozen-first costing (needs the tenant flag). Nothing is saved until
   * the user presses Save; the server then recalculates every line.
   */
  const convertToDozenFirst = () => {
    if (!quotation || quotation.costing_basis != null || !costingFlagOn) return;
    setIsEditing(true);
    setUseManualQuotedPrice(false);
    setManualQuotedPrice("");
    updateQuotationHeader({
      costing_basis: "PER_DOZEN",
      margin_method: "MARKUP_ON_COST",
      fixed_commission_basis: "PER_ORDER",
    });
  };

  const duplicateAsNewVersion = async () => {
    if (!quotation || isNew) return;
    setDuplicatingVersion(true);
    setError("");
    try {
      const duplicated = await api.reviseQuotation(quotation.id);
      navigate(`/app/quotations/${duplicated.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to duplicate quotation version");
    } finally {
      setDuplicatingVersion(false);
    }
  };

  return {
    currencies,
    liveRates,
    fetchingRates,
    rateSource,
    id,
    isNew,
    quotation,
    setQuotation,
    customer,
    inquiry,
    categories,
    items,
    units,
    customers,
    inquiries,
    styles,
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
    setError,
    success,
    isEditing,
    setIsEditing,
    cancelEdit,
    duplicatingVersion,
    runningWorkflowAction,
    useManualQuotedPrice,
    setUseManualQuotedPrice,
    manualQuotedPrice,
    setManualQuotedPrice,
    previousVersionQuote,
    revisions,
    latestRevision,
    isSuperseded,
    selectedStyle,
    totals,
    costingFlagOn,
    dozenFirst,
    costing,
    costingError,
    manualPricePerPiece,
    convertToDozenFirst,
    allLinks,
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
    duplicateAsNewVersion,
    navigate,
    reloadQuotationDetail,
    refreshCostingMasters,
  };
}
