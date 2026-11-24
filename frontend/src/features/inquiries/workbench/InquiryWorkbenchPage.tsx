import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type CurrencyMasterResponse,
  type CustomerIntermediaryLinkResponse,
  type CustomerResponse,
  type InquiryCreate,
  type InquiryItemCreate,
  type InquiryTechnicalFile,
  type StyleResponse,
} from "@/api/client";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { InquiryAiPanel } from "@/components/inquiries/InquiryAiPanel";
import { canSubmitInquiry } from "@/features/merch/workflow";
import { BasicsStep } from "@/features/inquiries/workbench/steps/BasicsStep";
import { CommercialStep } from "@/features/inquiries/workbench/steps/CommercialStep";
import { LinesNotesStep } from "@/features/inquiries/workbench/steps/LinesNotesStep";
import { ProductStep } from "@/features/inquiries/workbench/steps/ProductStep";
import { ReviewStep } from "@/features/inquiries/workbench/steps/ReviewStep";
import {
  estimatedValue,
  readinessScore,
} from "@/features/inquiries/workbench/inquiryReadiness";
import { useInquiryAi } from "@/hooks/useInquiryAi";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { hydrateStyle } from "@/lib/remoteSelectFetchers";
import { cn } from "@/lib/utils";
import { inquiryFormSnapshot } from "@/utils/extractionHelpers";
import { logApiError } from "@/utils/logApiError";
import type { ExtractionStatus } from "@/types/extraction";

const STEPS = ["Basics", "Product", "Commercial", "Lines", "Review"] as const;

const emptyItem = (): InquiryItemCreate => ({ item_name: "", description: "" });

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
  inquiry_type: null,
  brand: "",
  season_year: "",
  material_composition: "",
  size_range: "",
  color_options: null,
  country_of_origin: "",
  special_requirements: "",
  contact_person: "",
  items: [emptyItem()],
});

function inquiryFromResponse(inquiry: Awaited<ReturnType<typeof api.getInquiry>>): InquiryCreate {
  return {
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
    inquiry_type: inquiry.inquiry_type ?? null,
    brand: inquiry.brand ?? "",
    season_year: inquiry.season_year ?? "",
    material_composition: inquiry.material_composition ?? "",
    size_range: inquiry.size_range ?? "",
    color_options: inquiry.color_options ?? null,
    country_of_origin: inquiry.country_of_origin ?? "",
    special_requirements: inquiry.special_requirements ?? "",
    contact_person: inquiry.contact_person ?? "",
    items:
      inquiry.items?.map((line) => ({
        item_name: line.item_name ?? "",
        description: line.description ?? "",
        quantity: line.quantity ?? undefined,
        sort_order: line.sort_order,
      })) ?? [emptyItem()],
  };
}

