import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type CostingItemResponse,
  type CustomerIntermediaryLinkResponse,
  type CustomerResponse,
  type InquiryResponse,
  type ItemCategoryResponse,
  type QuotationDetailResponse,
  type QuotationResponse,
  type QuotationManufacturingLine,
  type QuotationMaterialLine,
  type QuotationOtherCostLine,
  type QuotationSizeRatioLine,
  type StyleResponse,
} from "@/api/client";
import { buildQuotationFullUpdatePayload } from "./mappers/buildQuotationFullUpdatePayload";
import { calculateQuotationTotals } from "./mappers/calculateQuotationTotals";
import { computeMaterialLineAmounts, toSafeNumber } from "./mappers/quotationNumeric";

export function useQuotationWorkspaceController(id?: string) {
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const [quotation, setQuotation] = useState<QuotationDetailResponse | null>(null);
  const [customer, setCustomer] = useState<CustomerResponse | null>(null);
  const [inquiry, setInquiry] = useState<InquiryResponse | null>(null);
  const [categories, setCategories] = useState<ItemCategoryResponse[]>([]);
  const [items, setItems] = useState<CostingItemResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [inquiries, setInquiries] = useState<InquiryResponse[]>([]);
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [allLinks, setAllLinks] = useState<CustomerIntermediaryLinkResponse[]>([]);
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
  const [previousVersionQuote, setPreviousVersionQuote] = useState<QuotationResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      setSuccess("");
      try {
        const [cats, itemsRes, customersRes, inquiriesRes, linksRes, settings, stylesRes] = await Promise.all([
          api.listItemCategories(),
          api.listCostingItems(),
          isNew ? api.listCustomers() : Promise.resolve([] as CustomerResponse[]),
          isNew ? api.listInquiries() : Promise.resolve([] as InquiryResponse[]),
          isNew ? api.listCustomerIntermediaryLinks() : Promise.resolve([] as CustomerIntermediaryLinkResponse[]),
          api.getSettingsConfig(),
          api.listStyles({ status: "ACTIVE" }),
        ]);
        setCategories(cats);
        setItems(itemsRes);
        setTenantDefaultCommissionMode(settings.default_commission_mode ?? "");
        setStyles(stylesRes);
        if (isNew) {
          setCustomers(customersRes);
          setInquiries(inquiriesRes);
          setAllLinks(linksRes);
        }

        if (isNew) {
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
            quotation_date: new Date().toISOString(),
            target_price: null,
            target_price_currency: "USD",
            exchange_rate: "1",
            customer_intermediary_id: null,
            shipping_term: null,
            commission_mode: settings.default_commission_mode ?? null,
            commission_type: null,
            commission_value: null,
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
          setIsEditing(true);
        } else if (id) {
          const q = await api.getQuotation(Number(id));
          setQuotation(q);
          setMaterials(q.materials ?? []);
          setManufacturing(q.manufacturing ?? []);
          setOtherCosts(q.other_costs ?? []);
          setSizeRatios(q.size_ratios ?? []);
          const [cust, inq] = await Promise.all([
            api.getCustomer(q.customer_id),
            q.inquiry_id ? api.getInquiry(q.inquiry_id) : Promise.resolve(null),
          ]);
          setCustomer(cust);
          setInquiry(inq);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quotation");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isNew]);

  useEffect(() => {
    const loadPreviousVersion = async () => {
      if (!quotation || isNew || !quotation.quotation_code) {
        setPreviousVersionQuote(null);
        return;
      }
      try {
        const versions = await api.listQuotations({
          search: quotation.quotation_code,
          limit: 100,
          offset: 0,
        });
        const related = versions
          .filter(
            (v) =>
              v.customer_id === quotation.customer_id &&
              v.quotation_code === quotation.quotation_code &&
              (v.version_no ?? 0) < (quotation.version_no ?? 0)
          )
          .sort((a, b) => (b.version_no ?? 0) - (a.version_no ?? 0));
        setPreviousVersionQuote(related[0] ?? null);
      } catch {
        setPreviousVersionQuote(null);
      }
    };
    loadPreviousVersion();
  }, [isNew, quotation?.quotation_code, quotation?.version_no, quotation?.customer_id, quotation?.id]);

  const totals = useMemo(
    () => calculateQuotationTotals(materials, manufacturing, otherCosts),
    [materials, manufacturing, otherCosts]
  );

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === quotation?.style_id) ?? null,
    [styles, quotation?.style_id]
  );

  const updateQuotationHeader = (patch: Partial<QuotationDetailResponse>) => {
    setQuotation((prev) => (prev ? { ...prev, ...patch } : null));
  };

  const onMaterialChange = (index: number, patch: Partial<QuotationMaterialLine>) => {
    setMaterials((rows) => {
      const next = [...rows];
      const row = { ...next[index], ...patch } as QuotationMaterialLine;
      const calculated = computeMaterialLineAmounts(row);
      row.amount_per_dozen = calculated.amount_per_dozen;
      row.total_amount = calculated.total_amount;
      next[index] = row;
      return next;
    });
  };

  const onManufacturingChange = (index: number, patch: Partial<QuotationManufacturingLine>) => {
    setManufacturing((rows) => {
      const next = [...rows];
      next[index] = { ...next[index], ...patch } as QuotationManufacturingLine;
      return next;
    });
  };

  const onOtherCostChange = (index: number, patch: Partial<QuotationOtherCostLine>) => {
    setOtherCosts((rows) => {
      const next = [...rows];
      next[index] = { ...next[index], ...patch } as QuotationOtherCostLine;
      return next;
    });
  };

  const onSizeRatioChange = (index: number, patch: Partial<QuotationSizeRatioLine>) => {
    setSizeRatios((rows) => {
      const next = [...rows];
      next[index] = { ...next[index], ...patch } as QuotationSizeRatioLine;
      return next;
    });
  };

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

  const handleCustomerSelect = (customerId: number) => {
    const cust = customers.find((c) => c.id === customerId) ?? null;
    const firstPrimaryLink =
      allLinks.find((l) => l.customer_id === customerId && l.is_primary) ??
      allLinks.find((l) => l.customer_id === customerId) ??
      null;
    setCustomer(cust);
    updateQuotationHeader({
      customer_id: customerId,
      customer_intermediary_id: firstPrimaryLink?.id ?? null,
      commission_mode: tenantDefaultCommissionMode || null,
      commission_type: firstPrimaryLink?.commission_type ?? null,
      commission_value: firstPrimaryLink?.commission_value != null ? String(firstPrimaryLink.commission_value) : null,
    });
  };

  const onStyleSelect = (styleId: number | null) => {
    const style = styles.find((s) => s.id === styleId) ?? null;
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
        } catch {
          setQuickStyleNotice("Style created. Picture upload failed, upload later from style detail.");
        }
      } else {
        setQuickStyleNotice("Style created successfully.");
      }
      setStyles((prev) => [styleForSelect, ...prev.filter((s) => s.id !== styleForSelect.id)]);
      onStyleSelect(styleForSelect.id);
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
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const body = buildQuotationFullUpdatePayload({
        quotation,
        materials,
        manufacturing,
        otherCosts,
        sizeRatios,
      });
      let targetId = quotation.id;
      if (isNew) {
        if (quotation.inquiry_id) {
          const base = await api.convertInquiryToQuotation(quotation.inquiry_id, {
            profit_percentage: toSafeNumber(quotation.profit_percentage) || 15,
          });
          targetId = base.id;
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
        }
      }
      const updated = await api.updateQuotationFull(targetId, body);
      setQuotation(updated);
      setMaterials(updated.materials ?? []);
      setManufacturing(updated.manufacturing ?? []);
      setOtherCosts(updated.other_costs ?? []);
      setSizeRatios(updated.size_ratios ?? []);
      setSuccess("Costing updated.");
      setIsEditing(false);
      if (isNew) {
        navigate(`/app/quotations/${targetId}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save costing");
    } finally {
      setSaving(false);
    }
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
    id,
    isNew,
    quotation,
    setQuotation,
    customer,
    inquiry,
    categories,
    items,
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
    duplicatingVersion,
    previousVersionQuote,
    selectedStyle,
    totals,
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
    duplicateAsNewVersion,
    navigate,
  };
}
