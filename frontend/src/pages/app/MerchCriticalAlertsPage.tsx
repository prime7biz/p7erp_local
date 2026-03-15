import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type MerchAlertItem,
  type MerchAlertsSummaryResponse,
  type MerchAlertCommentItem,
  type MerchAlertHistoryItem,
  type MerchAlertSavedView,
} from "@/api/client";
import { RefreshCw, Play, X, LayoutGrid, List, Bookmark } from "lucide-react";

const SEVERITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700", label: "Critical" },
  high: { bg: "bg-orange-50", text: "text-orange-700", label: "High" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "Medium" },
  low: { bg: "bg-blue-50", text: "text-blue-700", label: "Low" },
  informational: { bg: "bg-gray-50", text: "text-gray-600", label: "Info" },
};

const DEFAULT_SEVERITY_STYLE = { bg: "bg-gray-50", text: "text-gray-600", label: "—" };

function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium ?? DEFAULT_SEVERITY_STYLE;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return (
    <span className="inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 capitalize">
      {label}
    </span>
  );
}

export function MerchCriticalAlertsPage() {
  const [items, setItems] = useState<MerchAlertItem[]>([]);
  const [summary, setSummary] = useState<MerchAlertsSummaryResponse | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [drawerAlertId, setDrawerAlertId] = useState<number | null>(null);
  const [drawerAlert, setDrawerAlert] = useState<MerchAlertItem | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [savedViews, setSavedViews] = useState<MerchAlertSavedView[]>([]);
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [drawerTab, setDrawerTab] = useState<"summary" | "timeline" | "comments" | "escalation">("summary");
  const [drawerComments, setDrawerComments] = useState<MerchAlertCommentItem[]>([]);
  const [drawerHistory, setDrawerHistory] = useState<MerchAlertHistoryItem[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, summaryRes] = await Promise.all([
        api.getMerchAlerts({
          page,
          page_size: pageSize,
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
          sort: "-created_at",
        }),
        api.getMerchAlertsSummary({
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
        }),
      ]);
      setItems(listRes.items);
      setTotal(listRes.total);
      setSummary(summaryRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, severityFilter, statusFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    api.getMerchAlertViews().then(setSavedViews).catch(() => {});
  }, []);

  const applyView = useCallback((view: MerchAlertSavedView) => {
    const f = view.filter_json as { severity?: string; status?: string };
    if (f.severity) setSeverityFilter(f.severity); else setSeverityFilter("");
    if (f.status) setStatusFilter(f.status); else setStatusFilter("");
    setPage(1);
  }, []);

  const saveCurrentView = async () => {
    if (!saveViewName.trim()) return;
    try {
      await api.createMerchAlertView({
        name: saveViewName.trim(),
        filter_json: { severity: severityFilter || undefined, status: statusFilter || undefined },
        is_default: false,
      });
      setSavedViews(await api.getMerchAlertViews());
      setSaveViewModalOpen(false);
      setSaveViewName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save view");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleSelectAll = () => {
    if (selectedIds.length >= items.length) setSelectedIds([]);
    else setSelectedIds(items.map((a) => a.id));
  };
  const bulkResolve = async () => {
    setActionLoading(true);
    try {
      for (const id of selectedIds) await api.updateMerchAlertStatus(id, "resolved");
      setSelectedIds([]);
      await fetchList();
    } finally {
      setActionLoading(false);
    }
  };

  const runScan = async () => {
    setScanning(true);
    setError("");
    try {
      await api.runMerchAlertsScan();
      // Scan runs in background; wait a moment then refresh so new alerts appear
      await new Promise((r) => setTimeout(r, 2000));
      await fetchList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      const isNetworkError = typeof msg === "string" && (msg === "Failed to fetch" || msg.toLowerCase().includes("network"));
      setError(isNetworkError ? "Could not reach the server. Ensure the backend is running (e.g. port 8000) and try again." : msg);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (drawerAlertId == null) {
      setDrawerAlert(null);
      setDrawerTab("summary");
      setDrawerComments([]);
      setDrawerHistory([]);
      return;
    }
    setDrawerLoading(true);
    api.getMerchAlertDetail(drawerAlertId)
      .then((r) => setDrawerAlert(r as MerchAlertItem))
      .catch(() => setDrawerAlert(null))
      .finally(() => setDrawerLoading(false));
  }, [drawerAlertId]);

  useEffect(() => {
    if (drawerAlertId == null || drawerTab !== "comments") return;
    setLoadingComments(true);
    api.getMerchAlertComments(drawerAlertId)
      .then(setDrawerComments)
      .catch(() => setDrawerComments([]))
      .finally(() => setLoadingComments(false));
  }, [drawerAlertId, drawerTab]);

  useEffect(() => {
    if (drawerAlertId == null || drawerTab !== "timeline") return;
    setLoadingHistory(true);
    api.getMerchAlertHistory(drawerAlertId)
      .then(setDrawerHistory)
      .catch(() => setDrawerHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [drawerAlertId, drawerTab]);

  const updateStatus = async (alertId: number, status: string) => {
    setActionLoading(true);
    try {
      await api.updateMerchAlertStatus(alertId, status);
      setDrawerAlert((prev) => (prev ? { ...prev, status } : null));
      await fetchList();
      if (["resolved", "closed"].includes(status)) setDrawerAlertId(null);
    } finally {
      setActionLoading(false);
    }
  };

  const snoozeAlert = async (alertId: number, until: string) => {
    setActionLoading(true);
    try {
      await api.snoozeMerchAlert(alertId, until);
      setDrawerAlertId(null);
      await fetchList();
    } finally {
      setActionLoading(false);
    }
  };

  const hasFilters = severityFilter || statusFilter;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Critical Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Overdue and at-risk merchandising follow-ups. Alerts are updated every 15 minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Total: {summary?.total ?? "—"}</span>
          <button
            type="button"
            onClick={() => fetchList()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={runScan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Play className={`h-4 w-4 ${scanning ? "animate-pulse" : ""}`} />
            Run scan
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* KPI band */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(["critical", "high", "medium", "low", "informational"] as const).map((sev) => {
          const s = SEVERITY_STYLES[sev];
          const count = summary?.by_severity?.[sev] ?? 0;
          return (
            <div
              key={sev}
              className={`rounded-lg border px-4 py-3 shadow-sm ${count > 0 && sev === "critical" ? "border-red-200 bg-red-50/50" : "border-gray-200 bg-white"}`}
            >
              <p className={`text-2xl font-semibold ${s?.text ?? "text-gray-900"}`}>{count}</p>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s?.label ?? sev}</p>
            </div>
          );
        })}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-2xl font-semibold text-gray-900">{summary?.total ?? 0}</p>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">
          Severity
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="ml-2 rounded border border-gray-300 py-1 pl-2 pr-8 text-sm"
          >
            <option value="">All</option>
            {Object.entries(SEVERITY_STYLES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Status
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="ml-2 rounded border border-gray-300 py-1 pl-2 pr-8 text-sm"
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_progress">In progress</option>
            <option value="snoozed">Snoozed</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => { setSeverityFilter(""); setStatusFilter(""); setPage(1); }}
            className="text-sm text-indigo-600 hover:underline"
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-md p-1.5 ${viewMode === "table" ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"}`}
              title="Table view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`rounded-md p-1.5 ${viewMode === "cards" ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"}`}
              title="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <select
              className="rounded-lg border border-gray-300 py-1.5 pl-8 pr-8 text-sm"
              value=""
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : 0;
                if (id && savedViews.find((v) => v.id === id)) applyView(savedViews.find((v) => v.id === id)!);
                e.target.value = "";
              }}
            >
              <option value="">Saved views</option>
              {savedViews.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            <Bookmark className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={() => setSaveViewModalOpen(true)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Save view
          </button>
        </div>
      </div>

      {/* Bulk toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm">
          <span className="font-medium text-indigo-900">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={actionLoading}
              onClick={bulkResolve}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Resolve selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Table / Cards */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="px-4 py-12 text-center text-gray-500 text-sm">Loading alerts…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500">
            <p className="font-medium">No alerts</p>
            <p className="text-sm mt-1">
              {hasFilters ? "No alerts match your filters." : "There are no critical alerts right now. New alerts appear after the next scan."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => { setSeverityFilter(""); setStatusFilter(""); setPage(1); }}
                className="mt-3 text-sm text-indigo-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === "cards" ? (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((a) => {
              const s = SEVERITY_STYLES[a.severity] ?? SEVERITY_STYLES.medium ?? DEFAULT_SEVERITY_STYLE;
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border-l-4 ${s.bg} border ${selectedIds.includes(a.id) ? "ring-2 ring-indigo-400 border-indigo-300" : "border-gray-200"} bg-white p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${a.severity === "critical" ? "border-l-red-500" : a.severity === "high" ? "border-l-orange-500" : ""}`}
                  onClick={() => setDrawerAlertId(a.id)}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(a.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(a.id); }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={a.severity} />
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="mt-1.5 font-medium text-gray-900 line-clamp-2">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{a.alert_type.replace(/_/g, " ")}</p>
                      {a.order_code && (
                        <Link to={`/app/orders/${a.order_id!}`} className="text-xs text-indigo-600 hover:underline mt-1 inline-block" onClick={(e) => e.stopPropagation()}>
                          {a.order_code}
                        </Link>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{a.created_at ? new Date(a.created_at).toLocaleDateString() : ""}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={items.length > 0 && selectedIds.length >= items.length} onChange={toggleSelectAll} className="rounded" />
                </th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50/80 cursor-pointer"
                  onClick={() => setDrawerAlertId(a.id)}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelect(a.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3"><SeverityBadge severity={a.severity} /></td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[240px] truncate" title={a.title}>{a.title}</td>
                  <td className="px-4 py-3 text-gray-600">{a.alert_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    {a.order_id != null && a.order_code ? (
                      <Link to={`/app/orders/${a.order_id}`} className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {a.order_code}
                      </Link>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{a.created_at ? new Date(a.created_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => setDrawerAlertId(a.id)} className="text-indigo-600 hover:underline text-xs">Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > pageSize && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2 bg-gray-50 text-sm text-gray-600">
            <span>Page {page} of {Math.ceil(total / pageSize)}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {drawerAlertId != null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAlertId(null)} />
          <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col max-h-full overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">Alert detail</h2>
              <button type="button" onClick={() => setDrawerAlertId(null)} className="p-1 rounded hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {drawerAlert && (
              <div className="flex border-b border-gray-200 px-2 gap-1">
                {(["summary", "timeline", "comments", "escalation"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDrawerTab(tab)}
                    className={`px-3 py-2 text-sm font-medium rounded-t ${drawerTab === tab ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {drawerLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : drawerAlert ? (
                <>
                  {drawerTab === "summary" && (
                    <>
                      <div>
                        <SeverityBadge severity={drawerAlert.severity} />
                        <span className="ml-2"><StatusBadge status={drawerAlert.status} /></span>
                        <h3 className="mt-2 font-medium text-gray-900">{drawerAlert.title}</h3>
                        {drawerAlert.description && <p className="mt-1 text-sm text-gray-600">{drawerAlert.description}</p>}
                      </div>
                      {drawerAlert.order_id != null && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase">Order</p>
                          <Link to={`/app/orders/${drawerAlert.order_id}`} className="text-indigo-600 hover:underline">
                            {drawerAlert.order_code ?? `#${drawerAlert.order_id}`}
                          </Link>
                        </div>
                      )}
                      {drawerAlert.reason_text && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase">Reason</p>
                          <p className="text-sm text-gray-700">{drawerAlert.reason_text}</p>
                        </div>
                      )}
                      {drawerAlert.recommended_action && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase">Recommended action</p>
                          <p className="text-sm text-gray-700">{drawerAlert.recommended_action}</p>
                        </div>
                      )}
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Update status</p>
                        <div className="flex flex-wrap gap-2">
                          {drawerAlert.status === "new" && (
                            <button type="button" disabled={actionLoading} onClick={() => updateStatus(drawerAlert.id, "acknowledged")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Acknowledge</button>
                          )}
                          {!["resolved", "closed"].includes(drawerAlert.status) && (
                            <>
                              <button type="button" disabled={actionLoading} onClick={() => updateStatus(drawerAlert.id, "in_progress")} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">In progress</button>
                              <button type="button" disabled={actionLoading} onClick={() => updateStatus(drawerAlert.id, "resolved")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Resolve</button>
                              <button type="button" disabled={actionLoading} onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); snoozeAlert(drawerAlert.id, d.toISOString()); }} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">Snooze 1 day</button>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  {drawerTab === "timeline" && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">History</p>
                      {loadingHistory ? <p className="text-sm text-gray-500">Loading…</p> : drawerHistory.length === 0 ? <p className="text-sm text-gray-500">No history yet.</p> : (
                        <ul className="space-y-2">
                          {drawerHistory.map((h) => (
                            <li key={h.id} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                              <span className="font-medium">{h.action}</span>
                              {h.field_name && <span className="text-gray-500"> · {h.field_name}</span>}
                              {(h.old_value != null || h.new_value != null) && <span className="text-gray-500"> {h.old_value ?? "—"} → {h.new_value ?? "—"}</span>}
                              <p className="text-xs text-gray-400">{h.created_at ? new Date(h.created_at).toLocaleString() : ""}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {drawerTab === "comments" && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Comments</p>
                      {loadingComments ? <p className="text-sm text-gray-500">Loading…</p> : (
                        <ul className="space-y-2 mb-4">
                          {drawerComments.map((c) => (
                            <li key={c.id} className="text-sm p-2 rounded bg-gray-50">
                              <p className="text-gray-700">{c.body}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2">
                        <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" className="flex-1 rounded border border-gray-300 p-2 text-sm min-h-[60px]" />
                        <button
                          type="button"
                          disabled={actionLoading || !newComment.trim()}
                          onClick={async () => {
                            if (!newComment.trim() || !drawerAlertId) return;
                            setActionLoading(true);
                            try {
                              const added = await api.addMerchAlertComment(drawerAlertId, newComment.trim());
                              setDrawerComments((prev) => [...prev, added]);
                              setNewComment("");
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 self-end"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                  {drawerTab === "escalation" && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Escalate</p>
                      {drawerAlert.status === "escalated" ? (
                        <p className="text-sm text-gray-600">This alert is already escalated.</p>
                      ) : (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={async () => {
                            if (!drawerAlertId) return;
                            setActionLoading(true);
                            try {
                              await api.escalateMerchAlert(drawerAlertId, 1, undefined, "Escalated from alert center");
                              setDrawerAlert((prev) => (prev ? { ...prev, status: "escalated" } : null));
                              await fetchList();
                            } finally {
                              setActionLoading(false);
                            }
                          }}
                          className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-50"
                        >
                          Escalate alert
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">Could not load alert.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save view modal */}
      {saveViewModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSaveViewModalOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900">Save current view</h3>
            <p className="text-sm text-gray-500 mt-1">Save the current filters as a named view to load later.</p>
            <label className="block mt-4 text-sm font-medium text-gray-700">Name</label>
            <input type="text" value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="e.g. My critical alerts" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            <div className="flex gap-2 mt-6 justify-end">
              <button type="button" onClick={() => setSaveViewModalOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={saveCurrentView} disabled={!saveViewName.trim()} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
