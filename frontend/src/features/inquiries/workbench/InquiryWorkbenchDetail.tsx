import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  type InquiryRelatedResponse,
  type InquiryResponse,
  type InquiryTechnicalFile,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LinkedRecordsSection, type LinkedRecordRow } from "@/components/app/LinkedRecordsSection";
import { WorkflowSummaryStrip, type WorkflowStripItem } from "@/components/app/WorkflowSummaryStrip";
import { InquiryAiAuditHistory } from "@/components/inquiries/InquiryAiAuditHistory";
import { InquiryAiPanel } from "@/components/inquiries/InquiryAiPanel";
import { SecureImage } from "@/components/SecureImage";
import { inquiryTypeLabel } from "@/features/inquiries/workbench/inquiryDepartments";
import {
  estimatedSah,
  estimatedValue,
  missingRecommendedFields,
  readinessScore,
} from "@/features/inquiries/workbench/inquiryReadiness";
import {
  canCancelInquiry,
  canConvertInquiryToQuotation,
  canEditInquiry,
  canMarkInquiryLost,
  canSubmitInquiry,
  humanizeStatus,
  isInquiryTerminal,
} from "@/features/merch/workflow";
import { useInquiryAi } from "@/hooks/useInquiryAi";
import { saveBlob } from "@/lib/fileSave";
import { logApiError } from "@/utils/logApiError";
import { toast } from "sonner";

