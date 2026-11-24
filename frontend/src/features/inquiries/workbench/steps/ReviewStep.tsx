import type { InquiryCreate } from "@/api/client";
import {
  estimatedValue,
  missingRecommendedFields,
  PRODUCT_FIELDS,
  readinessScore,
  RECOMMENDED_FIELDS,
  type InquiryLike,
} from "@/features/inquiries/workbench/inquiryReadiness";
import { inquiryTypeLabel } from "@/features/inquiries/workbench/inquiryDepartments";

type Props = {
  form: InquiryCreate;
  customerName?: string;
  styleLabel?: string;
};

function fieldFilled(inquiry: InquiryLike, key: string): boolean {
  const raw = inquiry[key as keyof InquiryLike];
  if (key === "style_id") return raw != null && Number(raw) > 0;
  if (key === "quantity") return raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0;
  if (Array.isArray(raw)) return raw.length > 0;
  return raw != null && String(raw).trim() !== "";
}

export function ReviewStep({ form, customerName, styleLabel }: Props) {
  const score = readinessScore(form);
  const missing = missingRecommendedFields(form);
  const est = estimatedValue(form.quantity, form.target_price);

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">Step 5 — Review</h2>
      <p className="text-xs text-text-muted">
        Check readiness before saving. Missing recommended fields still allow a draft, but conversion to
        quotation works better when they are filled.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <div className="text-xs text-text-muted">Readiness</div>
          <div className="text-2xl font-bold text-text-primary">{score}%</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <div className="text-xs text-text-muted">Estimated value</div>
          <div className="text-lg font-semibold text-text-primary">
            {est} {form.target_price_currency || "USD"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
          <div className="text-xs text-text-muted">Customer / Style</div>
          <div className="text-sm font-medium text-text-primary truncate" title={customerName}>
            {customerName || "—"}
          </div>
          <div className="text-xs text-text-muted truncate" title={styleLabel}>
            {styleLabel || "—"}
          </div>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
          Missing recommended: {missing.join(", ")}.
        </div>
      ) : (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">
          All recommended fields for quotation prefill are filled.
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Recommended checklist
        </h3>
        <ul className="space-y-1 text-sm">
          {RECOMMENDED_FIELDS.map((f) => (
            <li key={f.key} className="flex items-center gap-2">
              <span
                className={
                  fieldFilled(form, f.key) ? "text-status-success-foreground" : "text-status-warning-foreground"
                }
              >
                {fieldFilled(form, f.key) ? "✓" : "○"}
              </span>
              <span className="text-text-secondary">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Product extras
        </h3>
        <ul className="grid gap-1 sm:grid-cols-2 text-sm">
          {PRODUCT_FIELDS.map((f) => (
            <li key={f.key} className="flex items-center gap-2">
              <span className={fieldFilled(form, f.key) ? "text-status-success-foreground" : "text-text-muted"}>
                {fieldFilled(form, f.key) ? "✓" : "○"}
              </span>
              <span className="text-text-secondary">{f.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs text-text-muted">Inquiry type</dt>
          <dd className="text-text-primary">{inquiryTypeLabel(form.inquiry_type)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Quantity</dt>
          <dd className="text-text-primary">
            {form.quantity != null ? form.quantity.toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Target price</dt>
          <dd className="text-text-primary">
            {form.target_price || "—"} {form.target_price_currency || ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Delivery</dt>
          <dd className="text-text-primary">{form.expected_delivery_date || "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
