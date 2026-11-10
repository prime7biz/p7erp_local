import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, type HrDocExtractionResponse, type HrEmployeeCreate } from "@/api/client";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { useAuth } from "@/context/AuthContext";
import { useHrDocExtraction, type HrDocExtractionKind } from "@/hooks/useHrDocExtraction";
import { readExtractedField, type HrExtractionTarget } from "@/lib/hrExtractedFields";

const PREFIX = "/app/hr";

const MERGED_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "date_of_birth",
  "gender",
  "national_id",
  "address_line",
  "city",
  "country",
  "joining_date",
  "employment_type",
] as const satisfies readonly (HrExtractionTarget & keyof HrEmployeeCreate)[];

function mergeFields(target: HrEmployeeCreate, response: HrDocExtractionResponse | null): HrEmployeeCreate {
  if (!response) return target;
  const next = { ...target };
  for (const key of MERGED_FIELDS) {
    const v = readExtractedField(response.fields, key);
    if (v) (next as Record<string, unknown>)[key] = v;
  }
  return next;
}

type DocSlot = { kind: HrDocExtractionKind; title: string; subtitle: string };

const DOC_SLOTS: DocSlot[] = [
  { kind: "cv", title: "CV / Resume", subtitle: "Upload a CV to pre-fill name, contact, and experience." },
  { kind: "national-id", title: "National ID", subtitle: "Upload NID to capture ID number and date of birth." },
  { kind: "birth-certificate", title: "Birth certificate", subtitle: "Upload birth certificate for age verification." },
  { kind: "medical-certificate", title: "Medical certificate", subtitle: "Optional fitness certificate details." },
];

function DocUploadSection({
  slot,
  onMerged,
}: {
  slot: DocSlot;
  onMerged: (response: HrDocExtractionResponse) => void;
}) {
  const { status, error, response, extract, clear } = useHrDocExtraction(slot.kind);

  const handleExtract = async (file: File) => {
    await extract(file);
  };

  const apply = () => {
    if (response) onMerged(response);
  };

  return (
    <div className="space-y-2">
      <FileImportCard
        title={slot.title}
        subtitle={slot.subtitle}
        status={status}
        error={error}
        onExtract={handleExtract}
        onClear={clear}
      />
      {response && status !== "uploading" && (
        <button
          type="button"
          onClick={apply}
          className="rounded border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle"
        >
          Apply {slot.title} fields to form
        </button>
      )}
    </div>
  );
}

/** With the unified workspace on, AI autofill lives in Add employee, so the old page redirects there. */
export function AiEmployeeOnboardingPage() {
  const { me } = useAuth();
  if (me?.feature_flags?.hr_onboarding_workspace_v2 === true) return <Navigate to="/app/hr/employees/new" replace />;
  return <LegacyAiEmployeeOnboardingPage />;
}

function LegacyAiEmployeeOnboardingPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const flags = me?.feature_flags;
  const ocrEnabled =
    flags?.ocr_cv_extraction_enabled === true ||
    flags?.ocr_id_extraction_enabled === true ||
    flags?.ocr_medical_extraction_enabled === true;

  const [form, setForm] = useState<HrEmployeeCreate>({
    employee_code: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    gender: "",
    national_id: "",
    address_line: "",
    city: "",
    country: "",
    joining_date: "",
    employment_type: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = useMemo(
    () => form.first_name.trim().length > 0,
    [form.first_name],
  );

  const onMerged = useCallback((response: HrDocExtractionResponse) => {
    setForm((prev) => mergeFields(prev, response));
    setSuccess("Extracted fields applied — review before creating employee.");
  }, []);

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await api.createHrEmployee({
        ...form,
        employee_code: undefined,
        first_name: form.first_name.trim(),
        last_name: form.last_name?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender?.trim() || null,
        national_id: form.national_id?.trim() || null,
        address_line: form.address_line?.trim() || null,
        city: form.city?.trim() || null,
        country: form.country?.trim() || null,
        joining_date: form.joining_date || null,
        employment_type: form.employment_type?.trim() || null,
      });
      navigate(`/app/hr/employees/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setSaving(false);
    }
  };

  const visibleSlots = useMemo(() => {
    return DOC_SLOTS.filter((slot) => {
      if (slot.kind === "cv") return flags?.ocr_cv_extraction_enabled === true;
      if (slot.kind === "national-id" || slot.kind === "birth-certificate") {
        return flags?.ocr_id_extraction_enabled === true;
      }
      if (slot.kind === "medical-certificate") return flags?.ocr_medical_extraction_enabled === true;
      return false;
    });
  }, [flags]);

  if (!ocrEnabled) {
    return (
      <div className="space-y-6">
        <HrPageHeader
          title="AI employee onboarding"
          description="Upload HR documents, review extracted fields, then confirm to create the employee."
          breadcrumbs={[
            { label: "HR", href: PREFIX },
            { label: "Employees", href: `${PREFIX}/employees` },
            { label: "AI Onboarding" },
          ]}
        />
        <div className="rounded-xl border border-border bg-surface-subtle p-6 text-sm text-text-secondary">
          Document OCR is off. Enable CV, ID, or medical OCR under{" "}
          <Link to="/app/settings/config" className="text-brand-primary underline">
            Settings → Configuration
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="AI employee onboarding"
        description="Upload HR documents, review extracted fields, then confirm to create the employee."
        breadcrumbs={[
          { label: "HR", href: PREFIX },
          { label: "Employees", href: `${PREFIX}/employees` },
          { label: "AI Onboarding" },
        ]}
      />

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {success}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleSlots.map((slot) => (
          <DocUploadSection key={slot.kind} slot={slot} onMerged={onMerged} />
        ))}
      </div>

      {visibleSlots.length === 0 && (
        <p className="text-sm text-text-muted">No OCR document types are enabled for this company.</p>
      )}

      <form onSubmit={onConfirm} className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        <p className="text-sm font-medium text-text-primary">Employee details (edit before save)</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary" aria-label="Employee number">
            Employee number: assigned automatically on save (never reused)
          </div>
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="First name *"
            value={form.first_name}
            onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
            required
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Last name"
            value={form.last_name ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Email"
            value={form.email ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <input
            type="date"
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.date_of_birth ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Gender"
            value={form.gender ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="National ID"
            value={form.national_id ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, national_id: e.target.value }))}
          />
          <input
            className="sm:col-span-2 rounded border border-border px-3 py-2 text-sm"
            placeholder="Address"
            value={form.address_line ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, address_line: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="City"
            value={form.city ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Country"
            value={form.country ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
          />
          <input
            type="date"
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.joining_date ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, joining_date: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Employment type"
            value={form.employment_type ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, employment_type: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(`${PREFIX}/employees`)}
            className="rounded border border-border-strong px-4 py-2 text-sm text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Creating..." : "Confirm & create employee"}
          </button>
        </div>
      </form>
    </div>
  );
}
