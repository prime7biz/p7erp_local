import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type MerchPipelineFullResponse,
  type PipelineItemOut,
  type PipelineStageOut,
} from "@/api/client";
import { LayoutGrid, List, RefreshCw, ChevronDown, BarChart3 } from "lucide-react";
import { logApiError } from "@/utils/logApiError";

type ViewMode = "kanban" | "list";

/** Format amount to 2 decimal places (avoids float noise like 13.799999999999999) */
function formatAmount(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: "", label: "All (Inquiries, Quotations, Orders)" },
  { value: "inquiry", label: "Inquiries only" },
  { value: "quotation", label: "Quotations only" },
  { value: "order", label: "Orders only" },
];

export function MerchPipelinePage() {
  const [data, setData] = useState<MerchPipelineFullResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [documentType, setDocumentType] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [customersLoadError, setCustomersLoadError] = useState("");
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getMerchPipelineFull({
        document_type: documentType || undefined,
        customer_id: customerId ? Number(customerId) : undefined,
        search: search || undefined,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [documentType, customerId, search]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  useEffect(() => {
    api
      .listCustomers()
      .then((list) => {
        setCustomers(list);
        setCustomersLoadError("");
      })
      .catch((e) => {
        logApiError("MerchPipelinePage.listCustomers", e);
        setCustomers([]);
        setCustomersLoadError("Could not load customer list for this filter.");
      });
  }, []);

  const handleMoveTo = async (item: PipelineItemOut, newStatus: string) => {
    setMoveMenuId(null);
    setMoving(true);
    setError("");
    try {
      if (item.document_type === "inquiry") {
        await api.updateInquiryStatus(item.id, newStatus);
      } else if (item.document_type === "quotation") {
        await api.updateQuotation(item.id, { status: newStatus });
      } else {
        await api.updateOrder(item.id, { status: newStatus });
      }
      await loadPipeline();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setMoving(false);
    }
  };

  const stagesByKey = useMemo(() => {
    if (!data) return new Map<string, PipelineStageOut>();
    const m = new Map<string, PipelineStageOut>();
    data.stages.forEach((s) => m.set(s.stage_key, s));
    return m;
  }, [data]);

  const itemsByStage = useMemo(() => {
    if (!data) return new Map<string, PipelineItemOut[]>();
    const m = new Map<string, PipelineItemOut[]>();
    data.stages.forEach((s) => m.set(s.stage_key, []));
    data.items.forEach((i) => {
      const list = m.get(i.stage_key) ?? [];
      list.push(i);
      m.set(i.stage_key, list);
    });
    return m;
  }, [data]);

  const visibleStages = useMemo(() => {
    if (!data) return [];
    if (documentType) {
      return data.stages.filter((s) => s.document_type === documentType);
    }
    return data.stages;
  }, [data, documentType]);

  const stageColor = (stage: PipelineStageOut) => {
    if (stage.document_type === "inquiry") return "bg-status-neutral-subtle border-border-strong";
    if (stage.document_type === "quotation") return "bg-status-warning-subtle border-status-warning/30";
    return "bg-status-success-subtle border-status-success/30";
  };

  const docTypeBadge = (doc: string) => {
    const c =
      doc === "inquiry"
        ? "bg-status-neutral-subtle text-status-neutral-foreground"
        : doc === "quotation"
          ? "bg-status-warning-subtle text-status-warning-foreground"
          : "bg-status-success-subtle text-status-success-foreground";
    return (
      <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${c}`}>
        {doc}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Order Pipeline</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Full lifecycle from inquiry → quotation → order. Move deals through stages; win probability per column.
          </p>
          <Link
            to="/app/merchandising/pipeline-analytics"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-sm font-medium text-brand-primary hover:bg-brand-primary/15"
          >
            <BarChart3 className="h-4 w-4" />
            Month-wise &amp; quarterly report
          </Link>
        </div>
      </header>

      {/* Summary + filters */}
      <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {data && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2">
            <span className="text-xs font-semibold uppercase text-text-muted">Summary</span>
            <span className="rounded bg-status-neutral-subtle px-2 py-0.5 text-sm font-medium text-status-neutral-foreground">
              Inquiries: {data.summary.inquiries}
            </span>
            <span className="rounded bg-status-warning-subtle px-2 py-0.5 text-sm font-medium text-status-warning-foreground">
              Quotations: {data.summary.quotations}
            </span>
            <span className="rounded bg-status-success-subtle px-2 py-0.5 text-sm font-medium text-status-success-foreground">
              Orders: {data.summary.orders}
            </span>
          </div>
        )}
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
        >
          {DOCUMENT_TYPE_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm"
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search code or style…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 rounded-lg border border-border-strong px-3 py-1.5 text-sm"
        />
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-subtle p-1">
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`rounded-md p-1.5 ${viewMode === "kanban" ? "bg-surface-raised shadow text-brand-primary" : "text-text-muted hover:text-text-secondary"}`}
            title="Kanban"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-md p-1.5 ${viewMode === "list" ? "bg-surface-raised shadow text-brand-primary" : "text-text-muted hover:text-text-secondary"}`}
            title="List"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => loadPipeline()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {customersLoadError && (
        <p className="text-xs text-status-warning-foreground">{customersLoadError}</p>
      )}
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="py-12 text-center text-text-muted">Loading pipeline…</div>
      ) : !data ? null : viewMode === "kanban" ? (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {visibleStages.map((stage) => {
              const items = itemsByStage.get(stage.stage_key) ?? [];
              return (
                <div
                  key={stage.stage_key}
                  className={`w-72 shrink-0 rounded-xl border-2 ${stageColor(stage)} p-3`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-brand-primary">{stage.label}</h3>
                    <span className="rounded-full bg-surface-raised/80 px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {stage.win_probability}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border-strong py-6 text-center text-xs text-text-muted">
                        No items
                      </div>
                    ) : (
                      items.map((item) => (
                        <PipelineCard
                          key={`${item.document_type}-${item.id}`}
                          item={item}
                          docTypeBadge={docTypeBadge}
                          moveMenuId={moveMenuId}
                          setMoveMenuId={setMoveMenuId}
                          onMoveTo={handleMoveTo}
                          moving={moving}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-raised overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-surface-subtle text-left text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Style / Ref</th>
                <th className="px-4 py-2.5 font-medium">Qty</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-text-muted">
                    No pipeline items match your filters.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => {
                  const stage = stagesByKey.get(item.stage_key);
                  return (
                    <tr
                      key={`${item.document_type}-${item.id}`}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-subtle/50"
                    >
                      <td className="px-4 py-2.5">{docTypeBadge(item.document_type)}</td>
                      <td className="px-4 py-2.5 font-medium">
                        <Link to={item.detail_path} className="text-brand-primary hover:underline">
                          {item.code}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{stage?.label ?? item.stage_key}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{item.customer_name}</td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {item.style_name || item.style_ref || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">
                        {item.quantity != null ? item.quantity.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatAmount(item.total_amount)}</td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          to={item.detail_path}
                          className="text-brand-primary hover:underline mr-2"
                        >
                          Open
                        </Link>
                        {stage && item.next_status_options.length > 0 && (
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={() =>
                                setMoveMenuId(
                                  moveMenuId === `${item.document_type}-${item.id}` ? null : `${item.document_type}-${item.id}`
                                )
                              }
                              className="inline-flex items-center gap-0.5 rounded border border-border-strong px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Move <ChevronDown className="h-3 w-3" />
                            </button>
                            {moveMenuId === `${item.document_type}-${item.id}` && (
                              <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised py-1 shadow-lg">
                                {item.next_status_options.map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleMoveTo(item, opt)}
                                    className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                  >
                                    → {opt.replace(/_/g, " ")}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {moving && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-2 text-sm text-status-warning-foreground">
          Updating status…
        </div>
      )}
    </div>
  );
}

function PipelineCard({
  item,
  docTypeBadge,
  moveMenuId,
  setMoveMenuId,
  onMoveTo,
  moving,
}: {
  item: PipelineItemOut;
  docTypeBadge: (doc: string) => React.ReactNode;
  moveMenuId: string | null;
  setMoveMenuId: (id: string | null) => void;
  onMoveTo: (item: PipelineItemOut, status: string) => void;
  moving: boolean;
}) {
  const menuId = `${item.document_type}-${item.id}`;
  const isOpen = moveMenuId === menuId;
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {docTypeBadge(item.document_type)}
          <Link
            to={item.detail_path}
            className="mt-1 block font-medium text-brand-primary hover:text-brand-primary hover:underline"
          >
            {item.code}
          </Link>
          <p className="mt-0.5 truncate text-xs text-text-secondary" title={item.customer_name}>
            {item.customer_name}
          </p>
          {(item.style_ref || item.style_name) && (
            <p className="truncate text-xs text-text-muted" title={item.style_ref || item.style_name || ""}>
              {item.style_name || item.style_ref}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-text-muted">
            {item.quantity != null && <span>Qty: {item.quantity.toLocaleString()}</span>}
            {(item.total_amount != null && item.total_amount !== "") && (
              <span>· {formatAmount(item.total_amount)}</span>
            )}
          </div>
        </div>
        {item.next_status_options.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoveMenuId(isOpen ? null : menuId)}
              disabled={moving}
              className="rounded border border-border-strong p-1 text-text-muted hover:bg-surface-subtle disabled:opacity-50"
              title="Move to next stage"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {isOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised py-1 shadow-lg">
                {item.next_status_options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onMoveTo(item, opt)}
                    className="block w-full px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    → {opt.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
