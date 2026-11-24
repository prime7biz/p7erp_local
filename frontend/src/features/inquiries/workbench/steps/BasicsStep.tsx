import { useState, type ReactNode } from "react";
import { api, type CustomerIntermediaryLinkResponse, type CustomerResponse, type InquiryCreate, type StyleResponse } from "@/api/client";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { INQUIRY_TYPE_OPTIONS } from "@/features/inquiries/workbench/inquiryDepartments";
import { fetchActiveCustomerPage, fetchStylePage, hydrateCustomer, hydrateStyle } from "@/lib/remoteSelectFetchers";
import { cn } from "@/lib/utils";
import { logApiError } from "@/utils/logApiError";

const INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0";

type Props = {
  form: InquiryCreate;
  onPatch: (patch: Partial<InquiryCreate>) => void;
  onCustomerChange: (
    customerId: number,
    customerName?: string,
    customerMeta?: CustomerResponse | null,
  ) => void;
  onStyleChange: (styleId: number | undefined, style?: StyleResponse | null) => void;
  onIntermediaryChange: (linkId: number | undefined) => void;
  customerLinks: CustomerIntermediaryLinkResponse[];
  buyerDefaultsHint?: string;
  /** Optional AI import block (create only). */
  importSlot?: ReactNode;
};

export function BasicsStep({
  form,
  onPatch,
  onCustomerChange,
  onStyleChange,
  onIntermediaryChange,
  customerLinks,
  buyerDefaultsHint,
  importSlot,
}: Props) {
  const [showQuickStyle, setShowQuickStyle] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickSeason, setQuickSeason] = useState("");
  const [quickDepartment, setQuickDepartment] = useState("");
  const [creatingStyle, setCreatingStyle] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [quickNotice, setQuickNotice] = useState("");

  const intermediaryOptions = customerLinks.map((l) => ({
    value: l.id,
    label: `${l.intermediary_name ?? `#${l.intermediary_id}`}${
      l.intermediary_code ? ` (${l.intermediary_code})` : ""
    }${l.is_primary ? " · primary" : ""}`,
  }));

  const createStyleInline = async () => {
    if (!quickName.trim()) {
      setQuickError("Style name is required.");
      return;
    }
    setCreatingStyle(true);
    setQuickError("");
    setQuickNotice("");
    try {
      const created = await api.createStyle({
        name: quickName.trim(),
        season: quickSeason.trim() || null,
        department: quickDepartment.trim() || null,
        buyer_customer_id: form.customer_id || undefined,
        status: "ACTIVE",
      });
      onStyleChange(created.id, created);
      setQuickName("");
      setQuickSeason("");
      setQuickDepartment("");
      setShowQuickStyle(false);
      setQuickNotice(`Style ${created.style_code || created.name} created and selected.`);
    } catch (e) {
      logApiError("BasicsStep.createStyleInline", e);
      setQuickError(e instanceof Error ? e.message : "Failed to create style");
    } finally {
      setCreatingStyle(false);
    }
  };

  return (
    <div className="space-y-4">
      {importSlot}

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">Step 1 — Basics</h2>
        <p className="text-xs text-text-muted">
          Pick the customer and style first. Other product fields fill from the style when empty.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-amber-900">Customer **</span>
            <RemoteSearchSelect<CustomerResponse>
              value={form.customer_id || null}
              onChange={(id, opt) => onCustomerChange(Number(id) || 0, opt?.label, opt?.meta ?? null)}
              fetchPage={fetchActiveCustomerPage}
              hydrateById={hydrateCustomer}
              placeholder="Search customer…"
              className={cn(INPUT, !form.customer_id && "border-2 border-amber-400/90 bg-amber-50/60")}
              aria-label="Customer"
            />
            {buyerDefaultsHint ? (
              <p className="mt-1 text-xs text-text-muted">{buyerDefaultsHint}</p>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-muted">Contact person</span>
            <input
              type="text"
              value={form.contact_person ?? ""}
              onChange={(e) => onPatch({ contact_person: e.target.value })}
              className={INPUT}
              placeholder="Buyer contact name"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-muted">Inquiry type</span>
            <select
              value={form.inquiry_type ?? ""}
              onChange={(e) => onPatch({ inquiry_type: e.target.value || null })}
              className={INPUT}
            >
              <option value="">— Select —</option>
              {INQUIRY_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="block">
            <span className="mb-1 block text-xs font-semibold text-amber-900">Style **</span>
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <RemoteSearchSelect<StyleResponse>
                  value={form.style_id ?? null}
                  onChange={(id, opt) =>
                    onStyleChange(id ? Number(id) : undefined, opt?.meta ?? null)
                  }
                  fetchPage={fetchStylePage}
                  hydrateById={hydrateStyle}
                  placeholder="Search style…"
                  allowClear
                  className={cn(INPUT, !form.style_id && "border-2 border-amber-400/90 bg-amber-50/60")}
                  aria-label="Style"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowQuickStyle((v) => !v);
                  setQuickError("");
                }}
                className="rounded-lg border border-border-strong px-2.5 py-2 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
              >
                {showQuickStyle ? "Close" : "+ Quick add style"}
              </button>
            </div>
          </div>

          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-medium text-text-muted">Intermediary (optional)</span>
            <LocalSearchSelect
              value={form.customer_intermediary_id ?? ""}
              onChange={(v) => onIntermediaryChange(v === "" ? undefined : Number(v))}
              options={intermediaryOptions}
              placeholder={form.customer_id ? "Search intermediary…" : "Select a customer first"}
              allowClear
              disabled={!form.customer_id || intermediaryOptions.length === 0}
              emptyMessage="No intermediaries linked to this customer"
              aria-label="Intermediary"
            />
          </label>
        </div>

        {showQuickStyle ? (
          <div className="rounded-lg border border-status-info/30 bg-status-info-subtle/50 p-3 space-y-3">
            <h3 className="text-xs font-semibold text-status-info-foreground">Quick add style</h3>
            <div className="grid gap-2 md:grid-cols-3">
              <input
                type="text"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Style name (required)"
                className={cn(
                  INPUT,
                  !quickName.trim() && "border-2 border-amber-400/90 bg-amber-50/60",
                )}
              />
              <input
                type="text"
                value={quickSeason}
                onChange={(e) => setQuickSeason(e.target.value)}
                placeholder="Season (optional)"
                className={INPUT}
              />
              <input
                type="text"
                value={quickDepartment}
                onChange={(e) => setQuickDepartment(e.target.value)}
                placeholder="Department (optional)"
                className={INPUT}
              />
            </div>
            <button
              type="button"
              onClick={() => void createStyleInline()}
              disabled={creatingStyle}
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground disabled:opacity-60"
            >
              {creatingStyle ? "Creating…" : "Create style"}
            </button>
            {quickError ? <p className="text-xs text-status-danger-foreground">{quickError}</p> : null}
            <p className="text-xs text-status-info-foreground/80">
              Links the new style to the selected customer when one is set.
            </p>
          </div>
        ) : null}
        {quickNotice ? (
          <p className="text-xs text-status-success-foreground">{quickNotice}</p>
        ) : null}
      </div>
    </div>
  );
}
