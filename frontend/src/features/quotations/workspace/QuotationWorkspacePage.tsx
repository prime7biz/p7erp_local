import { Link, useLocation } from "react-router-dom";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";
import { CollapsibleSection } from "./components/CollapsibleSection";
import { useQuotationWorkspaceController } from "./useQuotationWorkspaceController";
import { CostSummaryCard } from "./sidebar/CostSummaryCard";
import { MarginPricingCard } from "./sidebar/MarginPricingCard";
import { CostBreakdownCard } from "./sidebar/CostBreakdownCard";
import { formatMoney, toSafeNumber } from "./mappers/quotationNumeric";

export function QuotationWorkspacePage({ id }: { id?: string }) {
  const {
    isNew,
    quotation,
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
  } = useQuotationWorkspaceController(id);
  const location = useLocation();
  const isPrintMode = new URLSearchParams(location.search).get("print") === "1";

  if (loading) return <div className="p-6 text-gray-500">Loading quotation...</div>;
  if (error && !quotation) {
    return (
      <div className="p-6 space-y-3">
        <div className="text-red-600 text-sm">{error}</div>
        <button
          type="button"
          onClick={() => navigate("/app/quotations")}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Back to quotations
        </button>
      </div>
    );
  }
  if (!quotation) return null;

  const showEditableHeader = isNew || isEditing;
  const findCategoryName = (value: number | null) =>
    value == null ? "" : categories.find((c) => c.id === value)?.name ?? "";
  const findItemName = (value: number | null) =>
    value == null ? "" : items.find((c) => c.id === value)?.name ?? "";

  const trimsCost = otherCosts
    .filter((c) => c.cost_head.toLowerCase().includes("trim"))
    .reduce((acc, c) => acc + (toSafeNumber(c.calculated_amount) || toSafeNumber(c.total_amount)), 0);
  const washFinishCost = otherCosts
    .filter((c) => {
      const key = c.cost_head.toLowerCase();
      return key.includes("wash") || key.includes("finish");
    })
    .reduce((acc, c) => acc + (toSafeNumber(c.calculated_amount) || toSafeNumber(c.total_amount)), 0);
  const overheadCost = otherCosts
    .filter((c) => c.cost_head.toLowerCase().includes("overhead"))
    .reduce((acc, c) => acc + (toSafeNumber(c.calculated_amount) || toSafeNumber(c.total_amount)), 0);
  const factoryMarginAmount =
    (toSafeNumber(quotation.quoted_price) || toSafeNumber(quotation.total_amount)) -
    (toSafeNumber(quotation.total_cost) || totals.total);
  const factoryMarginPercent =
    (toSafeNumber(quotation.profit_percentage) ||
      (totals.total ? (factoryMarginAmount / totals.total) * 100 : 0));

  return (
    <div className="print-report space-y-4 p-4 lg:space-y-6 lg:p-6">
      <div className="print-only mb-3 border-b border-gray-200 pb-2">
        <h1 className="text-2xl font-bold text-gray-900">Quotation {quotation.quotation_code}</h1>
        <div className="text-sm text-gray-600">
          {customer?.name ?? `Customer #${quotation.customer_id}`} · {quotation.status}
        </div>
      </div>

      <header className="no-print flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotation {quotation.quotation_code}</h1>
          <p className="text-sm text-gray-500">
            {customer?.name ?? `Customer #${quotation.customer_id}`} · {quotation.status}
          </p>
          {showEditableHeader && <p className="mt-1 text-xs text-gray-500">Fields marked with ** are mandatory.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={() => window.open(`/app/quotations/${quotation.id}/print`, "_blank", "noopener,noreferrer")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              Print / Save PDF
            </button>
          )}
          {!isNew && (
            <button
              type="button"
              onClick={duplicateAsNewVersion}
              disabled={duplicatingVersion}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 disabled:opacity-60"
            >
              {duplicatingVersion ? "Duplicating..." : "Duplicate as new version"}
            </button>
          )}
          {isNew ? (
            <button
              type="button"
              onClick={() => navigate("/app/quotations")}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing((v) => !v)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
              >
                {isEditing ? "Cancel edit" : "Edit costing"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/app/quotations")}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
              >
                Back to list
              </button>
            </>
          )}
          {isEditing && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || creatingStyle}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save costing"}
            </button>
          )}
        </div>
      </header>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6">
        <div className="space-y-4 xl:col-span-8 2xl:col-span-9">
          <CollapsibleSection title={showEditableHeader ? "Quotation Basics" : "Quotation Summary"}>
            {showEditableHeader ? (
              <div className="space-y-3 text-sm">
                {isNew && (
                  <>
                    <div>
                      <label className="mb-0.5 block font-medium text-gray-700">Customer **</label>
                      <select
                        value={quotation.customer_id || ""}
                        onChange={(e) => handleCustomerSelect(Number(e.target.value) || 0)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">Select customer...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.customer_code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block font-medium text-gray-700">Link to inquiry (optional)</label>
                      <select
                        value={quotation.inquiry_id ?? ""}
                        onChange={(e) => handleInquirySelect(e.target.value ? Number(e.target.value) : null)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {inquiries.map((inq) => (
                          <option key={inq.id} value={inq.id}>
                            {inq.inquiry_code} · {inq.style_ref ?? "—"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {!isNew && (
                  <div className="space-y-1 text-gray-700">
                    <div>
                      <span className="font-medium">Customer:</span> {customer?.name ?? `#${quotation.customer_id}`}
                    </div>
                    <div>
                      <span className="font-medium">Linked inquiry:</span>{" "}
                      {inquiry ? (
                        <Link to={`/app/inquiries/${inquiry.id}`} className="text-indigo-600 hover:underline">
                          {inquiry.inquiry_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="mb-0.5 block font-medium text-gray-700">Style</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                      <select
                        value={quotation.style_id ?? ""}
                        onChange={(e) => onStyleSelect(e.target.value ? Number(e.target.value) : null)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                        className="rounded border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {showQuickStyleCreate ? "Close quick add" : "Quick add style"}
                      </button>
                    </div>
                    {showQuickStyleCreate && (
                      <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <input
                            type="text"
                            value={quickStyleName}
                            onChange={(e) => setQuickStyleName(e.target.value)}
                            placeholder="Style name **"
                            className="rounded border border-blue-200 px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            value={quickStyleSeason}
                            onChange={(e) => setQuickStyleSeason(e.target.value)}
                            placeholder="Season (optional)"
                            className="rounded border border-blue-200 px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            value={quickStyleDepartment}
                            onChange={(e) => setQuickStyleDepartment(e.target.value)}
                            placeholder="Department (optional)"
                            className="rounded border border-blue-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="cursor-pointer rounded border border-blue-200 px-2 py-1 text-xs text-blue-800 hover:bg-blue-100">
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
                      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {quickStyleNotice}
                      </div>
                    )}
                    {(selectedStyle || quotation.style_ref) && (
                      <div className="text-xs text-gray-600">
                        {selectedStyle ? `${selectedStyle.style_code} - ${selectedStyle.name}` : quotation.style_ref}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Shipping term</label>
                    <select
                      value={quotation.shipping_term ?? ""}
                      onChange={(e) => updateQuotationHeader({ shipping_term: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                    <label className="mb-0.5 block font-medium text-gray-700">Department</label>
                    <input
                      type="text"
                      value={quotation.department ?? ""}
                      onChange={(e) => updateQuotationHeader({ department: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Projected quantity</label>
                    <input
                      type="number"
                      min={0}
                      value={quotation.projected_quantity ?? ""}
                      onChange={(e) =>
                        updateQuotationHeader({ projected_quantity: e.target.value ? Number(e.target.value) : null })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Target price</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={quotation.target_price ?? ""}
                        onChange={(e) => updateQuotationHeader({ target_price: e.target.value || null })}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={quotation.target_price_currency ?? "USD"}
                        onChange={(e) => updateQuotationHeader({ target_price_currency: e.target.value || null })}
                        className="w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Quotation date</label>
                    <input
                      type="date"
                      value={quotation.quotation_date ? quotation.quotation_date.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateQuotationHeader({ quotation_date: e.target.value ? `${e.target.value}T00:00:00` : null })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Projected delivery date</label>
                    <input
                      type="date"
                      value={quotation.projected_delivery_date ? quotation.projected_delivery_date.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateQuotationHeader({
                          projected_delivery_date: e.target.value ? `${e.target.value}T00:00:00` : null,
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Valid until</label>
                    <input
                      type="date"
                      value={quotation.valid_until ? quotation.valid_until.slice(0, 10) : ""}
                      onChange={(e) =>
                        updateQuotationHeader({ valid_until: e.target.value ? `${e.target.value}T00:00:00` : null })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Exchange rate</label>
                    <input
                      type="text"
                      value={quotation.exchange_rate ?? "1"}
                      onChange={(e) => updateQuotationHeader({ exchange_rate: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Currency</label>
                    <input
                      type="text"
                      value={quotation.currency ?? "USD"}
                      onChange={(e) => updateQuotationHeader({ currency: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Commission mode</label>
                    <select
                      value={quotation.commission_mode ?? ""}
                      onChange={(e) => updateQuotationHeader({ commission_mode: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                    <label className="mb-0.5 block font-medium text-gray-700">Commission type</label>
                    <select
                      value={quotation.commission_type ?? ""}
                      onChange={(e) => updateQuotationHeader({ commission_type: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                    <label className="mb-0.5 block font-medium text-gray-700">Commission value</label>
                    <input
                      type="text"
                      value={quotation.commission_value ?? ""}
                      onChange={(e) => updateQuotationHeader({ commission_value: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">Pack ratio</label>
                    <input
                      type="text"
                      value={quotation.pack_ratio ?? ""}
                      onChange={(e) => updateQuotationHeader({ pack_ratio: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block font-medium text-gray-700">PCS per carton</label>
                    <input
                      type="number"
                      value={quotation.pcs_per_carton ?? ""}
                      onChange={(e) =>
                        updateQuotationHeader({ pcs_per_carton: e.target.value ? Number(e.target.value) : null })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="mb-0.5 block font-medium text-gray-700">Notes / Assumptions</label>
                  <textarea
                    rows={3}
                    value={quotation.notes ?? ""}
                    onChange={(e) => updateQuotationHeader({ notes: e.target.value || null })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Add commercial assumptions, exclusions, and remarks."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm text-gray-700">
                <div><span className="font-medium">Customer:</span> {customer?.name ?? `#${quotation.customer_id}`}</div>
                <div><span className="font-medium">Department:</span> {quotation.department ?? "—"}</div>
                <div><span className="font-medium">Style:</span> {quotation.style_name ?? quotation.style_ref ?? "—"}</div>
                <div><span className="font-medium">Shipping:</span> {quotation.shipping_term ?? "—"}</div>
                <div><span className="font-medium">Commission:</span> {quotation.commission_mode ?? "-"} / {quotation.commission_type ?? "-"} / {quotation.commission_value ?? "-"}</div>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Fabric Costs / Materials"
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
                      unit: "Yard",
                      consumption_per_dozen: "0",
                      unit_price: "0",
                      amount_per_dozen: "0",
                      total_amount: "0",
                      currency: quotation.currency ?? "USD",
                      exchange_rate: quotation.exchange_rate ?? "1",
                      base_amount: "0",
                      local_amount: "0",
                    },
                  ])
                }
                className="no-print rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 bg-white"
              >
                + Add Fabric
              </button>
            ) : null}
          >
            {materials.length === 0 ? (
              <div className="text-xs text-gray-500">No material lines.</div>
            ) : (
              <div className="relative max-h-[420px] overflow-auto">
                <table className="min-w-[980px] w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Fabric Type / Category</th>
                      <th className="px-2 py-2 text-left">Item / Description</th>
                      <th className="px-2 py-2 text-left">UOM</th>
                      <th className="px-2 py-2 text-right">Cons. (Yds)</th>
                      <th className="px-2 py-2 text-right">Unit Price</th>
                      <th className="px-2 py-2 text-right">Wastage %</th>
                      <th className="px-2 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <select
                              value={m.category_id ?? ""}
                              onChange={(e) => onMaterialChange(idx, { category_id: e.target.value ? Number(e.target.value) : null })}
                              className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
                            >
                              <option value="">—</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          ) : (
                            findCategoryName(m.category_id ?? null) || "—"
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <div className="space-y-1">
                              <select
                                value={m.item_id ?? ""}
                                onChange={(e) => onMaterialChange(idx, { item_id: e.target.value ? Number(e.target.value) : null })}
                                className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
                              >
                                <option value="">Select item…</option>
                                {items.map((it) => (
                                  <option key={it.id} value={it.id}>{it.item_code} · {it.name}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={m.description ?? ""}
                                onChange={(e) => onMaterialChange(idx, { description: e.target.value || null })}
                                className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
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
                              onChange={(e) => onMaterialChange(idx, { unit: e.target.value || null })}
                              className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
                            />
                          ) : (
                            m.unit ?? "—"
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={m.consumption_per_dozen}
                              onChange={(e) => onMaterialChange(idx, { consumption_per_dozen: e.target.value || "0" })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.consumption_per_dozen
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={m.unit_price}
                              onChange={(e) => onMaterialChange(idx, { unit_price: e.target.value || "0" })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.unit_price
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">0</td>
                        <td className="px-2 py-1 text-right font-medium">{m.total_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white">
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={7} className="px-2 py-2 text-right text-sm font-semibold text-gray-700">
                        Fabric Total Cost
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-gray-900">
                        {formatMoney(totals.matTotal)} {quotation.currency ?? ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Labor / CM (Cut and Make)"
            actions={isEditing ? (
              <button
                type="button"
                onClick={() =>
                  setManufacturing((rows) => [
                    ...rows,
                    {
                      serial_no: rows.length + 1,
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
                      exchange_rate: quotation.exchange_rate ?? "1",
                      base_amount: "0",
                      local_amount: "0",
                    },
                  ])
                }
                className="no-print rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 bg-white"
              >
                + Add CM
              </button>
            ) : null}
          >
            {manufacturing.length === 0 ? (
              <div className="text-xs text-gray-500">No manufacturing lines.</div>
            ) : (
              <div className="relative max-h-[420px] overflow-auto">
                <table className="min-w-[900px] w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Style part</th>
                      <th className="px-2 py-2 text-right">Machines</th>
                      <th className="px-2 py-2 text-right">Prod/hr</th>
                      <th className="px-2 py-2 text-right">Cost/machine</th>
                      <th className="px-2 py-2 text-right">Total line</th>
                      <th className="px-2 py-2 text-right">CM/pc</th>
                      <th className="px-2 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manufacturing.map((m, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={m.style_part}
                              onChange={(e) => onManufacturingChange(idx, { style_part: e.target.value })}
                              className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
                            />
                          ) : (
                            m.style_part || "—"
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={m.machines_required}
                              onChange={(e) => onManufacturingChange(idx, { machines_required: Number(e.target.value || "0") })}
                              className="w-16 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.machines_required
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={m.production_per_hour}
                              onChange={(e) => onManufacturingChange(idx, { production_per_hour: e.target.value || "0" })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.production_per_hour
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={m.cost_per_machine}
                              onChange={(e) => onManufacturingChange(idx, { cost_per_machine: e.target.value || "0" })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            m.cost_per_machine
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{m.total_line_cost}</td>
                        <td className="px-2 py-1 text-right">{m.cm_per_piece}</td>
                        <td className="px-2 py-1 text-right font-medium">{m.total_order_cost}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white">
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={7} className="px-2 py-2 text-right text-sm font-semibold text-gray-700">
                        Labor / CM Total
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-gray-900">
                        {formatMoney(totals.mfgTotal)} {quotation.currency ?? ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Other Commercial Costs (Washing, Overheads, Logistics)"
            actions={isEditing ? (
              <button
                type="button"
                onClick={() =>
                  setOtherCosts((rows) => [
                    ...rows,
                    {
                      serial_no: rows.length + 1,
                      cost_head: "",
                      percentage: "0",
                      total_amount: "0",
                      cost_type: "fixed",
                      value: "0",
                      based_on: "subtotal",
                      calculated_amount: "0",
                      notes: null,
                      currency: quotation.currency ?? "USD",
                      exchange_rate: quotation.exchange_rate ?? "1",
                      base_amount: "0",
                      local_amount: "0",
                    },
                  ])
                }
                className="no-print rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 bg-white"
              >
                + Add Cost Head
              </button>
            ) : null}
          >
            {otherCosts.length === 0 ? (
              <div className="text-xs text-gray-500">No other cost lines.</div>
            ) : (
              <div className="relative max-h-[420px] overflow-auto">
                <table className="min-w-[900px] w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Cost head</th>
                      <th className="px-2 py-2 text-left">Type</th>
                      <th className="px-2 py-2 text-right">Value</th>
                      <th className="px-2 py-2 text-left">Based on</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherCosts.map((c, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={c.cost_head}
                              onChange={(e) => onOtherCostChange(idx, { cost_head: e.target.value })}
                              className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
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
                              className="w-full rounded border border-gray-300 px-1 py-1 text-xs"
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
                              value={c.value}
                              onChange={(e) => onOtherCostChange(idx, { value: e.target.value || "0" })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            c.value
                          )}
                        </td>
                        <td className="px-2 py-1">{c.based_on}</td>
                        <td className="px-2 py-1 text-right font-medium">{c.calculated_amount || c.total_amount}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white">
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={5} className="px-2 py-2 text-right text-sm font-semibold text-gray-700">
                        Other Costs Total
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-gray-900">
                        {formatMoney(totals.otherTotal)} {quotation.currency ?? ""}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Size Ratios"
            actions={isEditing ? (
              <button
                type="button"
                onClick={() =>
                  setSizeRatios((rows) => [
                    ...rows,
                    { serial_no: rows.length + 1, size: "", ratio_percentage: "0", fabric_factor: "1.0", quantity: 0 },
                  ])
                }
                className="no-print rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 bg-white"
              >
                + Add Size
              </button>
            ) : null}
          >
            {sizeRatios.length === 0 ? (
              <div className="text-xs text-gray-500">No size ratios.</div>
            ) : (
              <div className="relative max-h-[360px] overflow-auto">
                <table className="min-w-[740px] w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-2 py-2 text-left">#</th>
                      <th className="px-2 py-2 text-left">Size</th>
                      <th className="px-2 py-2 text-right">Ratio %</th>
                      <th className="px-2 py-2 text-right">Fabric factor</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeRatios.map((s, idx) => (
                      <tr key={idx} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1">{idx + 1}</td>
                        <td className="px-2 py-1">
                          {isEditing ? (
                            <input
                              type="text"
                              value={s.size}
                              onChange={(e) => onSizeRatioChange(idx, { size: e.target.value })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-xs"
                            />
                          ) : (
                            s.size
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={s.ratio_percentage}
                              onChange={(e) => onSizeRatioChange(idx, { ratio_percentage: e.target.value || "0" })}
                              className="w-16 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            s.ratio_percentage
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={s.fabric_factor}
                              onChange={(e) => onSizeRatioChange(idx, { fabric_factor: e.target.value || "1.0" })}
                              className="w-16 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            s.fabric_factor
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={s.quantity}
                              onChange={(e) => onSizeRatioChange(idx, { quantity: Number(e.target.value || "0") })}
                              className="w-20 rounded border border-gray-300 px-1 py-1 text-right text-xs"
                            />
                          ) : (
                            s.quantity
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white">
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={4} className="px-2 py-2 text-right text-sm font-semibold text-gray-700">
                        Total Qty
                      </td>
                      <td className="px-2 py-2 text-right text-sm font-bold text-gray-900">
                        {sizeRatios.reduce((acc, row) => acc + (row.quantity ?? 0), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Final Commercial Breakdown" defaultOpen={!isPrintMode}>
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">FOB Cost</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatMoney(toSafeNumber(quotation.total_cost) || totals.total)} {quotation.currency ?? ""}
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Factory Margin</div>
                <div className="text-xl font-bold text-orange-600">
                  {formatMoney(factoryMarginAmount)} ({factoryMarginPercent.toFixed(1)}%)
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Agency Commission</div>
                <div className="text-xl font-bold text-gray-900">{quotation.commission_value ?? "0"}%</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Final Quoted Price</div>
                <div className="text-xl font-bold text-primary">
                  {quotation.quoted_price ?? quotation.total_amount ?? "—"} {quotation.currency ?? ""}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <div className="text-xs text-gray-500">
            Created at {new Date(quotation.created_at).toLocaleString()} · Updated at{" "}
            {new Date(quotation.updated_at).toLocaleString()}
          </div>

          <section className="print-only print-card rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Legal / Commercial Sign-off</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-700 md:grid-cols-2">
              <div>
                <div><span className="font-semibold">Quotation Code:</span> {quotation.quotation_code}</div>
                <div><span className="font-semibold">Version:</span> {quotation.version_no}</div>
                <div><span className="font-semibold">Customer:</span> {customer?.name ?? `#${quotation.customer_id}`}</div>
                <div><span className="font-semibold">Currency:</span> {quotation.currency ?? "USD"}</div>
              </div>
              <div>
                <div><span className="font-semibold">FOB Cost:</span> {quotation.total_cost ?? formatMoney(totals.total)}</div>
                <div><span className="font-semibold">Final Quoted Price:</span> {quotation.quoted_price ?? quotation.total_amount ?? "—"}</div>
                <div><span className="font-semibold">Profit %:</span> {quotation.profit_percentage ?? "—"}</div>
                <div><span className="font-semibold">Commission:</span> {quotation.commission_mode ?? "-"} / {quotation.commission_type ?? "-"} / {quotation.commission_value ?? "-"}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <div className="h-10 border-b border-gray-500" />
                <div className="mt-1 text-[11px] text-gray-600">Prepared By</div>
              </div>
              <div>
                <div className="h-10 border-b border-gray-500" />
                <div className="mt-1 text-[11px] text-gray-600">Reviewed By</div>
              </div>
              <div>
                <div className="h-10 border-b border-gray-500" />
                <div className="mt-1 text-[11px] text-gray-600">Approved By</div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:col-span-4 2xl:col-span-3 self-start">
          <CostSummaryCard
            currency={quotation.currency ?? "USD"}
            materialCost={quotation.material_cost}
            trimsCost={trimsCost}
            laborCost={quotation.manufacturing_cost}
            washFinishCost={washFinishCost}
            overheadCost={overheadCost}
            totalFobCost={quotation.total_cost}
            factoryMarginAmount={factoryMarginAmount}
            factoryMarginPercent={factoryMarginPercent}
          />
          <MarginPricingCard
            profitPercentage={quotation.profit_percentage}
            commissionValue={quotation.commission_value}
            netFobPrice={quotation.quoted_price ?? quotation.total_amount}
            uom="Per PC"
            currency={quotation.currency ?? "USD"}
          />
          <CostBreakdownCard
            currency={quotation.currency ?? "USD"}
            total={totals.total}
            rows={[
              { label: "Materials", value: quotation.material_cost ?? totals.matTotal },
              { label: "Manufacturing", value: quotation.manufacturing_cost ?? totals.mfgTotal },
              { label: "Other Costs", value: quotation.other_cost ?? totals.otherTotal },
              { label: "Commission", value: quotation.commission_value },
            ]}
          />
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print-card">
            <h3 className="text-sm font-semibold text-gray-900">
              Scenario Compare (v{previousVersionQuote?.version_no ?? "-"} vs v{quotation.version_no})
            </h3>
            {previousVersionQuote ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">FOB Change</span>
                  <span className="font-semibold text-gray-900">
                    {(toSafeNumber(quotation.total_cost) || totals.total) - toSafeNumber(previousVersionQuote.total_cost) >= 0 ? "+" : ""}
                    {formatMoney((toSafeNumber(quotation.total_cost) || totals.total) - toSafeNumber(previousVersionQuote.total_cost))} {quotation.currency ?? ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Quoted Price Change</span>
                  <span className="font-semibold text-gray-900">
                    {(toSafeNumber(quotation.quoted_price ?? quotation.total_amount) - toSafeNumber(previousVersionQuote.quoted_price ?? previousVersionQuote.total_amount)) >= 0 ? "+" : ""}
                    {formatMoney(toSafeNumber(quotation.quoted_price ?? quotation.total_amount) - toSafeNumber(previousVersionQuote.quoted_price ?? previousVersionQuote.total_amount))} {quotation.currency ?? ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Profit % Change</span>
                  <span className="font-semibold text-gray-900">
                    {(toSafeNumber(quotation.profit_percentage) - toSafeNumber(previousVersionQuote.profit_percentage)) >= 0 ? "+" : ""}
                    {(toSafeNumber(quotation.profit_percentage) - toSafeNumber(previousVersionQuote.profit_percentage)).toFixed(2)}%
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                No previous version found yet. Create a duplicate version to compare scenarios.
              </p>
            )}
          </section>
          {quotation.style_image_url && (
            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm print-card">
              <h3 className="text-sm font-semibold text-gray-900">Style Preview</h3>
              <img
                src={quotation.style_image_url}
                alt={quotation.style_name ?? quotation.style_ref ?? "Style"}
                className="mt-2 h-36 w-full rounded object-cover border border-gray-200"
              />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
