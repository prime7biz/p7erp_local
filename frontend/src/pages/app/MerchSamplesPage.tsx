import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type MerchSampleCreate,
  type MerchSampleOut,
  type OrderResponse,
  type StyleResponse,
  type InquiryResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

const SAMPLE_TYPES = [
  "proto",
  "fit",
  "size_set",
  "pp",
  "production",
  "sms",
  "shipping",
  "styling",
  "top",
  "wash",
  "development",
  "fit_styling",
  "task",
] as const;

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "requested", label: "Requested" },
  { key: "in_progress", label: "In progress" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

export function MerchSamplesPage() {
  const [rows, setRows] = useState<MerchSampleOut[]>([]);
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [inquiries, setInquiries] = useState<InquiryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sampleTypeFilter, setSampleTypeFilter] = useState("");
  const [styleFilter, setStyleFilter] = useState<number | "">("");
  const [targetFrom, setTargetFrom] = useState("");
  const [targetTo, setTargetTo] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<MerchSampleCreate>({
    style_id: 0,
    sample_type: "proto",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await api.listMerchSamples({
        status: statusFilter || undefined,
        sample_type: sampleTypeFilter || undefined,
        style_id: styleFilter === "" ? undefined : styleFilter,
        target_from: targetFrom || undefined,
        target_to: targetTo || undefined,
        limit: 200,
        offset: 0,
      });
      setRows(list);
    } catch (e) {
      logApiError("MerchSamplesPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sampleTypeFilter, styleFilter, targetFrom, targetTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api
      .listStyles({ limit: 500, offset: 0 })
      .then((st) => {
        setStyles(st);
        setForm((f) => (f.style_id === 0 && st[0] ? { ...f, style_id: st[0].id } : f));
      })
      .catch((e) => logApiError("MerchSamplesPage.listStyles", e));
    void api
      .listOrders({ limit: 300, offset: 0 })
      .then((o) => setOrders(o))
      .catch((e) => logApiError("MerchSamplesPage.listOrders", e));
    void api
      .listInquiries({ limit: 300, offset: 0 })
      .then((i) => setInquiries(i))
      .catch((e) => logApiError("MerchSamplesPage.listInquiries", e));
  }, []);

  const createSample = async () => {
    if (!form.style_id) {
      setError("Select a style");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createMerchSample({
        style_id: form.style_id,
        sample_type: form.sample_type,
        sample_subtype: form.sample_subtype?.trim() || undefined,
        inquiry_id: form.inquiry_id ?? undefined,
        order_id: form.order_id ?? undefined,
        target_date: form.target_date || undefined,
        assigned_to_id: form.assigned_to_id ?? undefined,
        remarks: form.remarks?.trim() || undefined,
      });
      setShowNew(false);
      setForm({ style_id: form.style_id, sample_type: "proto", remarks: "" });
      await load();
    } catch (e) {
      logApiError("MerchSamplesPage.create", e);
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const kpis = useMemo(() => {
    const by = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      total: rows.length,
      requested: by("requested"),
      inProgress: by("in_progress"),
      submitted: by("submitted"),
    };
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <AppPageHeader
        title="Sample development"
        description="Factory sample requests linked to styles: types (proto, fit, SMS, shipping, PP, size set, etc.), costing lines, tasks, and AI-assisted planning."
        actions={
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="rounded-lg bg-status-info px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            New sample request
          </button>
        }
      />

      {error ? (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-subtle/80 px-3 py-2 text-xs">
        <span className="rounded-lg bg-surface-raised px-2.5 py-1.5 shadow-sm">
          <span className="font-medium text-text-muted">Total (page)</span>{" "}
          <span className="font-semibold text-text-primary">{kpis.total}</span>
        </span>
        <span className="rounded-lg bg-surface-raised px-2.5 py-1.5 shadow-sm">
          <span className="font-medium text-text-muted">Requested</span>{" "}
          <span className="font-semibold text-text-primary">{kpis.requested}</span>
        </span>
        <span className="rounded-lg bg-surface-raised px-2.5 py-1.5 shadow-sm">
          <span className="font-medium text-text-muted">In progress</span>{" "}
          <span className="font-semibold text-text-primary">{kpis.inProgress}</span>
        </span>
        <span className="rounded-lg bg-surface-raised px-2.5 py-1.5 shadow-sm">
          <span className="font-medium text-text-muted">Submitted</span>{" "}
          <span className="font-semibold text-text-primary">{kpis.submitted}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key || "all"}
            type="button"
            onClick={() => setStatusFilter(t.key)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              statusFilter === t.key
                ? "bg-status-info text-white"
                : "border border-border bg-surface-raised text-text-secondary hover:bg-surface-subtle"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-text-muted">
          Type
          <select
            className="ml-2 mt-0.5 block rounded border border-border px-2 py-1 text-sm"
            value={sampleTypeFilter}
            onChange={(e) => setSampleTypeFilter(e.target.value)}
          >
            <option value="">All types</option>
            {SAMPLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-muted">
          Style
          <select
            className="ml-2 mt-0.5 block min-w-[180px] rounded border border-border px-2 py-1 text-sm"
            value={styleFilter === "" ? "" : String(styleFilter)}
            onChange={(e) => setStyleFilter(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All styles</option>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.style_code} — {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-muted">
          Target from
          <input
            type="date"
            className="ml-2 mt-0.5 block rounded border border-border px-2 py-1 text-sm"
            value={targetFrom}
            onChange={(e) => setTargetFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-text-muted">
          Target to
          <input
            type="date"
            className="ml-2 mt-0.5 block rounded border border-border px-2 py-1 text-sm"
            value={targetTo}
            onChange={(e) => setTargetTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}

      {!loading && rows.length === 0 ? (
        <p className="text-sm text-text-muted">No sample requests match your filters.</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-subtle text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Subtype</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Style</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-3 py-2 font-mono text-xs">{r.sample_code}</td>
                  <td className="px-3 py-2">{r.sample_type}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.sample_subtype || "—"}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    <Link
                      className="text-status-info-foreground hover:underline"
                      to={`/app/merchandising/styles/${r.style_id}`}
                    >
                      {r.style_code ? `${r.style_code}` : `#${r.style_id}`}
                    </Link>
                    {r.style_name ? <span className="text-text-muted"> — {r.style_name}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.target_date || "—"}</td>
                  <td className="relative px-3 py-2 text-right">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => setOpenActionsId((id) => (id === r.id ? null : r.id))}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        <Link
                          to={`/app/merchandising/samples/${r.id}`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setOpenActionsId(null)}
                        >
                          View
                        </Link>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showNew ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-text-primary">New sample request</h3>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-text-muted">Style</span>
                <select
                  className="mt-1 w-full rounded border border-border px-2 py-1.5"
                  value={form.style_id}
                  onChange={(e) => setForm((f) => ({ ...f, style_id: Number(e.target.value) }))}
                >
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.style_code} — {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Sample type</span>
                <select
                  className="mt-1 w-full rounded border border-border px-2 py-1.5"
                  value={form.sample_type}
                  onChange={(e) => setForm((f) => ({ ...f, sample_type: e.target.value }))}
                >
                  {SAMPLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Subtype (optional)</span>
                <input
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                  placeholder="e.g. buyer ref, colorway"
                  value={form.sample_subtype ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, sample_subtype: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Inquiry (optional)</span>
                <select
                  className="mt-1 w-full rounded border border-border px-2 py-1.5"
                  value={form.inquiry_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      inquiry_id: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {inquiries.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.inquiry_code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Order (optional)</span>
                <select
                  className="mt-1 w-full rounded border border-border px-2 py-1.5"
                  value={form.order_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      order_id: e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Target date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                  value={form.target_date ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value || undefined }))}
                />
              </label>
              <label className="block">
                <span className="text-xs text-text-muted">Remarks</span>
                <textarea
                  className="mt-1 w-full rounded border border-border px-2 py-1.5 text-sm"
                  rows={3}
                  value={form.remarks ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
                onClick={() => setShowNew(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-lg bg-status-info px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => void createSample()}
              >
                {saving ? "Saving…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
