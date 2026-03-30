import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type StyleReportRow } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  listPageErrorClass,
  listPageFilterBarClass,
  listPageEmptyClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { ResponsiveTableContainer } from "@/components/app/ResponsiveTableContainer";
import { useListPagination } from "@/hooks/useListPagination";
import { logApiError } from "@/utils/logApiError";
import { cn } from "@/lib/utils";

const LIFECYCLE_OPTIONS = [
  "INQUIRY",
  "DEVELOPMENT",
  "QUOTED",
  "ORDERED",
  "IN_PRODUCTION",
  "SHIPPED",
  "PAID",
  "CLOSED",
];

export function ReportStyle360Page() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStyleIdRaw = searchParams.get("styleId");
  const pinnedStyleId = useMemo(() => {
    const n = Number(initialStyleIdRaw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [initialStyleIdRaw]);

  const [rows, setRows] = useState<StyleReportRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [savedView, setSavedView] = useState("");
  const { page, setPage, pageSize, setPageSize, offset } = useListPagination();

  const clearPinnedStyle = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("styleId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const base = {
        search: search.trim() || undefined,
        lifecycle_stage: lifecycleStage || undefined,
        critical_only: criticalOnly,
        saved_view: savedView || undefined,
        report_limit: pageSize,
        report_offset: offset,
      };
      // Deep link: load this style only (ignore critical/saved filters so non-critical styles still appear).
      const res = pinnedStyleId
        ? await api.listStyleSummaryReportWithTotal({
            style_ids: [pinnedStyleId],
            report_limit: 1,
            report_offset: 0,
          })
        : await api.listStyleSummaryReportWithTotal(base);
      setRows(res.rows);
      setListTotal(res.total ?? res.rows.length);
    } catch (e) {
      logApiError("ReportStyle360Page", e);
      setError(e instanceof Error ? e.message : "Failed to load style report");
      setRows([]);
      setListTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    search,
    lifecycleStage,
    criticalOnly,
    savedView,
    pageSize,
    offset,
    pinnedStyleId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Style 360 Report"
        description="Monitor open follow-up, overdue milestones, and pending payment by style. Server-paged like other ERP lists."
      />

      {pinnedStyleId ? (
        <div className="rounded-xl border border-status-info/30 bg-status-info-subtle px-4 py-3 text-sm text-status-info-foreground">
          Showing style #{pinnedStyleId} from link.{" "}
          <button type="button" onClick={clearPinnedStyle} className="font-semibold underline">
            Show full report
          </button>
        </div>
      ) : null}

      <div className={listPageFilterBarClass}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search style code/name"
          className={listPageToolbarInputClass}
        />
        <select
          value={lifecycleStage}
          onChange={(e) => {
            setLifecycleStage(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
        >
          <option value="">All lifecycle</option>
          {LIFECYCLE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={savedView}
          onChange={(e) => {
            setSavedView(e.target.value);
            setPage(1);
          }}
          className={listPageToolbarSelectClass}
        >
          <option value="">No saved view</option>
          <option value="critical_styles">Critical styles</option>
          <option value="shipment_due_week">Shipment due this week</option>
          <option value="payment_overdue">Payment overdue</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={criticalOnly}
            onChange={(e) => {
              setCriticalOnly(e.target.checked);
              setPage(1);
            }}
          />
          Critical only
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
        >
          Refresh
        </button>
      </div>

      {error && <div className={listPageErrorClass}>{error}</div>}

      <div className={listPageTableCardClass}>
        {loading ? (
          <div className={listPageLoadingClass}>Loading report…</div>
        ) : rows.length === 0 ? (
          <div className={listPageEmptyClass}>No rows found.</div>
        ) : (
          <>
            <ResponsiveTableContainer>
              <table className={cn(listTableBaseClass, "min-w-[1100px]")}>
                <thead className={listTableTheadClass}>
                  <tr>
                    <th className={listTableThClass}>Style</th>
                    <th className={listTableThClass}>Lifecycle</th>
                    <th className={listTableThRightClass}>Open actions</th>
                    <th className={listTableThRightClass}>Overdue</th>
                    <th className={listTableThRightClass}>Invoice</th>
                    <th className={listTableThRightClass}>Received</th>
                    <th className={listTableThRightClass}>Due</th>
                    <th className={listTableThClass}>Next due</th>
                    <th className={listTableThClass}>Last event</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.style_id} className={listTableTrClass}>
                      <td className={listTableTdClass}>
                        <Link className="text-brand-primary hover:underline" to={`/app/merchandising/styles/${row.style_id}`}>
                          {row.style_code} · {row.style_name}
                        </Link>
                      </td>
                      <td className={listTableTdClass}>{row.lifecycle_stage}</td>
                      <td className={cn(listTableTdClass, "text-right")}>{row.open_followup_actions}</td>
                      <td className={cn(listTableTdClass, "text-right")}>{row.overdue_followup_actions}</td>
                      <td className={cn(listTableTdClass, "text-right")}>{row.invoice_amount}</td>
                      <td className={cn(listTableTdClass, "text-right")}>{row.received_amount}</td>
                      <td className={cn(listTableTdClass, "text-right text-status-danger-foreground")}>{row.due_amount}</td>
                      <td className={listTableTdClass}>
                        {row.next_due_at ? new Date(row.next_due_at).toLocaleDateString() : "—"}
                      </td>
                      <td className={listTableTdClass}>
                        {row.last_event_at ? new Date(row.last_event_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTableContainer>
            {!pinnedStyleId && listTotal > 0 ? (
              <DataTablePagination
                page={page}
                pageSize={pageSize}
                total={listTotal}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
