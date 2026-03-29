import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, PlusCircle, Save } from "lucide-react";
import { api } from "@/api/client";
import { AutofillReviewPanel } from "@/components/ai-extract/AutofillReviewPanel";
import { ExtractionStatusBanner } from "@/components/ai-extract/ExtractionStatusBanner";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { CustomerAiPanel } from "@/components/customers/CustomerAiPanel";
import { CustomerFormFields } from "@/components/customers/CustomerFormFields";
import {
  buildCustomerCreatePayload,
  INITIAL_CUSTOMER_FORM,
  shippingValuesFromForm,
  type CustomerFormState,
} from "@/components/customers/customerFormShared";
import { useCustomerAi } from "@/hooks/useCustomerAi";
import { useSecureImage } from "@/hooks/useSecureImage";
import type { ConflictResolutionChoice, ExtractionStatus, FieldApplyState, FieldConfidence } from "@/types/extraction";
import {
  buildCustomerEnrichApplyStates,
  buildCustomerFieldApplyStates,
  deriveConfidenceLevel,
  formatExtractedValue,
} from "@/utils/extractionHelpers";
import { logApiError } from "@/utils/logApiError";

function autofillBorder(level?: FieldConfidence): string {
  if (!level) return "";
  if (level === "high") return "border-l-[3px] border-l-status-success pl-2";
  if (level === "medium") return "border-l-[3px] border-l-status-warning pl-2";
  return "border-l-[3px] border-l-status-danger pl-2";
}

function customerFormSnapshot(f: CustomerFormState): Record<string, string> {
  return {
    legalEntityName: f.legalEntityName,
    tradeName: f.tradeName,
    taxIdVatNumber: f.taxIdVatNumber,
    website: f.website,
    primaryContactName: f.primaryContactName,
    designation: f.designation,
    contactEmail: f.contactEmail,
    countryCode: f.countryCode,
    contactPhone: f.contactPhone,
    billingAddressLine1: f.billingAddressLine1,
    billingCity: f.billingCity,
    billingPostalCode: f.billingPostalCode,
    billingCountry: f.billingCountry,
    shippingAddressLine1: f.shippingAddressLine1,
    shippingCity: f.shippingCity,
    shippingPostalCode: f.shippingPostalCode,
    shippingCountry: f.shippingCountry,
  };
}