export function InquiryWorkbenchDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<InquiryResponse | null>(null);
  const [related, setRelated] = useState<InquiryRelatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inquiryAi = useInquiryAi();

  const aiFormSnapshot = useMemo(() => {
    if (!item) return {};
    return {
      customer_id: String(item.customer_id),
      style_id: item.style_id != null ? String(item.style_id) : "",
      customer_intermediary_id:
        item.customer_intermediary_id != null ? String(item.customer_intermediary_id) : "",
      style_ref: item.style_ref ?? "",
      season: item.season ?? "",
      department: item.department ?? "",
      quantity: item.quantity != null ? String(item.quantity) : "",
      target_price: item.target_price ?? "",
      target_price_currency: item.target_price_currency ?? "",
      currency: item.currency ?? "",
      exchange_rate: item.exchange_rate ?? "",
      expected_delivery_date: item.expected_delivery_date ?? "",
      shipping_term: item.shipping_term ?? "",
      commission_mode: item.commission_mode ?? "",
      commission_type: item.commission_type ?? "",
      commission_value: item.commission_value != null ? String(item.commission_value) : "",
      notes: item.notes ?? "",
      status: item.status,
      brand: item.brand ?? "",
      inquiry_type: item.inquiry_type ?? "",
      items_json: JSON.stringify(item.items ?? []),
    };
  }, [item]);

  const reload = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [inquiry, rel] = await Promise.all([
        api.getInquiry(Number(id)),
        api.getInquiryRelated(Number(id)),
      ]);
      setItem(inquiry);
      setRelated(rel);
    } catch (e) {
      logApiError("InquiryWorkbenchDetail.load", e);
      setError(e instanceof Error ? e.message : "Failed to load inquiry");
      setItem(null);
      setRelated(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return <div className="p-6 text-text-muted">Loading inquiry…</div>;
  }

  if (!item) {
    return (
      <div className="space-y-3 p-6">
        <div className="text-sm text-status-danger">{error || "Inquiry not found."}</div>
        <button
          type="button"
          onClick={() => navigate("/app/inquiries")}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Back to inquiries
        </button>
      </div>
    );
  }

  const missing = missingRecommendedFields(item);
  const score = readinessScore(item);
  const est = estimatedValue(item.quantity, item.target_price);
  const sah =
    related?.style?.estimated_sah ??
    estimatedSah(item.quantity, related?.style?.standard_smv ?? null);

  const workflowItems: WorkflowStripItem[] = [
    {
      label: "Customer",
      value: related?.customer?.name ?? `#${item.customer_id}`,
      to: `/app/customers/${item.customer_id}`,
    },
    {
      label: "Inquiry",
      value: item.inquiry_code,
      hint: humanizeStatus(item.status),
    },
    {
      label: "Quotation",
      value:
        related?.quotations?.[0]?.quotation_code ??
        (item.converted_quotation_id ? `#${item.converted_quotation_id}` : "—"),
      to: related?.quotations?.[0]
        ? `/app/quotations/${related.quotations[0].id}`
        : item.converted_quotation_id
          ? `/app/quotations/${item.converted_quotation_id}`
          : undefined,
    },
    {
      label: "Order",
      value: related?.orders?.[0]?.order_code ?? "—",
      to: related?.orders?.[0] ? `/app/orders/${related.orders[0].id}` : undefined,
    },
  ];

  const styleRows: LinkedRecordRow[] = related?.style
    ? [
        {
          id: related.style.id,
          label: `${related.style.style_code} — ${related.style.name}`,
          to: `/app/merchandising/styles/${related.style.id}`,
        },
      ]
    : item.style_id
      ? [
          {
            id: item.style_id,
            label: item.style_name ?? item.style_ref ?? `Style #${item.style_id}`,
            to: `/app/merchandising/styles/${item.style_id}`,
          },
        ]
      : [];

  const quotationRows: LinkedRecordRow[] = (related?.quotations ?? []).map((q) => ({
    id: q.id,
    label: q.quotation_code,
    sub: humanizeStatus(q.status),
    to: `/app/quotations/${q.id}`,
  }));

  const orderRows: LinkedRecordRow[] = (related?.orders ?? []).map((o) => ({
    id: o.id,
    label: o.order_code,
    sub: humanizeStatus(o.status),
    to: `/app/orders/${o.id}`,
  }));

  const sampleRows: LinkedRecordRow[] = (related?.samples ?? []).map((s) => ({
    id: s.id,
    label: s.sample_code,
    sub: `${s.sample_type} · ${s.status}`,
    to: `/app/merchandising/samples/${s.id}`,
  }));

  const createSampleHref = (() => {
    const params = new URLSearchParams();
    params.set("inquiry_id", String(item.id));
    if (item.style_id) params.set("style_id", String(item.style_id));
    return `/app/merchandising/samples?${params.toString()}`;
  })();

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadTechFile = async (file: InquiryTechnicalFile) => {
    if (!file.url) {
      setError("File URL is missing.");
      return;
    }
    try {
      const blob = await api.fetchSecureFileBlob(file.url);
      await saveBlob(blob, file.filename || file.name || "technical-file");
    } catch (e) {
      logApiError("InquiryWorkbenchDetail.downloadTech", e);
      setError(e instanceof Error ? e.message : "Download failed");
    }
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}

      <AppPageHeader
        title={`Inquiry ${item.inquiry_code}`}
        description={`${humanizeStatus(item.status)} · ${
          related?.customer?.name ?? item.customer_name ?? `Customer #${item.customer_id}`
        } · Created ${new Date(item.created_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}`}
        backTo={{ label: "Inquiries", to: "/app/inquiries" }}
        belowTitle={<WorkflowSummaryStrip items={workflowItems} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEditInquiry(item.status) ? (
              <button
                type="button"
                onClick={() => navigate(`/app/inquiries/${item.id}/edit`)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                window.open(`/app/inquiries/${item.id}/print`, "_blank", "noopener,noreferrer")
              }
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
            >
              Print
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  const cloned = await api.cloneInquiry(item.id);
                  toast.success(`Cloned as ${cloned.inquiry_code}`);
                  navigate(`/app/inquiries/${cloned.id}/edit`);
                })
              }
              className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary disabled:opacity-60"
            >
              Clone
            </button>
            {canSubmitInquiry(item.status) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const updated = await api.updateInquiryStatus(item.id, "SUBMITTED");
                    setItem(updated);
                    toast.success("Inquiry submitted");
                    await reload();
                  })
                }
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
              >
                Submit
              </button>
            ) : null}
            {canConvertInquiryToQuotation(item.status) && !item.is_converted_to_quotation ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const quotation = await api.convertInquiryToQuotation(item.id);
                    toast.success(`Quotation ${quotation.quotation_code} created`);
                    navigate(`/app/quotations/${quotation.id}`);
                  })
                }
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-60"
              >
                Convert
              </button>
            ) : null}
            {item.converted_quotation_id ? (
              <button
                type="button"
                onClick={() => navigate(`/app/quotations/${item.converted_quotation_id}`)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
              >
                Open Quotation
              </button>
            ) : null}
            {canMarkInquiryLost(item.status) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const notes = window.prompt("Reason for marking Lost (optional):") ?? undefined;
                    const updated = await api.updateInquiryStatus(item.id, "LOST", notes || undefined);
                    setItem(updated);
                    toast.success("Marked Lost");
                    await reload();
                  })
                }
                className="rounded-lg border border-status-warning/40 px-3 py-1.5 text-sm text-status-warning-foreground disabled:opacity-60"
              >
                Mark Lost
              </button>
            ) : null}
            {canCancelInquiry(item.status) ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const notes = window.prompt("Cancel reason (optional):") ?? undefined;
                    const updated = await api.updateInquiryStatus(
                      item.id,
                      "CANCELLED",
                      notes || undefined,
                    );
                    setItem(updated);
                    toast.success("Inquiry cancelled");
                    await reload();
                  })
                }
                className="rounded-lg border border-status-danger/40 px-3 py-1.5 text-sm text-status-danger disabled:opacity-60"
              >
                Cancel
              </button>
            ) : null}
          </div>
        }
      />

      {missing.length > 0 && !isInquiryTerminal(item.status) ? (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning-subtle px-4 py-3 text-sm text-status-warning-foreground">
          Missing recommended fields for clean quotation prefill: {missing.join(", ")}. Readiness{" "}
          {score}%.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted">Readiness</div>
          <div className="text-2xl font-bold text-text-primary">{score}%</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted">Estimated value</div>
          <div className="text-lg font-semibold text-text-primary">
            {est} {item.target_price_currency || item.currency || "USD"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs text-text-muted">Estimated SAH</div>
          <div className="text-lg font-semibold text-text-primary">{sah ?? "—"}</div>
        </div>
      </div>

      <LinkedRecordsSection
        columns={[
          { title: "Style", rows: styleRows },
          { title: "Quotations", rows: quotationRows },
          { title: "Orders", rows: orderRows },
          { title: "Samples", rows: sampleRows },
        ]}
      />

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Samples</h2>
          <Link
            to={createSampleHref}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Create Sample
          </Link>
        </div>
        {sampleRows.length === 0 ? (
          <p className="text-sm text-text-muted">No samples linked yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {sampleRows.map((s) => (
              <li key={s.id}>
                <Link to={s.to} className="text-brand-primary hover:underline">
                  {s.label}
                  {s.sub ? <span className="text-text-muted"> — {s.sub}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {related?.can_view_tentative_bookings ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">Tentative bookings</h2>
            <Link
              to={`/app/control-tower?tab=tentative-demand&inquiry_id=${item.id}`}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
            >
              Book Tentative Capacity
            </Link>
          </div>
          {(related.tentative_bookings ?? []).length === 0 ? (
            <p className="text-sm text-text-muted">No tentative line bookings.</p>
          ) : (
            <ul className="space-y-1 text-sm text-text-secondary">
              {related.tentative_bookings.map((b) => (
                <li key={b.id}>
                  Line #{b.line_id} · {b.status} · qty {b.planned_qty} · {b.start_date}
                  {b.planned_end_date ? ` → ${b.planned_end_date}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Summary</h2>
          <dl className="space-y-1 text-sm text-text-secondary">
            <div>
              <span className="font-medium text-text-primary">Type:</span>{" "}
              {inquiryTypeLabel(item.inquiry_type)}
            </div>
            <div>
              <span className="font-medium text-text-primary">Contact:</span>{" "}
              {item.contact_person || "—"}
            </div>
            <div>
              <span className="font-medium text-text-primary">Intermediary:</span>{" "}
              {item.intermediary_name || related?.intermediary?.name || "—"}
            </div>
            <div>
              <span className="font-medium text-text-primary">Qty / Target:</span>{" "}
              {item.quantity != null ? item.quantity.toLocaleString() : "—"} /{" "}
              {item.target_price || "—"} {item.target_price_currency || ""}
            </div>
            <div>
              <span className="font-medium text-text-primary">Delivery:</span>{" "}
              {item.expected_delivery_date || "—"}
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
          <h2 className="text-sm font-semibold text-text-primary">Style</h2>
          <div className="flex items-center gap-3">
            {item.style_image_url ? (
              <SecureImage
                url={item.style_image_url}
                alt={item.style_name ?? "Style"}
                className="h-20 w-20 rounded object-cover border border-border"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded border border-border bg-surface-subtle text-xs text-text-muted">
                No image
              </div>
            )}
            <div className="text-sm text-text-secondary">
              <div>{item.style_name ?? related?.style?.name ?? "—"}</div>
              <div className="text-xs text-text-muted">
                {item.style_ref ?? related?.style?.style_code ?? ""}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Product specs</h2>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs text-text-muted">Department</dt>
            <dd>{item.department || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Brand</dt>
            <dd>{item.brand || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Season</dt>
            <dd>
              {item.season || "—"}
              {item.season_year ? ` (${item.season_year})` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Material</dt>
            <dd>{item.material_composition || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Size range</dt>
            <dd>{item.size_range || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Colors</dt>
            <dd>{item.color_options?.length ? item.color_options.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Country of origin</dt>
            <dd>{item.country_of_origin || "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs text-text-muted">Special requirements</dt>
            <dd>{item.special_requirements || "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Technical files</h2>
        {(item.technical_files ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">No technical files uploaded.</p>
        ) : (
          <ul className="space-y-1">
            {(item.technical_files ?? []).map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>{f.name || f.filename}</span>
                <button
                  type="button"
                  onClick={() => void downloadTechFile(f)}
                  className="text-xs text-brand-primary hover:underline"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Garment items</h2>
        {item.items?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {item.items.map((line, index) => (
                  <tr key={line.id} className="border-t border-border-subtle">
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2">{line.item_name ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary">{line.description ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {line.quantity != null ? line.quantity.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted">No garment items.</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Notes</h2>
        <p className="text-sm text-text-secondary">{item.notes || "No notes added."}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Timeline</h2>
        {(related?.timeline ?? []).length === 0 ? (
          <p className="text-sm text-text-muted">No timeline events yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(related?.timeline ?? []).map((ev) => (
              <li key={ev.id} className="border-b border-border-subtle pb-2 last:border-0">
                <div className="font-medium text-text-primary">
                  {ev.event_type}
                  {ev.from_status || ev.to_status
                    ? ` · ${ev.from_status ?? "—"} → ${ev.to_status ?? "—"}`
                    : ""}
                </div>
                {ev.notes ? <div className="text-text-secondary">{ev.notes}</div> : null}
                <div className="text-xs text-text-muted">
                  {new Date(ev.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Inquiry AI</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <InquiryAiPanel
            ai={inquiryAi}
            mode="edit"
            inquiryId={item.id}
            formSnapshot={aiFormSnapshot}
          />
          <InquiryAiAuditHistory inquiryId={item.id} />
        </div>
      </div>
    </div>
  );
}
