import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type CurrencyMasterResponse,
  type CustomerIntermediaryLinkResponse,
  type CustomerResponse,
  type InquiryCreate,
  type InquiryItemCreate,
  type StyleResponse,
} from "@/api/client";
import { AutofillReviewPanel } from "@/components/ai-extract/AutofillReviewPanel";
import { ExtractionStatusBanner } from "@/components/ai-extract/ExtractionStatusBanner";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";
import { InquiryCreateSidebar } from "@/features/inquiries/create/InquiryCreateSidebar";
import { canSubmitInquiry } from "@/features/merch/workflow";
import { cn } from "@/lib/utils";
import type {
  ConflictResolutionChoice,
  ExtractionStatus,
  FieldApplyState,
  FieldConfidence,
} from "@/types/extraction";
import { useInquiryAi } from "@/hooks/useInquiryAi";
import { InquiryAiPanel } from "@/components/inquiries/InquiryAiPanel";
import {
  buildInquiryEnrichApplyStates,
  buildInquiryFieldApplyStates,
  deriveConfidenceLevel,
  formatExtractedValue,
  inquiryFormSnapshot,
} from "@/utils/extractionHelpers";
import { useSecureImage } from "@/hooks/useSecureImage";
import { logApiError } from "@/utils/logApiError";

const emptyItem = (): InquiryItemCreate => ({
  item_name: "",
  description: "",
});

const emptyForm = (): InquiryCreate => ({
  customer_id: 0,
  style_id: undefined,
  season: "",
  department: "",
  quantity: undefined,
  target_price: "",
  target_price_currency: "USD",
  currency: "USD",
  exchange_rate: "1",
  expected_delivery_date: "",
  shipping_term: "",
  commission_mode: "",
  commission_type: "",
  commission_value: "",
  notes: "",
  items: [emptyItem()],
});

const INQ_INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

function inquiryAutofillRing(level?: FieldConfidence): string {
  if (!level) return "";
  if (level === "high") return "border-l-[3px] border-l-status-success pl-2";
  if (level === "medium") return "border-l-[3px] border-l-status-warning pl-2";
  return "border-l-[3px] border-l-status-danger pl-2";
}