function isValidWebsite(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  if (!value.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function CustomerCreatePage() {
  const [form, setForm] = useState<CustomerFormState>(INITIAL_CUSTOMER_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const companyLogoDisplayUrl = useSecureImage(form.companyLogoUrl);

  const customerAi = useCustomerAi();
  const extractUiStatus: ExtractionStatus =
    customerAi.status === "processing"
      ? "uploading"
      : customerAi.status === "success"
        ? "extracted"
        : customerAi.status === "partial"
          ? "partial"
          : customerAi.status === "failed"
            ? "failed"
            : "idle";
  const [autofilled, setAutofilled] = useState<Partial<Record<string, FieldConfidence>>>({});
  const [reviewRows, setReviewRows] = useState<FieldApplyState[]>([]);
  const [enrichReviewRows, setEnrichReviewRows] = useState<FieldApplyState[]>([]);

  useEffect(() => {
    const res = customerAi.extraction;
    if (!res) {
      setReviewRows([]);
      return;
    }
    const next = buildCustomerFieldApplyStates(res, customerFormSnapshot(form));
    setReviewRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [customerAi.extraction, form]);

  useEffect(() => {
    const res = customerAi.enrich;
    if (!res) {
      setEnrichReviewRows([]);
      return;
    }
    const next = buildCustomerEnrichApplyStates(res, customerFormSnapshot(form));
    setEnrichReviewRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [customerAi.enrich, form]);

  const suggestSameAsBilling = useMemo(() => {
    const res = customerAi.extraction;
    if (!res?.success) return false;
    const b1 = res.fields.billingAddressLine1?.value;
    const s1 = res.fields.shippingAddressLine1?.value;
    const hasBilling = Boolean(b1 && String(b1).trim());
    const hasShipping = Boolean(s1 && String(s1).trim());
    return hasBilling && !hasShipping;
  }, [customerAi.extraction]);

  const shippingValues = useMemo(() => shippingValuesFromForm(form), [form]);

  const validate = (): string | null => {
    if (!form.legalEntityName.trim()) return "Legal entity name is required.";
    if (!form.primaryContactName.trim()) return "Primary contact name is required.";
    if (!isValidEmail(form.contactEmail)) return "Please enter a valid contact email.";
    if (!isValidWebsite(form.website)) return "Please provide a valid website URL (https://...).";
    if (!form.billingAddressLine1.trim()) return "Billing address is required.";
    if (!form.billingCity.trim()) return "Billing city is required.";
    if (!form.billingCountry.trim()) return "Billing country is required.";
    if (!shippingValues.shippingAddressLine1.trim()) return "Shipping address is required.";
    if (!shippingValues.shippingCity.trim()) return "Shipping city is required.";
    if (!shippingValues.shippingCountry.trim()) return "Shipping country is required.";
    return null;
  };

  const toPayload = () => buildCustomerCreatePayload(form, shippingValues);

  const patchForm = (patch: Partial<CustomerFormState>) => {
    setAutofilled((af) => {
      const n = { ...af };
      for (const k of Object.keys(patch)) {
        delete n[k];
      }
      return n;
    });
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const applyExtractedPatch = (
    patch: Partial<CustomerFormState>,
    levels: Partial<Record<string, FieldConfidence>>,
  ) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setAutofilled((prev) => ({ ...prev, ...levels }));
  };

  const clearAutofillKeys = (...keys: string[]) => {
    setAutofilled((af) => {
      const n = { ...af };
      for (const k of keys) delete n[k];
      return n;
    });
  };

  const resetForm = () => {
    setForm(INITIAL_CUSTOMER_FORM);
    setError("");
    customerAi.clear();
    setAutofilled({});
    setReviewRows([]);
    setEnrichReviewRows([]);
  };

  const handleExtractFile = async (file: File) => {
    await customerAi.runExtract(file);
  };

  const handleClearImport = () => {
    void customerAi.discardAiResults();
    setReviewRows([]);
    setEnrichReviewRows([]);
  };

  const handleApplyExtractField = async (key: string) => {
    const res = customerAi.extraction;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const v = formatExtractedValue(ef.value);
    const level = deriveConfidenceLevel(typeof ef.confidence === "number" ? ef.confidence : 0);
    applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
    setReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
    );
    const bid = customerAi.extractionBatchId;
    if (bid != null) {
      try {
        await customerAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("CustomerCreate.markAiDecision", e);
      }
    }
  };

  const handleApplyEnrichField = async (key: string) => {
    const res = customerAi.enrich;
    if (!res?.suggestions[key]) return;
    const sug = res.suggestions[key];
    const v = formatExtractedValue(sug.value);
    const level = deriveConfidenceLevel(typeof sug.confidence === "number" ? sug.confidence : 0);
    applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
    setEnrichReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
    );
    const bid = customerAi.enrichBatchId;
    if (bid != null) {
      try {
        await customerAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("CustomerCreate.markAiEnrich", e);
      }
    }
  };

  const handleApplyAllHighExtract = async () => {
    const res = customerAi.extraction;
    if (!res) return;
    const toApply = reviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const patch: Partial<CustomerFormState> = {};
    const levels: Partial<Record<string, FieldConfidence>> = {};
    for (const row of toApply) {
      const ef = res.fields[row.fieldKey];
      if (!ef) continue;
      (patch as Record<string, string>)[row.fieldKey] = formatExtractedValue(ef.value);
      levels[row.fieldKey] = deriveConfidenceLevel(ef.confidence);
    }
    applyExtractedPatch(patch, levels);
    setReviewRows((rs) =>
      rs.map((r) =>
        toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
      ),
    );
    const bid = customerAi.extractionBatchId;
    if (bid != null) {
      try {
        await customerAi.markSuggestionDecisions(
          bid,
          toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        );
      } catch (e) {
        logApiError("CustomerCreate.markAiDecisionsBulk", e);
      }
    }
  };

  const handleApplyAllHighEnrich = async () => {
    const res = customerAi.enrich;
    if (!res) return;
    const toApply = enrichReviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const patch: Partial<CustomerFormState> = {};
    const levels: Partial<Record<string, FieldConfidence>> = {};
    for (const row of toApply) {
      const sug = res.suggestions[row.fieldKey];
      if (!sug) continue;
      (patch as Record<string, string>)[row.fieldKey] = formatExtractedValue(sug.value);
      levels[row.fieldKey] = deriveConfidenceLevel(sug.confidence);
    }
    applyExtractedPatch(patch, levels);
    setEnrichReviewRows((rs) =>
      rs.map((r) =>
        toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
      ),
    );
    const bid = customerAi.enrichBatchId;
    if (bid != null) {
      try {
        await customerAi.markSuggestionDecisions(
          bid,
          toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        );
      } catch (e) {
        logApiError("CustomerCreate.markAiEnrichBulk", e);
      }
    }
  };

  const handleSkipExtractField = (key: string) => {
    if (customerAi.extractionBatchId != null) {
      void customerAi.markSuggestionDecisions(customerAi.extractionBatchId, [
        { field_key: key, decision: "skip" },
      ]);
    }
    setReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleSkipEnrichField = (key: string) => {
    if (customerAi.enrichBatchId != null) {
      void customerAi.markSuggestionDecisions(customerAi.enrichBatchId, [{ field_key: key, decision: "skip" }]);
    }
    setEnrichReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleResolveExtractConflict = async (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      if (customerAi.extractionBatchId != null) {
        void customerAi.markSuggestionDecisions(customerAi.extractionBatchId, [
          { field_key: key, decision: "reject" },
        ]);
      }
      setReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
      return;
    }
    const res = customerAi.extraction;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const v = formatExtractedValue(ef.value);
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(ef.confidence);
    applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
    setReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
    );
    const bid = customerAi.extractionBatchId;
    if (bid != null) {
      try {
        await customerAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("CustomerCreate.markAiDecision", e);
      }
    }
  };

  const handleResolveEnrichConflict = async (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      if (customerAi.enrichBatchId != null) {
        void customerAi.markSuggestionDecisions(customerAi.enrichBatchId, [
          { field_key: key, decision: "reject" },
        ]);
      }
      setEnrichReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
      return;
    }
    const res = customerAi.enrich;
    if (!res?.suggestions[key]) return;
    const sug = res.suggestions[key];
    const v = formatExtractedValue(sug.value);
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(sug.confidence);
    applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
    setEnrichReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
    );
    const bid = customerAi.enrichBatchId;
    if (bid != null) {
      try {
        await customerAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
      } catch (e) {
        logApiError("CustomerCreate.markAiEnrich", e);
      }
    }
  };

  const handleLogoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    if (!allowedTypes.has(selected.type)) {
      setError("Unsupported logo type. Use PNG, JPG, GIF, or WEBP.");
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      setError("Logo file is too large. Maximum size is 2MB.");
      return;
    }
    setError("");
    setLogoUploading(true);
    try {
      const result = await api.uploadCustomerLogo(selected);
      setForm((prev) => ({ ...prev, companyLogoUrl: result.logo_url }));
      setSuccess("Logo uploaded successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const submit = async (mode: "close" | "addAnother") => {
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createCustomer(toPayload());
      const finalizeIds = [
        ...new Set(
          [customerAi.extractionBatchId, customerAi.enrichBatchId].filter((x): x is number => x != null),
        ),
      ];
      for (const batchId of finalizeIds) {
        try {
          await customerAi.finalizeSuggestionBatchAfterCreate(created.id, batchId);
        } catch (e) {
          logApiError("CustomerCreate.finalizeAiBatch", e);
        }
      }
      if (mode === "addAnother") {
        resetForm();
        setSuccess("Customer created. You can now add another one.");
      } else {
        navigate("/app/customers");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create customer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/app/customers" className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Customer Profile</h1>
          <p className="mt-1 text-sm text-text-muted">
            Provide comprehensive details for the new business entity to streamline invoicing and communication.
          </p>
          <p className="mt-1 text-xs text-text-muted">Fields marked with ** are mandatory.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}
      {success && (
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(260px,320px)] items-start">
        <div className="min-w-0 space-y-6">
      <FileImportCard
        title="Import Customer Info"
        subtitle="Upload a business card, company profile, letterhead, form, email screenshot, or registration document to auto-fill known fields."
        status={extractUiStatus}
        error={customerAi.error}
        onExtract={handleExtractFile}
        onClear={handleClearImport}
      />

      <ExtractionStatusBanner
        status={extractUiStatus}
        extractedCount={Object.values(customerAi.extraction?.fields ?? {}).filter(
          (f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== "",
        ).length}
        warnings={[
          ...(customerAi.extraction?.warnings ?? []),
          ...(customerAi.extraction?.unmapped_text?.map((t) => "Unmapped: " + t) ?? []),
        ]}
        error={customerAi.error}
      />

      {customerAi.extraction && customerAi.extraction.duplicate_warnings.length > 0 ? (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm">
          <p className="font-medium text-text-primary">Possible duplicate customers</p>
          <ul className="text-text-secondary mt-1 list-inside list-disc">
            {customerAi.extraction.duplicate_warnings.map((d) => (
              <li key={d.field + "-" + d.existing_id}>
                {`${d.field}: similar to "${d.existing_value}" (ID ${d.existing_id})`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestSameAsBilling ? (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-3 py-3 text-sm text-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p>
            Billing address was detected but shipping was not. If delivery is the same, enable{" "}
            <strong>Same as billing</strong> for shipping.
          </p>
          <button
            type="button"
            onClick={() => patchForm({ sameAsBilling: true })}
            className="shrink-0 rounded-lg border border-brand-primary/40 bg-surface-base px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10"
          >
            Enable same as billing
          </button>
        </div>
      ) : null}

      {reviewRows.length > 0 && customerAi.extraction ? (
        <AutofillReviewPanel
          title="Review extracted fields"
          fields={reviewRows}
          onApply={(k) => void handleApplyExtractField(k)}
          onApplyAllHigh={() => void handleApplyAllHighExtract()}
          onSkip={handleSkipExtractField}
          onResolveConflict={(k, c) => void handleResolveExtractConflict(k, c)}
          persistNote="Applies merge into the form here; when you create the customer, the server records which AI fields you accepted (audited)."
        />
      ) : null}
      {enrichReviewRows.length > 0 && customerAi.enrich ? (
        <AutofillReviewPanel
          title="Review enrichment suggestions"
          fields={enrichReviewRows}
          valueColumnLabel="AI suggested"
          onApply={(k) => void handleApplyEnrichField(k)}
          onApplyAllHigh={() => void handleApplyAllHighEnrich()}
          onSkip={handleSkipEnrichField}
          onResolveConflict={(k, c) => void handleResolveEnrichConflict(k, c)}
          persistNote="Same as extract: merges into the form; finalize-after-create records accepted fields per batch."
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit("close");
        }}
        className="space-y-6"
      >
        <CustomerFormFields
          form={form}
          patchForm={patchForm}
          setForm={setForm}
          shippingValues={shippingValues}
          clearAutofillKeys={clearAutofillKeys}
          autofilled={autofilled}
          autofillBorder={autofillBorder}
          logoFileInputRef={logoFileInputRef}
          companyLogoDisplayUrl={companyLogoDisplayUrl}
          logoUploading={logoUploading}
          onLogoPick={handleLogoPick}
        />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/app/customers"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => void submit("addAnother")}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/10 disabled:opacity-60"
          >
            <PlusCircle className="h-4 w-4" />
            Save & Add Another
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Saving..." : "Save Customer"}
          </button>
        </div>
      </form>
        </div>
        <CustomerAiPanel
          className="xl:sticky xl:top-4"
          ai={customerAi}
          mode="create"
          formSnapshot={{
            ...customerFormSnapshot(form),
            customerType: form.customerType,
            status: form.status,
          }}
        />
      </div>
    </div>
  );
}
