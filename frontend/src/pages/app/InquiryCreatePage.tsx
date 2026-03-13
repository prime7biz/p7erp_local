import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  type CustomerIntermediaryLinkResponse,
  type CustomerResponse,
  type InquiryCreate,
  type InquiryItemCreate,
  type StyleResponse,
} from "@/api/client";
import {
  COMMISSION_MODE_OPTIONS,
  COMMISSION_TYPE_OPTIONS,
  SHIPPING_TERM_OPTIONS,
  withLegacyOption,
} from "@/lib/commercialTerms";

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
  shipping_term: "",
  commission_mode: "",
  commission_type: "",
  commission_value: "",
  notes: "",
  items: [emptyItem()],
});

export function InquiryCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<InquiryCreate>(emptyForm());
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [allLinks, setAllLinks] = useState<CustomerIntermediaryLinkResponse[]>([]);
  const [tenantDefaultCommissionMode, setTenantDefaultCommissionMode] = useState<string>("");
  const [currentInquiryCode, setCurrentInquiryCode] = useState<string>("");

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

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === form.style_id) ?? null,
    [styles, form.style_id]
  );

  const customerLinks = useMemo(() => {
    if (!form.customer_id) return [];
    return allLinks.filter((l) => l.customer_id === form.customer_id);
  }, [allLinks, form.customer_id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [styleRows, customerRows, linkRows, settings] = await Promise.all([
          api.listStyles({ status: "ACTIVE" }),
          api.listCustomers(),
          api.listCustomerIntermediaryLinks(),
          api.getSettingsConfig(),
        ]);
        setStyles(styleRows);
        setCustomers(customerRows);
        setAllLinks(linkRows);
        setTenantDefaultCommissionMode(settings.default_commission_mode ?? "");
        if (!isEdit && settings.default_commission_mode) {
          setForm((prev) => ({ ...prev, commission_mode: prev.commission_mode || settings.default_commission_mode || "" }));
        }

        if (isEdit && id) {
          const inquiry = await api.getInquiry(Number(id));
          setCurrentInquiryCode(inquiry.inquiry_code);
          setForm({
            customer_id: inquiry.customer_id,
            style_id: inquiry.style_id ?? undefined,
            style_ref: inquiry.style_ref ?? undefined,
            season: inquiry.season ?? "",
            department: inquiry.department ?? "",
            quantity: inquiry.quantity ?? undefined,
            target_price: inquiry.target_price ?? "",
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
        navigate(`/app/inquiries/${created.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save inquiry");
    } finally {
      setSaving(false);
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
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? `Edit Inquiry ${currentInquiryCode || ""}` : "New Inquiry"}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Full-page inquiry entry with style, party, and commercial details.
          </p>
          <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(isEdit && id ? `/app/inquiries/${id}` : "/app/inquiries")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || creatingStyle}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save inquiry"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-500">
          Loading...
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Inquiry Header</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Customer **</label>
                <select
                  value={form.customer_id || ""}
                  onChange={(e) => onCustomerChange(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-xs text-gray-600 mb-1">
                  Style **
                </label>
                <div className="space-y-2">
                  <select
                    value={form.style_id ?? ""}
                    onChange={(e) => onStyleChange(e.target.value ? Number(e.target.value) : undefined)}
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
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {showQuickStyleCreate ? "Close quick add" : "Quick add new style"}
                  </button>
                </div>
              </div>
            </div>

            {showQuickStyleCreate && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                <h3 className="text-xs font-semibold text-blue-900">Quick Add Style</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                  <label className="rounded border border-blue-200 px-2 py-1 text-xs text-blue-800 hover:bg-blue-100 cursor-pointer">
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
                <p className="text-xs text-blue-900/80">
                  Style picture is optional. You can upload now or keep it empty.
                </p>
              </div>
            )}
            {quickStyleNotice && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {quickStyleNotice}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Season</label>
                <input
                  type="text"
                  value={form.season ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, season: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Department</label>
                <input
                  type="text"
                  value={form.department ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Style ref fallback</label>
                <input
                  type="text"
                  value={form.style_ref ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, style_ref: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {selectedStyle && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-3">
                  {selectedStyle.style_image_url ? (
                    <img
                      src={selectedStyle.style_image_url}
                      alt={selectedStyle.name}
                      className="h-16 w-16 rounded object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded bg-gray-200 text-xs text-gray-600 flex items-center justify-center">
                      No image
                    </div>
                  )}
                  <div className="text-sm text-gray-700">
                    <div className="font-semibold text-gray-900">{selectedStyle.name}</div>
                    <div>{selectedStyle.style_code}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 cursor-pointer">
                    {uploadingSelectedStyleImage ? "Uploading..." : "Upload/replace style image (optional)"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      onChange={uploadImageForSelectedStyle}
                      disabled={uploadingSelectedStyleImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-gray-500">Leave empty if you do not want image now.</span>
                </div>
                {styleImageNotice && (
                  <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    {styleImageNotice}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Intermediary and Commercial Terms</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Customer Link</label>
                <select
                  value={form.customer_intermediary_id ?? ""}
                  onChange={(e) => onLinkChange(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-xs text-gray-600 mb-1">Shipping term</label>
                <select
                  value={form.shipping_term ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, shipping_term: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-xs text-gray-600 mb-1">Commission mode</label>
                <select
                  value={form.commission_mode ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, commission_mode: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-xs text-gray-600 mb-1">Commission type</label>
                <select
                  value={form.commission_type ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, commission_type: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="block text-xs text-gray-600 mb-1">Commission value</label>
                <input
                  type="text"
                  value={form.commission_value ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, commission_value: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Expected quantity</label>
                <input
                  type="number"
                  value={form.quantity ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      quantity: e.target.value ? Number(e.target.value) : undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Target price</label>
                <input
                  type="text"
                  value={form.target_price ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, target_price: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Garment Items</h2>
              <button
                type="button"
                onClick={addItem}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700"
              >
                Add item
              </button>
            </div>
            {(form.items ?? []).map((line, index) => (
              <div key={index} className="rounded-lg border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-700">Item #{index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="rounded border border-red-200 px-2 py-1 text-xs text-red-600"
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
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    value={line.description ?? ""}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    placeholder="Description"
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
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
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="block text-xs text-gray-600 mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
