import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { api, type CustomerUpdate } from "@/api/client";
import { AutofillReviewPanel } from "@/components/ai-extract/AutofillReviewPanel";
import { ExtractionStatusBanner } from "@/components/ai-extract/ExtractionStatusBanner";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { CustomerAiPanel } from "@/components/customers/CustomerAiPanel";
import { CustomerFormFields } from "@/components/customers/CustomerFormFields";
import {
  buildCustomerUpdatePayload,
  customerFromApiToFormState,
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

export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<CustomerFormState | null>(null);
  const companyLogoDisplayUrl = useSecureImage(form?.companyLogoUrl);

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
  const [aiUndoStack, setAiUndoStack] = useState<CustomerFormState[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError("Invalid customer id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const customer = await api.getCustomer(Number(id));
        setForm(customerFromApiToFormState(customer));
        customerAi.clear();
        setAutofilled({});
        setReviewRows([]);
        setEnrichReviewRows([]);
        setAiUndoStack([]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load customer.");
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset AI state when navigating to another id
  }, [id]);

  useEffect(() => {
    const res = customerAi.extraction;
    if (!res || !form) {
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
    if (!res || !form) {
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

  const shippingValues = useMemo(() => {
    if (!form) {
      return {
        shippingAddressLine1: "",
        shippingCity: "",
        shippingPostalCode: "",
        shippingCountry: "",
      };
    }
    return shippingValuesFromForm(form);
  }, [form]);

  const patchForm = (patch: Partial<CustomerFormState>) => {
    if (!form) return;
    setAutofilled((af) => {
      const n = { ...af };
      for (const k of Object.keys(patch)) {
        delete n[k];
      }
      return n;
    });
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const clearAutofillKeys = (...keys: string[]) => {
    setAutofilled((af) => {
      const n = { ...af };
      for (const k of keys) delete n[k];
      return n;
    });
  };

  const pushAiUndoSnapshot = () => {
    if (form) setAiUndoStack((s) => [...s, { ...form }]);
  };

  const applyExtractedPatch = (
    patch: Partial<CustomerFormState>,
    levels: Partial<Record<string, FieldConfidence>>,
  ) => {
    pushAiUndoSnapshot();
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setAutofilled((prev) => ({ ...prev, ...levels }));
  };

  const handleUndoLastAi = async () => {
    if (!id) return;
    if (aiUndoStack.length === 0) return;
    const prevForm = aiUndoStack[aiUndoStack.length - 1];
    if (!prevForm) return;
    setError("");
    try {
      await api.updateCustomer(Number(id), buildCustomerUpdatePayload(prevForm, shippingValuesFromForm(prevForm)));
      setForm(prevForm);
      setAutofilled({});
      setAiUndoStack((s) => s.slice(0, -1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo AI apply on the server.");
    }
  };

  const handleExtractFile = async (file: File) => {
    if (!id) return;
    await customerAi.runExtract(file, Number(id));
  };

  const handleClearImport = () => {
    void customerAi.discardAiResults();
    setReviewRows([]);
    setEnrichReviewRows([]);
  };

  const handleApplyExtractField = async (key: string) => {
    const res = customerAi.extraction;
    if (!res?.fields[key] || !form || !id) return;
    const ef = res.fields[key];
    const level = deriveConfidenceLevel(typeof ef.confidence === "number" ? ef.confidence : 0);
    const bid = customerAi.extractionBatchId;
    if (bid == null) {
      const v = formatExtractedValue(ef.value);
      applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
      setReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      return;
    }
    const snapshot = { ...form };
    setError("");
    try {
      const out = await customerAi.applySuggestionsToCustomer(
        Number(id),
        bid,
        [{ field_key: key, decision: "apply" }],
        "overwrite",
      );
      if (out.conflicts.some((c) => c.field === key)) {
        setError("Could not apply this field. Try again or edit manually.");
        return;
      }
      setForm(customerFromApiToFormState(out.customer));
      setAiUndoStack((s) => [...s, snapshot]);
      setAutofilled((prev) => ({ ...prev, [key]: level }));
      setReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleApplyEnrichField = async (key: string) => {
    const res = customerAi.enrich;
    if (!res?.suggestions[key] || !form || !id) return;
    const sug = res.suggestions[key];
    const level = deriveConfidenceLevel(typeof sug.confidence === "number" ? sug.confidence : 0);
    const bid = customerAi.enrichBatchId;
    if (bid == null) {
      const v = formatExtractedValue(sug.value);
      applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
      setEnrichReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      return;
    }
    const snapshot = { ...form };
    setError("");
    try {
      const out = await customerAi.applySuggestionsToCustomer(
        Number(id),
        bid,
        [{ field_key: key, decision: "apply" }],
        "overwrite",
      );
      if (out.conflicts.some((c) => c.field === key)) {
        setError("Could not apply this field. Try again or edit manually.");
        return;
      }
      setForm(customerFromApiToFormState(out.customer));
      setAiUndoStack((s) => [...s, snapshot]);
      setAutofilled((prev) => ({ ...prev, [key]: level }));
      setEnrichReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleApplyAllHighExtract = async () => {
    const res = customerAi.extraction;
    if (!res || !form || !id) return;
    const toApply = reviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const bid = customerAi.extractionBatchId;
    if (bid == null) {
      pushAiUndoSnapshot();
      const patch: Partial<CustomerFormState> = {};
      const levels: Partial<Record<string, FieldConfidence>> = {};
      for (const row of toApply) {
        const ef = res.fields[row.fieldKey];
        if (!ef) continue;
        (patch as Record<string, string>)[row.fieldKey] = formatExtractedValue(ef.value);
        levels[row.fieldKey] = deriveConfidenceLevel(ef.confidence);
      }
      setForm((prev) => (prev ? { ...prev, ...patch } : prev));
      setAutofilled((prev) => ({ ...prev, ...levels }));
      setReviewRows((rs) =>
        rs.map((r) =>
          toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      return;
    }
    const snapshot = { ...form };
    setError("");
    try {
      const out = await customerAi.applySuggestionsToCustomer(
        Number(id),
        bid,
        toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        "skip_if_different",
      );
      setForm(customerFromApiToFormState(out.customer));
      setAiUndoStack((s) => [...s, snapshot]);
      const levels: Partial<Record<string, FieldConfidence>> = {};
      for (const row of toApply) {
        const ef = res.fields[row.fieldKey];
        if (ef) levels[row.fieldKey] = deriveConfidenceLevel(ef.confidence);
      }
      setAutofilled((prev) => ({ ...prev, ...levels }));
      const appliedSet = new Set(out.applied_fields);
      setReviewRows((rs) =>
        rs.map((r) =>
          appliedSet.has(r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      if (out.conflicts.length > 0) {
        setError(
          `${out.conflicts.length} field(s) skipped because saved values changed. Review conflicts and apply individually if needed.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleApplyAllHighEnrich = async () => {
    const res = customerAi.enrich;
    if (!res || !form || !id) return;
    const toApply = enrichReviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const bid = customerAi.enrichBatchId;
    if (bid == null) {
      pushAiUndoSnapshot();
      const patch: Partial<CustomerFormState> = {};
      const levels: Partial<Record<string, FieldConfidence>> = {};
      for (const row of toApply) {
        const sug = res.suggestions[row.fieldKey];
        if (!sug) continue;
        (patch as Record<string, string>)[row.fieldKey] = formatExtractedValue(sug.value);
        levels[row.fieldKey] = deriveConfidenceLevel(sug.confidence);
      }
      setForm((prev) => (prev ? { ...prev, ...patch } : prev));
      setAutofilled((prev) => ({ ...prev, ...levels }));
      setEnrichReviewRows((rs) =>
        rs.map((r) =>
          toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      return;
    }
    const snapshot = { ...form };
    setError("");
    try {
      const out = await customerAi.applySuggestionsToCustomer(
        Number(id),
        bid,
        toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        "skip_if_different",
      );
      setForm(customerFromApiToFormState(out.customer));
      setAiUndoStack((s) => [...s, snapshot]);
      const levels: Partial<Record<string, FieldConfidence>> = {};
      for (const row of toApply) {
        const sug = res.suggestions[row.fieldKey];
        if (sug) levels[row.fieldKey] = deriveConfidenceLevel(sug.confidence);
      }
      setAutofilled((prev) => ({ ...prev, ...levels }));
      const appliedSet = new Set(out.applied_fields);
      setEnrichReviewRows((rs) =>
        rs.map((r) =>
          appliedSet.has(r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      if (out.conflicts.length > 0) {
        setError(
          `${out.conflicts.length} field(s) skipped because saved values changed. Review conflicts and apply individually if needed.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
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
    if (!res?.fields[key] || !form || !id) return;
    const ef = res.fields[key];
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(ef.confidence);
    const bid = customerAi.extractionBatchId;
    if (bid == null) {
      const v = formatExtractedValue(ef.value);
      applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
      setReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      return;
    }
    const snapshot = { ...form };
    setError("");
    try {
      const mode = choice === "merge" ? "skip_if_different" : "overwrite";
      const out = await customerAi.applySuggestionsToCustomer(
        Number(id),
        bid,
        [{ field_key: key, decision: "apply" }],
        mode,
      );
      setForm(customerFromApiToFormState(out.customer));
      setAiUndoStack((s) => [...s, snapshot]);
      setAutofilled((prev) => ({ ...prev, [key]: level }));
      setReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
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
    if (!res?.suggestions[key] || !form || !id) return;
    const sug = res.suggestions[key];
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(sug.confidence);
    const bid = customerAi.enrichBatchId;
    if (bid == null) {
      const v = formatExtractedValue(sug.value);
      applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
      setEnrichReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      return;
    }
    const snapshot = { ...form };
    setError("");
    try {
      const mode = choice === "merge" ? "skip_if_different" : "overwrite";
      const out = await customerAi.applySuggestionsToCustomer(
        Number(id),
        bid,
        [{ field_key: key, decision: "apply" }],
        mode,
      );
      setForm(customerFromApiToFormState(out.customer));
      setAiUndoStack((s) => [...s, snapshot]);
      setAutofilled((prev) => ({ ...prev, [key]: level }));
      setEnrichReviewRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const validate = (): string | null => {
    if (!form) return "Form is not ready.";
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

  const toPayload = (): CustomerUpdate => {
    if (!form) return {};
    return buildCustomerUpdatePayload(form, shippingValues);
  };

  const handleLogoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected || !form) return;
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
      setForm((prev) => (prev ? { ...prev, companyLogoUrl: result.logo_url } : prev));
      setSuccess("Logo uploaded successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const submit = async () => {
    if (!id || !form) return;
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await api.updateCustomer(Number(id), toPayload());
      setSuccess("Customer updated successfully.");
      navigate(`/app/customers/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update customer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-text-muted">Loading customer for edit...</div>;
  }

  if (!form) {
    return (
      <div className="space-y-3 p-6">
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error || "Customer not found."}
        </div>
        <Link to="/app/customers" className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle">
          Back to customers
        </Link>
      </div>
    );
  }

  const numericId = Number(id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/app/customers/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to customer details
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Edit Customer Profile</h1>
          <p className="mt-1 text-sm text-text-muted">Update full customer profile details using the advanced form.</p>
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
            title="Import / refresh from document"
            subtitle="Upload an updated company profile or card to suggest field changes (review before saving)."
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

          {reviewRows.length > 0 && customerAi.extraction ? (
            <AutofillReviewPanel
              title="Review extracted fields"
              fields={reviewRows}
              onApply={(k) => void handleApplyExtractField(k)}
              onApplyAllHigh={() => void handleApplyAllHighExtract()}
              onSkip={handleSkipExtractField}
              onResolveConflict={(k, c) => void handleResolveExtractConflict(k, c)}
              persistNote="On edit, each Apply updates the saved customer immediately (server-side, audited)."
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
              persistNote="On edit, each Apply updates the saved customer immediately (server-side, audited)."
            />
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-6"
          >
            <CustomerFormFields
              form={form}
              patchForm={patchForm}
              setForm={(u) => setForm((prev) => (prev ? (typeof u === "function" ? u(prev) : u) : prev))}
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
              {aiUndoStack.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleUndoLastAi()}
                  className="mr-auto rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
                >
                  Undo last AI apply
                </button>
              ) : null}
              <Link
                to={`/app/customers/${id}`}
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {submitting ? "Updating..." : "Update Customer"}
              </button>
            </div>
          </form>
        </div>

        <CustomerAiPanel
          className="xl:sticky xl:top-4"
          ai={customerAi}
          mode="edit"
          customerId={numericId}
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