export function InquiryWorkbenchPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const customerDeepLinkDone = useRef(false);
  const styleDeepLinkDone = useRef(false);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<InquiryCreate>(emptyForm());
  const [formDirty, setFormDirty] = useState(false);
  const [buyerDefaultsHint, setBuyerDefaultsHint] = useState("");
  const [selectedCustomerName, setSelectedCustomerName] = useState("-");
  const [selectedStyle, setSelectedStyle] = useState<StyleResponse | null>(null);
  const [allLinks, setAllLinks] = useState<CustomerIntermediaryLinkResponse[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyMasterResponse[]>([]);
  const [tenantDefaultCommissionMode, setTenantDefaultCommissionMode] = useState("");
  const [currentInquiryCode, setCurrentInquiryCode] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [technicalFiles, setTechnicalFiles] = useState<InquiryTechnicalFile[]>([]);
  const [savedInquiryId, setSavedInquiryId] = useState<number | null>(id ? Number(id) : null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fetchingRates, setFetchingRates] = useState(false);
  const [rateSource, setRateSource] = useState<"" | "live" | "fallback">("");

  const inquiryAi = useInquiryAi();
  useUnsavedChangesGuard(formDirty && !saving);

  const customerLinks = useMemo(() => {
    if (!form.customer_id) return [];
    return allLinks.filter((l) => l.customer_id === form.customer_id);
  }, [allLinks, form.customer_id]);

  const score = readinessScore(form);
  const estValue = estimatedValue(form.quantity, form.target_price);

  const aiFormSnapshot = useMemo(
    () => ({
      ...inquiryFormSnapshot(form),
      items_json: JSON.stringify(form.items ?? []),
    }),
    [form],
  );

  const extractUiStatus = useMemo((): ExtractionStatus => {
    if (inquiryAi.status === "processing") return "uploading";
    if (inquiryAi.status === "success") return "extracted";
    if (inquiryAi.status === "partial") return "partial";
    if (inquiryAi.status === "failed") return "failed";
    return "idle";
  }, [inquiryAi.status]);

  const markDirty = () => setFormDirty(true);

  const onPatch = (patch: Partial<InquiryCreate>) => {
    markDirty();
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const onCustomerChange = (
    customerId: number,
    customerName?: string,
    customerMeta?: CustomerResponse | null,
  ) => {
    const firstPrimaryLink =
      allLinks.find((l) => l.customer_id === customerId && l.is_primary) ??
      allLinks.find((l) => l.customer_id === customerId) ??
      null;
    if (customerName != null) setSelectedCustomerName(customerName || "-");
    else if (!customerId) setSelectedCustomerName("-");

    const preferred = customerMeta?.preferred_currency?.trim().toUpperCase();
    const incoterm = customerMeta?.default_incoterm?.trim();
    const paymentTerms = customerMeta?.payment_terms?.trim();
    const leadDays = customerMeta?.typical_lead_time_days;
    const hintParts = [
      preferred ? `Currency ${preferred}` : "",
      incoterm ? `Incoterm ${incoterm}` : "",
      paymentTerms ? `Payment ${paymentTerms}` : "",
      leadDays != null ? `Lead time ${leadDays} days` : "",
    ].filter(Boolean);
    setBuyerDefaultsHint(hintParts.length ? `Buyer defaults: ${hintParts.join(" · ")}` : "");

    markDirty();
    setForm((prev) => ({
      ...prev,
      customer_id: customerId,
      customer_intermediary_id: firstPrimaryLink?.id,
      commission_mode: tenantDefaultCommissionMode || prev.commission_mode || "",
      commission_type: firstPrimaryLink?.commission_type ?? "",
      commission_value:
        firstPrimaryLink?.commission_value != null ? String(firstPrimaryLink.commission_value) : "",
      ...(preferred ? { currency: preferred, target_price_currency: preferred } : {}),
      ...(incoterm ? { shipping_term: incoterm } : {}),
    }));
  };

  const onStyleChange = (styleId: number | undefined, styleOverride?: StyleResponse | null) => {
    const style = styleOverride ?? null;
    if (style) setSelectedStyle(style);
    else if (!styleId) setSelectedStyle(null);
    markDirty();
    setForm((prev) => {
      // Auto-fill only empty product fields — never overwrite what the user already typed.
      const next: InquiryCreate = { ...prev, style_id: styleId };
      if (style) {
        if (!String(prev.style_ref ?? "").trim()) next.style_ref = style.style_code;
        if (!String(prev.brand ?? "").trim() && style.brand) next.brand = style.brand;
        if (!String(prev.season ?? "").trim() && style.season) next.season = style.season;
        if (!String(prev.department ?? "").trim() && style.department) next.department = style.department;
      }
      return next;
    });
  };

  const onIntermediaryChange = (linkId: number | undefined) => {
    const link = customerLinks.find((l) => l.id === linkId) ?? null;
    markDirty();
    setForm((prev) => ({
      ...prev,
      customer_intermediary_id: linkId,
      commission_type: link?.commission_type ?? "",
      commission_value: link?.commission_value != null ? String(link.commission_value) : "",
    }));
  };

  const updateItem = (index: number, patch: Partial<InquiryItemCreate>) => {
    markDirty();
    setForm((prev) => {
      const next = [...(prev.items ?? [])];
      next[index] = { ...(next[index] ?? {}), ...patch };
      return { ...prev, items: next };
    });
  };

  const addItem = () => {
    markDirty();
    setForm((prev) => ({ ...prev, items: [...(prev.items ?? []), emptyItem()] }));
  };

  const removeItem = (index: number) => {
    markDirty();
    setForm((prev) => {
      const next = [...(prev.items ?? [])];
      next.splice(index, 1);
      return { ...prev, items: next.length ? next : [emptyItem()] };
    });
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [linkRows, settings, currencyRows] = await Promise.all([
          api.listCustomerIntermediaryLinks(),
          api.getSettingsConfig(),
          api.listCurrencies(),
        ]);
        setAllLinks(linkRows);
        setCurrencies(currencyRows.filter((c) => c.is_active));
        setTenantDefaultCommissionMode(settings.default_commission_mode ?? "");
        if (!isEdit && settings.default_commission_mode) {
          setForm((prev) => ({
            ...prev,
            commission_mode: prev.commission_mode || settings.default_commission_mode || "",
          }));
        }
        if (isEdit && id) {
          const inquiry = await api.getInquiry(Number(id));
          setCurrentInquiryCode(inquiry.inquiry_code);
          setWorkflowStatus(inquiry.status ?? "");
          setSelectedCustomerName(inquiry.customer_name ?? "-");
          setTechnicalFiles(inquiry.technical_files ?? []);
          setSavedInquiryId(inquiry.id);
          setForm(inquiryFromResponse(inquiry));
          if (inquiry.style_id) {
            const hydrated = await hydrateStyle(inquiry.style_id);
            if (hydrated?.meta) setSelectedStyle(hydrated.meta);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load inquiry workbench");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, isEdit]);

  useEffect(() => {
    if (isEdit || customerDeepLinkDone.current) return;
    const raw = searchParams.get("customer_id");
    const customerId = raw ? Number(raw) : 0;
    if (!Number.isFinite(customerId) || customerId <= 0) return;
    customerDeepLinkDone.current = true;
    void (async () => {
      try {
        const c = await api.getCustomer(customerId);
        onCustomerChange(c.id, c.name, c);
      } catch (e) {
        logApiError("InquiryWorkbench.customerDeepLink", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, searchParams]);

  useEffect(() => {
    if (isEdit || styleDeepLinkDone.current) return;
    const raw = searchParams.get("style_id");
    const styleId = raw ? Number(raw) : 0;
    if (!Number.isFinite(styleId) || styleId <= 0) return;
    styleDeepLinkDone.current = true;
    void (async () => {
      try {
        const hydrated = await hydrateStyle(styleId);
        if (!hydrated?.meta) return;
        onStyleChange(hydrated.meta.id, hydrated.meta);
      } catch (e) {
        logApiError("InquiryWorkbench.styleDeepLink", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, searchParams]);

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
        onPatch({ exchange_rate: (bdtRate / targetRate).toFixed(4) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch exchange rates");
    } finally {
      setFetchingRates(false);
    }
  };

  const handleSave = async (andSubmit: boolean) => {
    if (!form.customer_id) {
      setError("Please select a customer.");
      setStep(0);
      return;
    }
    if (!form.style_id) {
      setError("Style is required.");
      setStep(0);
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit && id) {
        await api.updateInquiry(Number(id), form);
        if (andSubmit && canSubmitInquiry(workflowStatus)) {
          await api.updateInquiryStatus(Number(id), "SUBMITTED");
          setWorkflowStatus("SUBMITTED");
        }
        setFormDirty(false);
        navigate(`/app/inquiries/${id}`);
      } else {
        const created = await api.createInquiry(form);
        setSavedInquiryId(created.id);
        setFormDirty(false);
        const finalizeIds = [
          ...new Set(
            [inquiryAi.extractionBatchId, inquiryAi.enrichBatchId].filter(
              (x): x is number => x != null,
            ),
          ),
        ];
        for (const batchId of finalizeIds) {
          try {
            await inquiryAi.finalizeSuggestionBatchAfterCreate(created.id, batchId);
          } catch (e) {
            logApiError("InquiryWorkbench.finalizeAiBatch", e);
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

  const styleLabel = selectedStyle
    ? `${selectedStyle.style_code} — ${selectedStyle.name}`
    : form.style_ref || undefined;

  const importSlot =
    !isEdit && step === 0 ? (
      <div className="space-y-2">
        <FileImportCard
          title="Import Inquiry Info"
          subtitle="Upload a buyer sheet or PDF to auto-fill fields. Full review panels stay on the classic form if you need them."
          status={extractUiStatus}
          error={inquiryAi.error}
          onExtract={async (file) => {
            await inquiryAi.runExtract(file, undefined);
          }}
          onClear={() => {
            void inquiryAi.discardAiResults();
          }}
        />
        {inquiryAi.extraction ? (
          <p className="text-xs text-text-muted">
            Extraction finished — open Autofill review on the classic create form if you need field-by-field
            apply, or continue filling steps manually. Suggested matches appear when you re-open Import
            results in the legacy screen.
          </p>
        ) : null}
      </div>
    ) : null;

  if (loading) {
    return <div className="p-6 text-text-muted">Loading inquiry workbench…</div>;
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <AppPageHeader
        title={isEdit ? `Edit Inquiry ${currentInquiryCode || ""}` : "New Inquiry"}
        description="5-step inquiry workbench · Save a draft any time · Submit only from DRAFT"
        backTo={{
          label: isEdit ? "Inquiry detail" : "Inquiries",
          to: isEdit && id ? `/app/inquiries/${id}` : "/app/inquiries",
        }}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave(false)}
              disabled={saving}
              className="rounded-lg border border-border-strong px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            {isEdit && canSubmitInquiry(workflowStatus) ? (
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={saving}
                className="rounded-lg bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save & submit"}
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label="Inquiry steps">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium",
              i === step
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                : "border-border bg-surface-raised text-text-secondary hover:bg-surface-subtle",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </nav>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8 2xl:col-span-9">
          {step === 0 ? (
            <BasicsStep
              form={form}
              onPatch={onPatch}
              onCustomerChange={onCustomerChange}
              onStyleChange={onStyleChange}
              onIntermediaryChange={onIntermediaryChange}
              customerLinks={customerLinks}
              buyerDefaultsHint={buyerDefaultsHint}
              importSlot={importSlot}
            />
          ) : null}
          {step === 1 ? (
            <ProductStep
              form={form}
              onPatch={onPatch}
              inquiryId={savedInquiryId}
              technicalFiles={technicalFiles}
              onTechnicalFilesChange={setTechnicalFiles}
            />
          ) : null}
          {step === 2 ? (
            <CommercialStep
              form={form}
              onPatch={onPatch}
              currencies={currencies}
              fetchingRates={fetchingRates}
              rateSource={rateSource}
              onSyncExchangeRate={() => void syncLiveExchangeRate()}
            />
          ) : null}
          {step === 3 ? (
            <LinesNotesStep
              form={form}
              onPatch={onPatch}
              onUpdateItem={updateItem}
              onAddItem={addItem}
              onRemoveItem={removeItem}
            />
          ) : null}
          {step === 4 ? (
            <ReviewStep form={form} customerName={selectedCustomerName} styleLabel={styleLabel} />
          ) : null}

          <div className="flex justify-between gap-2">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-text-secondary disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              disabled={step >= STEPS.length - 1}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <aside className="space-y-4 xl:col-span-4 2xl:col-span-3">
          <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Snapshot</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Readiness</span>
              <span className="font-bold text-text-primary">{score}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
              <div
                className="h-full rounded-full bg-brand-primary transition-all"
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Est. value</span>
              <span className="font-semibold text-text-primary">
                {estValue} {form.target_price_currency || "USD"}
              </span>
            </div>
            <div className="text-xs text-text-muted">
              {selectedCustomerName}
              {styleLabel ? ` · ${styleLabel}` : ""}
            </div>
          </div>

          {isEdit && savedInquiryId ? (
            <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Inquiry AI</h3>
              <InquiryAiPanel
                ai={inquiryAi}
                mode="edit"
                inquiryId={savedInquiryId}
                formSnapshot={aiFormSnapshot}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