export function InquiryCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<InquiryCreate>(emptyForm());
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [allLinks, setAllLinks] = useState<CustomerIntermediaryLinkResponse[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyMasterResponse[]>([]);
  const [tenantDefaultCommissionMode, setTenantDefaultCommissionMode] = useState<string>("");
  const [currentInquiryCode, setCurrentInquiryCode] = useState<string>("");
  const [workflowStatus, setWorkflowStatus] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [showQuickStyleCreate, setShowQuickStyleCreate] = useState(false);
  const [quickStyleName, setQuickStyleName] = useState("");
  const [quickStyleSeason, setQuickStyleSeason] = useState("");
  const [quickStyleDepartment, setQuickStyleDepartment] = useState("");
  const [quickStyleImageFile, setQuickStyleImageFile] = useState<File | null>(null);
  const [quickStyleNotice, setQuickStyleNotice] = useState("");
  const [styleImageNotice, setStyleImageNotice] = useState("");
  const [error, setError] = useState("");
  const [uploadingSelectedStyleImage, setUploadingSelectedStyleImage] = useState(false);
  const [fetchingRates, setFetchingRates] = useState(false);
  const [rateSource, setRateSource] = useState<"" | "live" | "fallback">("");

  const inquiryAi = useInquiryAi();
  const [autofilled, setAutofilled] = useState<Partial<Record<string, FieldConfidence>>>({});
  const [reviewRows, setReviewRows] = useState<FieldApplyState[]>([]);
  const [enrichReviewRows, setEnrichReviewRows] = useState<FieldApplyState[]>([]);

  const aiFormSnapshot = useMemo(
    () => ({
      ...inquiryFormSnapshot(form),
      items_json: JSON.stringify(form.items ?? []),
    }),
    [form],
  );

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === form.style_id) ?? null,
    [styles, form.style_id]
  );
  const selectedStyleImageUrl = useSecureImage(selectedStyle?.style_image_url);

  const customerLinks = useMemo(() => {
    if (!form.customer_id) return [];
    return allLinks.filter((l) => l.customer_id === form.customer_id);
  }, [allLinks, form.customer_id]);
  const currencyOptions = currencies.length > 0 ? currencies.map((c) => c.code) : ["USD", "BDT", "EUR", "GBP", "JPY"];
  const selectedCustomerName =
    customers.find((customer) => customer.id === form.customer_id)?.name ?? "-";
  const selectedIntermediaryLabel =
    customerLinks.find((link) => link.id === form.customer_intermediary_id)?.intermediary_name ??
    customerLinks.find((link) => link.id === form.customer_intermediary_id)?.intermediary_code ??
    (form.customer_intermediary_id ? `#${form.customer_intermediary_id}` : "No linked intermediary");

  const extractUiStatus = useMemo((): ExtractionStatus => {
    if (inquiryAi.status === "processing") return "uploading";
    if (inquiryAi.status === "success") return "extracted";
    if (inquiryAi.status === "partial") return "partial";
    if (inquiryAi.status === "failed") return "failed";
    return "idle";
  }, [inquiryAi.status]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [styleRows, customerRows, linkRows, settings, currencyRows] = await Promise.all([
          api.listStyles({ status: "ACTIVE" }),
          api.listCustomers(),
          api.listCustomerIntermediaryLinks(),
          api.getSettingsConfig(),
          api.listCurrencies(),
        ]);
        setStyles(styleRows);
        setCustomers(customerRows);
        setAllLinks(linkRows);
        setCurrencies(currencyRows.filter((c) => c.is_active));
        setTenantDefaultCommissionMode(settings.default_commission_mode ?? "");
        if (!isEdit && settings.default_commission_mode) {
          setForm((prev) => ({ ...prev, commission_mode: prev.commission_mode || settings.default_commission_mode || "" }));
        }

        if (isEdit && id) {
          const inquiry = await api.getInquiry(Number(id));
          setCurrentInquiryCode(inquiry.inquiry_code);
          setWorkflowStatus(inquiry.status ?? "");
          setForm({
            customer_id: inquiry.customer_id,
            style_id: inquiry.style_id ?? undefined,
            style_ref: inquiry.style_ref ?? undefined,
            season: inquiry.season ?? "",
            department: inquiry.department ?? "",
            quantity: inquiry.quantity ?? undefined,
            target_price: inquiry.target_price ?? "",
            target_price_currency: inquiry.target_price_currency ?? "USD",
            currency: inquiry.currency ?? inquiry.target_price_currency ?? "USD",
            exchange_rate: inquiry.exchange_rate ?? "1",
            expected_delivery_date: inquiry.expected_delivery_date ?? "",
            customer_intermediary_id: inquiry.customer_intermediary_id ?? undefined,
            shipping_term: inquiry.shipping_term ?? "",
            commission_mode: inquiry.commission_mode ?? "",
            commission_type: inquiry.commission_type ?? "",
            commission_value: inquiry.commission_value ?? "",
            notes: inquiry.notes ?? "",
            items:
              inquiry.items?.map((line) => ({
                item_name: line.item_name ?? "",
                description: line.description ?? "",
                quantity: line.quantity ?? undefined,
                sort_order: line.sort_order,
              })) ?? [emptyItem()],
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load inquiry setup");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isEdit]);

  const updateItem = (index: number, patch: Partial<InquiryItemCreate>) => {
    setForm((prev) => {
      const next = [...(prev.items ?? [])];
      next[index] = { ...(next[index] ?? {}), ...patch };
      return { ...prev, items: next };
    });
  };

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...(prev.items ?? []), emptyItem()] }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => {
      const next = [...(prev.items ?? [])];
      next.splice(index, 1);
      return { ...prev, items: next.length ? next : [emptyItem()] };
    });
  };

  const onCustomerChange = (customerId: number) => {
    const firstPrimaryLink =
      allLinks.find((l) => l.customer_id === customerId && l.is_primary) ??
      allLinks.find((l) => l.customer_id === customerId) ??
      null;

    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_intermediary_id: firstPrimaryLink?.id,
      commission_mode: tenantDefaultCommissionMode || "",
      commission_type: firstPrimaryLink?.commission_type ?? "",
      commission_value:
        firstPrimaryLink?.commission_value != null
          ? String(firstPrimaryLink.commission_value)
          : "",
    }));
  };

  const onLinkChange = (linkId: number | undefined) => {
    const link = customerLinks.find((l) => l.id === linkId) ?? null;
    setForm((prev) => ({
      ...prev,
      customer_intermediary_id: linkId,
      commission_type: link?.commission_type ?? "",
      commission_value:
        link?.commission_value != null ? String(link.commission_value) : "",
    }));
  };

  const onStyleChange = (styleId: number | undefined) => {
    const style = styles.find((s) => s.id === styleId) ?? null;
    setForm((prev) => ({
      ...prev,
      style_id: styleId,
      style_ref: style ? style.style_code : prev.style_ref,
      department: style?.department ?? prev.department,
      season: style?.season ?? prev.season,
    }));
  };

  useEffect(() => {
    const res = inquiryAi.extraction;
    if (!res) {
      setReviewRows([]);
      return;
    }
    const next = buildInquiryFieldApplyStates(res, inquiryFormSnapshot(form));
    setReviewRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [inquiryAi.extraction, form]);

  useEffect(() => {
    const res = inquiryAi.enrich;
    if (!res) {
      setEnrichReviewRows([]);
      return;
    }
    const next = buildInquiryEnrichApplyStates(res, inquiryFormSnapshot(form));
    setEnrichReviewRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [inquiryAi.enrich, form]);

  const patchForm = (patch: Partial<InquiryCreate>) => {
    setAutofilled((af) => {
      const n = { ...af };
      if ("customer_id" in patch) delete n.customer_id;
      if ("style_id" in patch) delete n.style_id;
      if ("customer_intermediary_id" in patch) delete n.customer_intermediary_id;
      if ("season" in patch) delete n.season;
      if ("department" in patch) delete n.department;
      if ("style_ref" in patch) delete n.style_ref;
      if ("quantity" in patch) delete n.quantity;
      if ("target_price" in patch) delete n.target_price;
      if ("target_price_currency" in patch) delete n.target_price_currency;
      if ("currency" in patch) delete n.currency;
      if ("exchange_rate" in patch) delete n.exchange_rate;
      if ("expected_delivery_date" in patch) delete n.expected_delivery_date;
      if ("shipping_term" in patch) delete n.shipping_term;
      if ("commission_mode" in patch) delete n.commission_mode;
      if ("commission_type" in patch) delete n.commission_type;
      if ("commission_value" in patch) delete n.commission_value;
      if ("notes" in patch) delete n.notes;
      if ("customer_intermediary_id" in patch) delete n.intermediary_name;
      return n;
    });
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const applyExtractedPatch = (
    patch: Partial<InquiryCreate>,
    levels: Partial<Record<string, FieldConfidence>>,
  ) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setAutofilled((prev) => ({ ...prev, ...levels }));
  };

  const applySingleExtractedField = (key: string, value: unknown, level: FieldConfidence) => {
    const raw = formatExtractedValue(value);
    if (key === "quantity") {
      const n = raw ? Number(raw) : undefined;
      applyExtractedPatch(
        { quantity: Number.isFinite(n) ? n : undefined },
        { quantity: level },
      );
      return;
    }
    if (key === "intermediary_name") {
      const match = customerLinks.find(
        (l) =>
          (l.intermediary_name ?? "").toLowerCase().includes(raw.toLowerCase()) ||
          (l.intermediary_code ?? "").toLowerCase() === raw.toLowerCase(),
      );
      if (match) {
        applyExtractedPatch({ customer_intermediary_id: match.id }, { intermediary_name: level });
      }
      return;
    }
    const map: Partial<Record<string, keyof InquiryCreate>> = {
      style_ref: "style_ref",
      season: "season",
      department: "department",
      target_price: "target_price",
      target_price_currency: "target_price_currency",
      currency: "currency",
      exchange_rate: "exchange_rate",
      expected_delivery_date: "expected_delivery_date",
      shipping_term: "shipping_term",
      commission_mode: "commission_mode",
      commission_type: "commission_type",
      commission_value: "commission_value",
      notes: "notes",
    };
    const formKey = map[key];
    if (formKey) {
      applyExtractedPatch({ [formKey]: raw } as Partial<InquiryCreate>, { [key]: level });
    }
  };

  const applySingleEnrichedField = (key: string, value: unknown, level: FieldConfidence) => {
    const raw = formatExtractedValue(value);
    if (key === "customer_id") {
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) {
        applyExtractedPatch({ customer_id: n }, { customer_id: level });
      }
      return;
    }
    if (key === "style_id") {
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) {
        onStyleChange(n);
        setAutofilled((prev) => ({ ...prev, style_id: level }));
      }
      return;
    }
    if (key === "customer_intermediary_id") {
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) {
        applyExtractedPatch({ customer_intermediary_id: n }, { customer_intermediary_id: level });
      }
      return;
    }
    applySingleExtractedField(key, value, level);
  };

  const handleApplyInquiryField = async (key: string) => {
    const res = inquiryAi.extraction;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const level = deriveConfidenceLevel(typeof ef.confidence === "number" ? ef.confidence : 0);
    applySingleExtractedField(key, ef.value, level);
    setReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
    );
    const bid = inquiryAi.extractionBatchId;
    if (bid != null) {
      try {
        await inquiryAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("InquiryCreate.markAiDecision", e);
      }
    }
  };

  const handleApplyEnrichField = async (key: string) => {
    const res = inquiryAi.enrich;
    if (!res?.suggestions[key]) return;
    const sug = res.suggestions[key];
    const level = deriveConfidenceLevel(typeof sug.confidence === "number" ? sug.confidence : 0);
    applySingleEnrichedField(key, sug.value, level);
    setEnrichReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
    );
    const bid = inquiryAi.enrichBatchId;
    if (bid != null) {
      try {
        await inquiryAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("InquiryCreate.markAiEnrich", e);
      }
    }
  };

  const handleApplyAllHighInquiry = async () => {
    const res = inquiryAi.extraction;
    if (!res) return;
    const toApply = reviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const patch: Partial<InquiryCreate> = {};
    const levels: Partial<Record<string, FieldConfidence>> = {};
    for (const row of toApply) {
      const ef = res.fields[row.fieldKey];
      if (!ef) continue;
      const level = deriveConfidenceLevel(typeof ef.confidence === "number" ? ef.confidence : 0);
      const key = row.fieldKey;
      const raw = formatExtractedValue(ef.value);
      if (key === "quantity") {
        const n = raw ? Number(raw) : undefined;
        patch.quantity = Number.isFinite(n) ? n : undefined;
        levels.quantity = level;
      } else if (key === "intermediary_name") {
        const match = customerLinks.find(
          (l) =>
            (l.intermediary_name ?? "").toLowerCase().includes(raw.toLowerCase()) ||
            (l.intermediary_code ?? "").toLowerCase() === raw.toLowerCase(),
        );
        if (match) {
          patch.customer_intermediary_id = match.id;
          levels.intermediary_name = level;
        }
      } else {
        const map: Partial<Record<string, keyof InquiryCreate>> = {
          style_ref: "style_ref",
          season: "season",
          department: "department",
          target_price: "target_price",
          target_price_currency: "target_price_currency",
          currency: "currency",
          exchange_rate: "exchange_rate",
          expected_delivery_date: "expected_delivery_date",
          shipping_term: "shipping_term",
          commission_mode: "commission_mode",
          commission_type: "commission_type",
          commission_value: "commission_value",
          notes: "notes",
        };
        const formKey = map[key];
        if (formKey) {
          (patch as Record<string, string | number | undefined>)[formKey] = raw;
          levels[key] = level;
        }
      }
    }
    applyExtractedPatch(patch, levels);
    setReviewRows((rs) =>
      rs.map((r) =>
        toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
      ),
    );
    const bid = inquiryAi.extractionBatchId;
    if (bid != null) {
      try {
        await inquiryAi.markSuggestionDecisions(
          bid,
          toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        );
      } catch (e) {
        logApiError("InquiryCreate.markAiDecisionsBulk", e);
      }
    }
  };

  const handleApplyAllHighEnrich = async () => {
    const res = inquiryAi.enrich;
    if (!res) return;
    const toApply = enrichReviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const patch: Partial<InquiryCreate> = {};
    const levels: Partial<Record<string, FieldConfidence>> = {};
    let styleIdToApply: number | undefined;
    for (const row of toApply) {
      const sug = res.suggestions[row.fieldKey];
      if (!sug) continue;
      const level = deriveConfidenceLevel(typeof sug.confidence === "number" ? sug.confidence : 0);
      const key = row.fieldKey;
      const raw = formatExtractedValue(sug.value);
      if (key === "customer_id") {
        const n = raw ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) {
          patch.customer_id = n;
          levels.customer_id = level;
        }
      } else if (key === "style_id") {
        const n = raw ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) {
          styleIdToApply = n;
          levels.style_id = level;
        }
      } else if (key === "customer_intermediary_id") {
        const n = raw ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) {
          patch.customer_intermediary_id = n;
          levels.customer_intermediary_id = level;
        }
      } else if (key === "quantity") {
        const n = raw ? Number(raw) : undefined;
        patch.quantity = Number.isFinite(n) ? n : undefined;
        levels.quantity = level;
      } else if (key === "intermediary_name") {
        const match = customerLinks.find(
          (l) =>
            (l.intermediary_name ?? "").toLowerCase().includes(raw.toLowerCase()) ||
            (l.intermediary_code ?? "").toLowerCase() === raw.toLowerCase(),
        );
        if (match) {
          patch.customer_intermediary_id = match.id;
          levels.intermediary_name = level;
        }
      } else {
        const map: Partial<Record<string, keyof InquiryCreate>> = {
          style_ref: "style_ref",
          season: "season",
          department: "department",
          target_price: "target_price",
          target_price_currency: "target_price_currency",
          currency: "currency",
          exchange_rate: "exchange_rate",
          expected_delivery_date: "expected_delivery_date",
          shipping_term: "shipping_term",
          commission_mode: "commission_mode",
          commission_type: "commission_type",
          commission_value: "commission_value",
          notes: "notes",
        };
        const formKey = map[key];
        if (formKey) {
          (patch as Record<string, string | number | undefined>)[formKey] = raw;
          levels[key] = level;
        }
      }
    }
    if (styleIdToApply != null) {
      onStyleChange(styleIdToApply);
    }
    if (Object.keys(patch).length > 0) {
      applyExtractedPatch(patch, levels);
    } else if (Object.keys(levels).length > 0) {
      setAutofilled((prev) => ({ ...prev, ...levels }));
    }
    setEnrichReviewRows((rs) =>
      rs.map((r) =>
        toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
      ),
    );
    const bid = inquiryAi.enrichBatchId;
    if (bid != null) {
      try {
        await inquiryAi.markSuggestionDecisions(
          bid,
          toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        );
      } catch (e) {
        logApiError("InquiryCreate.markAiEnrichBulk", e);
      }
    }
  };

  const handleSkipInquiryField = (key: string) => {
    if (inquiryAi.extractionBatchId != null) {
      void inquiryAi.markSuggestionDecisions(inquiryAi.extractionBatchId, [
        { field_key: key, decision: "skip" },
      ]);
    }
    setReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleSkipEnrichField = (key: string) => {
    if (inquiryAi.enrichBatchId != null) {
      void inquiryAi.markSuggestionDecisions(inquiryAi.enrichBatchId, [{ field_key: key, decision: "skip" }]);
    }
    setEnrichReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleResolveInquiryConflict = async (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      if (inquiryAi.extractionBatchId != null) {
        void inquiryAi.markSuggestionDecisions(inquiryAi.extractionBatchId, [
          { field_key: key, decision: "reject" },
        ]);
      }
      setReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
      return;
    }
    const res = inquiryAi.extraction;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(ef.confidence ?? 0);
    applySingleExtractedField(key, ef.value, level);
    setReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
    );
    const bid = inquiryAi.extractionBatchId;
    if (bid != null) {
      try {
        await inquiryAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("InquiryCreate.markAiDecision", e);
      }
    }
  };

  const handleResolveEnrichConflict = async (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      if (inquiryAi.enrichBatchId != null) {
        void inquiryAi.markSuggestionDecisions(inquiryAi.enrichBatchId, [
          { field_key: key, decision: "reject" },
        ]);
      }
      setEnrichReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
      return;
    }
    const res = inquiryAi.enrich;
    if (!res?.suggestions[key]) return;
    const sug = res.suggestions[key];
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(sug.confidence ?? 0);
    applySingleEnrichedField(key, sug.value, level);
    setEnrichReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
    );
    const bid = inquiryAi.enrichBatchId;
    if (bid != null) {
      try {
        await inquiryAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("InquiryCreate.markAiEnrich", e);
      }
    }
  };

  const handleApplyExtractedItems = () => {
    const res = inquiryAi.extraction;
    if (!res?.items?.length) return;
    const lines: InquiryItemCreate[] = res.items
      .filter((it) => (it.item_name?.trim() || it.description?.trim()) && it.confidence >= 0.5)
      .map((it) => ({
        item_name: it.item_name ?? "",
        description: it.description ?? "",
        quantity: it.quantity ?? undefined,
      }));
    if (lines.length === 0) return;
    setForm((prev) => ({ ...prev, items: lines }));
  };

  const handleExtractFile = async (file: File) => {
    await inquiryAi.runExtract(file, isEdit && id ? Number(id) : undefined);
  };

  const handleClearImport = () => {
    void inquiryAi.discardAiResults();
    setReviewRows([]);
    setEnrichReviewRows([]);
  };

  const handleSave = async () => {
    if (!form.customer_id) {
      setError("Please select a customer.");
      return;
    }
    if (!form.style_id) {
      setError("Style is required for new inquiry flow.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit && id) {
        await api.updateInquiry(Number(id), form);
        navigate(`/app/inquiries/${id}`);
      } else {
        const created = await api.createInquiry(form);
        const finalizeIds = [
          ...new Set(
            [inquiryAi.extractionBatchId, inquiryAi.enrichBatchId].filter((x): x is number => x != null),
          ),
        ];
        for (const batchId of finalizeIds) {
          try {
            await inquiryAi.finalizeSuggestionBatchAfterCreate(created.id, batchId);
          } catch (e) {
            logApiError("InquiryCreate.finalizeAiBatch", e);
          }
        }
        navigate(`/app/inquiries/${created.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save inquiry");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndSubmit = async () => {
    if (!form.customer_id) {
      setError("Please select a customer.");
      return;
    }
    if (!form.style_id) {
      setError("Style is required for new inquiry flow.");
      return;
    }
    if (!isEdit || !id) return;
    setSaving(true);
    setError("");
    try {
      await api.updateInquiry(Number(id), form);
      await api.updateInquiryStatus(Number(id), "SUBMITTED");
      setWorkflowStatus("SUBMITTED");
      navigate(`/app/inquiries/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save and submit inquiry");
    } finally {
      setSaving(false);
    }
  };

  const syncLiveExchangeRate = async () => {
    setFetchingRates(true);
    setError("");
    try {
      const live = await api.getLiveRates("USD");
      setRateSource(live.live ? "live" : "fallback");
      const targetCode = (form.target_price_currency || "USD").toUpperCase();
      const bdtRate = live.rates?.BDT;
      const targetRate = live.rates?.[targetCode];
      if (bdtRate && targetRate) {
        patchForm({
          exchange_rate: (bdtRate / targetRate).toFixed(4),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch exchange rates");
    } finally {
      setFetchingRates(false);
    }
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
      setError("Style name is required to quick-create a style.");
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
      onStyleChange(styleForSelect.id);
      setQuickStyleName("");
      setQuickStyleSeason("");
      setQuickStyleDepartment("");
      setQuickStyleImageFile(null);
      setShowQuickStyleCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create style quickly");
    } finally {
      setCreatingStyle(false);
    }
  };

  const uploadImageForSelectedStyle = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || !selectedStyle) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setError("Unsupported image type. Please use PNG, JPG, GIF, or WEBP.");
      return;
    }
    setUploadingSelectedStyleImage(true);
    setError("");
    setStyleImageNotice("");
    try {
      const upload = await api.uploadStyleImage(selectedStyle.id, file);
      setStyles((prev) =>
        prev.map((style) =>
          style.id === selectedStyle.id ? { ...style, style_image_url: upload.style_image_url } : style
        )
      );
      setStyleImageNotice("Style image uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload style image");
    } finally {
      setUploadingSelectedStyleImage(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">
            {isEdit ? `Edit Inquiry ${currentInquiryCode || ""}` : "New Inquiry"}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Full-page inquiry entry with style, party, and commercial details.
          </p>
          <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
          {!isEdit && (
            <p className="text-xs text-text-muted mt-1">Inquiry code is auto generated when you save (e.g. INQ-0001).</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(isEdit && id ? `/app/inquiries/${id}` : "/app/inquiries")}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || creatingStyle}
            className="rounded-lg border border-border-strong px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
          >
            {saving ? "Saving..." : isEdit ? "Save draft" : "Save inquiry"}
          </button>
          {isEdit && id && canSubmitInquiry(workflowStatus) ? (
            <button
              type="button"
              onClick={() => void handleSaveAndSubmit()}
              disabled={saving || loading || creatingStyle}
              className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save & submit"}
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      {!loading && !isEdit && (
        <div className="space-y-4">
          <FileImportCard
            title="Import Inquiry Info"
            subtitle="Upload buyer inquiry sheet, email screenshot, tech-pack summary, PO summary, or PDF to auto-fill the form."
            status={extractUiStatus}
            error={inquiryAi.error}
            onExtract={handleExtractFile}
            onClear={handleClearImport}
          />
          <ExtractionStatusBanner
            status={extractUiStatus}
            extractedCount={
              Object.values(inquiryAi.extraction?.fields ?? {}).filter(
                (f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== "",
              ).length + (inquiryAi.extraction?.items?.length ?? 0)
            }
            warnings={[
              ...(inquiryAi.extraction?.warnings ?? []),
              ...(inquiryAi.extraction?.unmapped_text?.map((t) => `Unmapped: ${t}`) ?? []),
            ]}
            error={inquiryAi.error}
          />
          {inquiryAi.extraction?.candidate_matches?.customer &&
          inquiryAi.extraction.candidate_matches.customer.length > 0 ? (
            <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <p className="font-semibold text-text-primary">Suggested customers</p>
              <p className="text-text-muted mt-1 text-xs">
                Select a match to set Customer — the system does not create customers from extraction.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {inquiryAi.extraction.candidate_matches.customer.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onCustomerChange(m.id)}
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle"
                  >
                    {m.name}{" "}
                    <span className="text-text-muted">({Math.round(m.score * 100)}%)</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {inquiryAi.extraction?.candidate_matches?.style &&
          inquiryAi.extraction.candidate_matches.style.length > 0 ? (
            <div className="rounded-xl border border-border bg-surface-raised p-4 text-sm">
              <p className="font-semibold text-text-primary">Suggested styles</p>
              <p className="text-text-muted mt-1 text-xs">
                Select a match to set Style — verify the code matches your inquiry.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {inquiryAi.extraction.candidate_matches.style.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onStyleChange(m.id)}
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle"
                  >
                    {m.name}{" "}
                    <span className="text-text-muted">({Math.round(m.score * 100)}%)</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {inquiryAi.extraction && inquiryAi.extraction.items.length > 0 ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleApplyExtractedItems}
                className="rounded-lg border border-border-strong bg-surface-base px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-subtle"
              >
                Apply extracted garment lines
              </button>
            </div>
          ) : null}
          {reviewRows.length > 0 && inquiryAi.extraction ? (
            <AutofillReviewPanel
              fields={reviewRows}
              onApply={handleApplyInquiryField}
              onApplyAllHigh={handleApplyAllHighInquiry}
              onSkip={handleSkipInquiryField}
              onResolveConflict={handleResolveInquiryConflict}
            />
          ) : null}
          {enrichReviewRows.length > 0 && inquiryAi.enrich ? (
            <AutofillReviewPanel
              title="AI enrich suggestions"
              persistNote="Merges into the form; finalize-after-create records accepted fields per batch."
              valueColumnLabel="Suggested"
              fields={enrichReviewRows}
              onApply={handleApplyEnrichField}
              onApplyAllHigh={handleApplyAllHighEnrich}
              onSkip={handleSkipEnrichField}
              onResolveConflict={handleResolveEnrichConflict}
            />
          ) : null}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface-raised p-10 text-center text-text-muted">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:gap-6">
          <div className="space-y-5 xl:col-span-8 2xl:col-span-9">
            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
            <h2 className="text-sm font-semibold text-text-primary">Inquiry Header</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Customer **</label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) => onCustomerChange(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  Style **
                </label>
                <div className="space-y-2">
                  <select
                    value={form.style_id ?? ""}
                    onChange={(e) => onStyleChange(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select style...</option>
                    {styles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.style_code} - {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowQuickStyleCreate((v) => !v)}
                    className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    {showQuickStyleCreate ? "Close quick add" : "Quick add new style"}
                  </button>
                </div>
              </div>
            </div>

            {showQuickStyleCreate && (
              <div className="rounded-lg border border-status-info/30 bg-status-info-subtle/50 p-3 space-y-3">
                <h3 className="text-xs font-semibold text-status-info-foreground">Quick Add Style</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={quickStyleName}
                    onChange={(e) => setQuickStyleName(e.target.value)}
                    placeholder="Style name **"
                    className="rounded border border-status-info/30 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={quickStyleSeason}
                    onChange={(e) => setQuickStyleSeason(e.target.value)}
                    placeholder="Season (optional)"
                    className="rounded border border-status-info/30 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={quickStyleDepartment}
                    onChange={(e) => setQuickStyleDepartment(e.target.value)}
                    placeholder="Department (optional)"
                    className="rounded border border-status-info/30 px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="rounded border border-status-info/30 px-2 py-1 text-xs text-status-info-foreground hover:bg-status-info-subtle cursor-pointer">
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
                    className="rounded bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground disabled:opacity-60"
                  >
                    {creatingStyle ? "Creating..." : "Create style"}
                  </button>
                </div>
                <p className="text-xs text-status-info-foreground/80">
                  Style picture is optional. You can upload now or keep it empty.
                </p>
              </div>
            )}
            {quickStyleNotice && (
              <div className="rounded border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground">
                {quickStyleNotice}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Season</label>
                <input
                  type="text"
                  value={form.season ?? ""}
                  onChange={(e) => patchForm({ season: e.target.value })}
                  className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.season))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Department</label>
                <input
                  type="text"
                  value={form.department ?? ""}
                  onChange={(e) => patchForm({ department: e.target.value })}
                  className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.department))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Style ref fallback</label>
                <input
                  type="text"
                  value={form.style_ref ?? ""}
                  onChange={(e) => patchForm({ style_ref: e.target.value })}
                  className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.style_ref))}
                />
              </div>
            </div>

            {selectedStyle && (
              <div className="rounded-lg border border-border bg-surface-subtle p-3">
                <div className="flex items-center gap-3">
                  {selectedStyle.style_image_url ? (
                    selectedStyleImageUrl ? (
                      <img
                        src={selectedStyleImageUrl}
                        alt={selectedStyle.name}
                        className="h-16 w-16 rounded object-cover border border-border"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded border border-border bg-surface-subtle animate-pulse" aria-hidden />
                    )
                  ) : (
                    <div className="h-16 w-16 rounded bg-border-subtle text-xs text-text-secondary flex items-center justify-center">
                      No image
                    </div>
                  )}
                  <div className="text-sm text-text-secondary">
                    <div className="font-semibold text-text-primary">{selectedStyle.name}</div>
                    <div>{selectedStyle.style_code}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle cursor-pointer">
                    {uploadingSelectedStyleImage ? "Uploading..." : "Upload/replace style image (optional)"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      onChange={uploadImageForSelectedStyle}
                      disabled={uploadingSelectedStyleImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-text-muted">Leave empty if you do not want image now.</span>
                </div>
                {styleImageNotice && (
                  <div className="mt-2 rounded border border-status-success/30 bg-status-success-subtle px-2 py-1 text-xs text-status-success-foreground">
                    {styleImageNotice}
                  </div>
                )}
              </div>
            )}
          </div>

            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
              <h2 className="text-sm font-semibold text-text-primary">Intermediary and Commercial Terms</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Customer Link</label>
                  <select
                    value={form.customer_intermediary_id ?? ""}
                    onChange={(e) => onLinkChange(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">No linked intermediary</option>
                    {customerLinks.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.intermediary_name ?? l.intermediary_code ?? `#${l.intermediary_id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Shipping term</label>
                  <select
                    value={form.shipping_term ?? ""}
                    onChange={(e) => patchForm({ shipping_term: e.target.value })}
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.shipping_term))}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Commission mode</label>
                  <select
                    value={form.commission_mode ?? ""}
                    onChange={(e) => patchForm({ commission_mode: e.target.value })}
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.commission_mode))}
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
                  <label className="block text-xs text-text-secondary mb-1">Commission type</label>
                  <select
                    value={form.commission_type ?? ""}
                    onChange={(e) => patchForm({ commission_type: e.target.value })}
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.commission_type))}
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
                  <label className="block text-xs text-text-secondary mb-1">Commission value</label>
                  <input
                    type="text"
                    value={form.commission_value ?? ""}
                    onChange={(e) => patchForm({ commission_value: e.target.value })}
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.commission_value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Expected quantity</label>
                  <input
                    type="number"
                    value={form.quantity ?? ""}
                    onChange={(e) =>
                      patchForm({
                        quantity: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.quantity))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Target price</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      value={form.target_price ?? ""}
                      onChange={(e) => patchForm({ target_price: e.target.value })}
                      className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.target_price))}
                    />
                    <select
                      value={form.target_price_currency ?? "USD"}
                      onChange={(e) => patchForm({ target_price_currency: e.target.value })}
                      className={cn(
                        "w-28 rounded-lg border border-border-strong px-2 py-2 text-sm",
                        inquiryAutofillRing(autofilled.target_price_currency),
                      )}
                    >
                      {currencyOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Document currency</label>
                  <select
                    value={form.currency ?? "USD"}
                    onChange={(e) => patchForm({ currency: e.target.value })}
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.currency))}
                  >
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Exchange rate</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      value={form.exchange_rate ?? "1"}
                      onChange={(e) => patchForm({ exchange_rate: e.target.value })}
                      className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.exchange_rate))}
                    />
                    <button
                      type="button"
                      onClick={syncLiveExchangeRate}
                      disabled={fetchingRates}
                      className="rounded-lg border border-border-strong px-3 py-2 text-xs text-text-secondary disabled:opacity-60"
                    >
                      {fetchingRates ? "Syncing..." : "Sync rate"}
                    </button>
                  </div>
                  {rateSource && (
                    <p className="mt-1 text-xs text-text-muted">
                      {rateSource === "live" ? "Live rate loaded." : "Fallback rate loaded."}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Expected delivery date</label>
                  <input
                    type="date"
                    value={(form.expected_delivery_date ?? "").slice(0, 10)}
                    onChange={(e) =>
                      patchForm({ expected_delivery_date: e.target.value || undefined })
                    }
                    className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.expected_delivery_date))}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Garment Items</h2>
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded border border-border-strong px-3 py-1 text-xs text-text-secondary"
                >
                  Add item
                </button>
              </div>
              {(form.items ?? []).map((line, index) => (
                <div key={index} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-text-secondary">Item #{index + 1}</p>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="rounded border border-status-danger/20 px-2 py-1 text-xs text-status-danger"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={line.item_name ?? ""}
                      onChange={(e) => updateItem(index, { item_name: e.target.value })}
                      placeholder="Item name"
                      className="rounded border border-border-strong px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={line.description ?? ""}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Description"
                      className="rounded border border-border-strong px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={line.quantity ?? ""}
                      onChange={(e) =>
                        updateItem(index, {
                          quantity: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="Quantity"
                      className="rounded border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <label className="block text-xs text-text-secondary mb-1">Notes</label>
              <textarea
                rows={3}
                value={form.notes ?? ""}
                onChange={(e) => patchForm({ notes: e.target.value })}
                className={cn(INQ_INPUT, inquiryAutofillRing(autofilled.notes))}
              />
            </div>
          </div>
          <div className="space-y-4 xl:sticky xl:top-6 xl:col-span-4 2xl:col-span-3 self-start">
            <InquiryCreateSidebar
              isEdit={isEdit}
              inquiryCode={currentInquiryCode}
              customerName={selectedCustomerName}
              selectedStyle={selectedStyle}
              garmentLineCount={(form.items ?? []).length}
              expectedQuantity={form.quantity}
              targetPrice={form.target_price}
              targetPriceCurrency={form.target_price_currency}
              currency={form.currency}
              exchangeRate={form.exchange_rate}
              rateSource={rateSource}
              shippingTerm={form.shipping_term}
              intermediaryLabel={selectedIntermediaryLabel}
              commissionMode={form.commission_mode}
              commissionType={form.commission_type}
              commissionValue={form.commission_value}
            />
            <InquiryAiPanel
              ai={inquiryAi}
              mode={isEdit ? "edit" : "create"}
              inquiryId={id ? Number(id) : undefined}
              formSnapshot={aiFormSnapshot}
              hiddenActions={isEdit ? undefined : ["summary", "next"]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
