/**
 * HR → Manpower → Organogram: interactive hierarchy chart + numbers table.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  hrManpowerApi,
  type ManpowerAttendanceBridge,
  type ManpowerOrganogram,
  type ManpowerOrgNode,
} from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";
import { logApiError } from "@/utils/logApiError";
import { OrganogramChart } from "./OrganogramChart";
import { OrganogramInspector } from "./OrganogramInspector";
import {
  buildVisibleForest,
  collapseToManagersIds,
  collectDepartments,
  computeKpis,
  expandAncestors,
  findNodeById,
  initialCollapsedIds,
  isFlatTree,
  layoutTree,
  searchNodes,
  type ColourMode,
} from "./organogramChartLogic";
import { downloadOrganogramPng } from "./organogramExport";

const ROOT_LIMIT = 100;

function OrgRows({ nodes }: { nodes: ManpowerOrgNode[] }) {
  return (
    <>
      {nodes.map((n) => (
        <tr key={n.employee_id} className="border-b border-border/60">
          <td className="py-1.5 pr-3" style={{ paddingLeft: `${n.depth * 16 + 4}px` }}>
            <span className="font-medium">{n.name}</span>{" "}
            <span className="text-xs text-text-secondary">({n.employee_code})</span>
            <div className="text-xs text-text-secondary">
              {[n.department_name, n.designation_title].filter(Boolean).join(" · ") || "—"}
            </div>
          </td>
          <td className="py-1.5 pr-3">{n.suggested ?? "—"}</td>
          <td className="py-1.5 pr-3">{n.approved_quota ?? "—"}</td>
          <td className="py-1.5 pr-3">{n.present_today ? "Yes" : "No"}</td>
        </tr>
      ))}
      {nodes.map((n) =>
        n.children.length ? <OrgRows key={`c-${n.employee_id}`} nodes={n.children} /> : null,
      )}
    </>
  );
}

export function HrManpowerOrganogramPage() {
  const { me } = useAuth();
  const canExport = canExportHrData(me);
  const approvalOn = me?.feature_flags?.hr_employee_change_approval === true;
  const workspaceV2 = me?.feature_flags?.hr_onboarding_workspace_v2 === true;

  const [dateOn, setDateOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [rootOffset, setRootOffset] = useState(0);
  const [org, setOrg] = useState<ManpowerOrganogram | null>(null);
  const [bridge, setBridge] = useState<ManpowerAttendanceBridge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");

  const [view, setView] = useState<"chart" | "table">("chart");
  const [deptId, setDeptId] = useState<number | null>(null);
  const [presentOnly, setPresentOnly] = useState(false);
  const [colourMode, setColourMode] = useState<ColourMode>("attendance");
  const [focusId, setFocusId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [centerOnId, setCenterOnId] = useState<number | null>(null);
  const [fitToken, setFitToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, b] = await Promise.all([
        hrManpowerApi.organogram({ date: dateOn, root_limit: ROOT_LIMIT, root_offset: rootOffset }),
        hrManpowerApi.attendanceBridge(dateOn),
      ]);
      setOrg(o);
      setBridge(b);
      setCollapsed(initialCollapsedIds(o.roots, o.nodes_returned));
      setFocusId(null);
      setSelectedId(null);
      setHighlightId(null);
    } catch (e) {
      logApiError("HrManpowerOrganogramPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load organogram.");
      setOrg(null);
      setBridge(null);
    } finally {
      setLoading(false);
    }
  }, [dateOn, rootOffset]);

  useEffect(() => {
    void load();
  }, [load]);

  const departments = useMemo(() => (org ? collectDepartments(org.roots) : []), [org]);
  const visible = useMemo(
    () =>
      org
        ? buildVisibleForest({
            roots: org.roots,
            deptId,
            presentOnly,
            focusId,
          })
        : [],
    [org, deptId, presentOnly, focusId],
  );
  const kpis = useMemo(() => computeKpis(visible), [visible]);
  const searchHits = useMemo(
    () => (org && searchQ.trim() ? searchNodes(org.roots, searchQ) : []),
    [org, searchQ],
  );
  const selectedPerson = useMemo(() => {
    if (selectedId == null || !org) return null;
    return findNodeById(org.roots, selectedId);
  }, [org, selectedId]);
  const focusPerson = useMemo(() => {
    if (focusId == null || !org) return null;
    return findNodeById(org.roots, focusId);
  }, [org, focusId]);

  const rootPageStart = rootOffset + 1;
  const rootPageEnd = rootOffset + (org?.roots.length ?? 0);
  const hasMoreRoots = !!org && org.total_roots > org.roots.length;
  const flat = !!org && isFlatTree(org.roots);

  const jumpTo = (id: number) => {
    if (!org) return;
    setCollapsed((prev) => expandAncestors(prev, org.roots, id));
    setSelectedId(id);
    setHighlightId(id);
    setCenterOnId(id);
    setFitToken((t) => t + 1);
  };

  const onSearchGo = () => {
    const hit = searchHits[0];
    if (hit) jumpTo(hit.id);
  };

  const onDownloadPng = async () => {
    if (!org || !canExport) return;
    setExportError("");
    try {
      const layout = layoutTree(visible, collapsed);
      await downloadOrganogramPng({
        layout,
        colourMode,
        date: dateOn,
        title: `Organogram ${dateOn}${focusPerson ? ` — ${focusPerson.name}` : ""}`,
      });
    } catch (e) {
      logApiError("HrManpowerOrganogramPage.png", e);
      setExportError(e instanceof Error ? e.message : "PNG export failed.");
    }
  };

  const filterSummary = [
    deptId != null ? departments.find((d) => d.id === deptId)?.name || `Dept ${deptId}` : null,
    presentOnly ? "Present only" : null,
    focusPerson ? `Focus: ${focusPerson.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Organogram"
        description="Interactive reporting hierarchy with attendance, span of control, and Suggested | Approved | Present."
      />

      <div className="print-only text-sm">
        <p className="font-semibold">Organogram — {dateOn}</p>
        {filterSummary ? <p className="text-text-secondary">{filterSummary}</p> : null}
      </div>

      <div className="no-print flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-text-secondary">Date</span>
          <input
            type="date"
            className="rounded border border-border bg-surface px-2 py-1"
            value={dateOn}
            onChange={(e) => {
              setRootOffset(0);
              setDateOn(e.target.value);
            }}
          />
        </label>
        {bridge ? (
          <span className="text-text-secondary">
            Standing {bridge.standing_active} · On floor {bridge.present_today} · Away/unmarked{" "}
            {bridge.absent_or_unmarked}
          </span>
        ) : null}
        <div className="ml-auto flex rounded-md border border-border p-0.5 text-xs">
          <button
            type="button"
            className={`rounded px-3 py-1 ${view === "chart" ? "bg-brand-primary text-white" : "text-text-secondary"}`}
            onClick={() => setView("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1 ${view === "table" ? "bg-brand-primary text-white" : "text-text-secondary"}`}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-text-secondary">Loading…</p> : null}

      {org && hasMoreRoots ? (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>
            Showing top-level roots {rootPageStart}–{rootPageEnd} of {org.total_roots} — search, filters, and KPIs
            apply to this page of roots.
          </span>
          <button
            type="button"
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs disabled:opacity-40"
            disabled={rootOffset <= 0}
            onClick={() => setRootOffset((o) => Math.max(0, o - ROOT_LIMIT))}
          >
            Prev roots
          </button>
          <button
            type="button"
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs disabled:opacity-40"
            disabled={rootOffset + ROOT_LIMIT >= org.total_roots}
            onClick={() => setRootOffset((o) => o + ROOT_LIMIT)}
          >
            Next roots
          </button>
        </div>
      ) : null}

      {org?.truncated ? (
        <p className="text-sm text-amber-700">Tree truncated at depth/node caps for performance.</p>
      ) : null}

      {org && (org.roots.length === 0 || flat) ? (
        <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
          {org.roots.length === 0
            ? "No active employees on this root page."
            : "This looks like a flat list (no reporting links)."}{" "}
          Set <strong>Reporting manager</strong> on employees (<strong>Employment &amp; Salary</strong> or{" "}
          <strong>Job</strong> tab) to build the hierarchy.
        </p>
      ) : null}

      {org && !loading ? (
        <>
          <div className="no-print grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="People shown" value={String(kpis.peopleMatching)} />
            <Kpi
              label="% present"
              value={kpis.presentPct == null ? "—" : `${kpis.presentPct}%`}
            />
            <Kpi label="Managers" value={String(kpis.managers)} />
            <Kpi
              label="Avg span"
              value={kpis.avgSpan == null ? "—" : String(kpis.avgSpan)}
            />
            <Kpi label="Max depth" value={String(kpis.maxDepth)} />
          </div>

          <div className="no-print flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Search</span>
              <div className="flex gap-1">
                <input
                  type="search"
                  className="w-44 rounded border border-border bg-surface px-2 py-1"
                  placeholder="Name or code"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSearchGo();
                  }}
                />
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-subtle"
                  onClick={onSearchGo}
                  disabled={!searchHits.length}
                >
                  Go
                </button>
              </div>
              {searchQ.trim() && searchHits.length === 0 ? (
                <span className="text-xs text-text-secondary">No matches on this root page</span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Department</span>
              <select
                className="rounded border border-border bg-surface px-2 py-1"
                value={deptId ?? ""}
                onChange={(e) => setDeptId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                className="rounded border-border-strong"
                checked={presentOnly}
                onChange={(e) => setPresentOnly(e.target.checked)}
              />
              <span className="text-xs">Present today only</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Colour</span>
              <select
                className="rounded border border-border bg-surface px-2 py-1"
                value={colourMode}
                onChange={(e) => setColourMode(e.target.value as ColourMode)}
              >
                <option value="attendance">Attendance</option>
                <option value="department">Department</option>
              </select>
            </label>
            {focusId != null ? (
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-subtle"
                onClick={() => setFocusId(null)}
              >
                Back to full company
                {focusPerson ? ` (from ${focusPerson.name})` : ""}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-subtle"
              onClick={() => setCollapsed(new Set())}
            >
              Expand all
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-subtle"
              onClick={() => org && setCollapsed(collapseToManagersIds(org.roots))}
            >
              Collapse to managers
            </button>
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-subtle"
              onClick={() => window.print()}
            >
              Print
            </button>
            {canExport ? (
              <button
                type="button"
                className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-subtle"
                onClick={() => void onDownloadPng()}
              >
                Download PNG
              </button>
            ) : null}
          </div>
          {exportError ? <p className="no-print text-sm text-danger">{exportError}</p> : null}

          {view === "chart" ? (
            <>
              <div className="no-print flex flex-col gap-3 lg:flex-row">
                <div className="min-w-0 flex-1">
                  <OrganogramChart
                    roots={visible}
                    collapsed={collapsed}
                    colourMode={colourMode}
                    selectedId={selectedId}
                    highlightId={highlightId}
                    fitToken={fitToken}
                    centerOnId={centerOnId}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setHighlightId(id);
                    }}
                    onToggleCollapse={(id) => {
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  />
                </div>
                <OrganogramInspector
                  person={selectedPerson}
                  approvalOn={approvalOn}
                  workspaceV2={workspaceV2}
                  onClose={() => setSelectedId(null)}
                  onFocusTeam={(id) => {
                    setFocusId(id);
                    setFitToken((t) => t + 1);
                  }}
                  onJumpTo={jumpTo}
                />
              </div>
              {/* Always mounted so Print does not race React state; hidden from a11y/screen until print CSS shows it. */}
              <div className="print-only" aria-hidden="true">
                <OrganogramChart
                  roots={visible}
                  collapsed={collapsed}
                  colourMode={colourMode}
                  selectedId={null}
                  highlightId={null}
                  printMode
                  onSelect={() => undefined}
                  onToggleCollapse={() => undefined}
                />
              </div>
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th className="py-2 pr-3">Person</th>
                    <th className="py-2 pr-3">Suggested</th>
                    <th className="py-2 pr-3">Approved</th>
                    <th className="py-2 pr-3">Present today</th>
                  </tr>
                </thead>
                <tbody>
                  <OrgRows nodes={visible} />
                </tbody>
              </table>
              {visible.length === 0 ? (
                <p className="py-4 text-sm text-text-secondary">No people match the current filters.</p>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-subtle px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

export default HrManpowerOrganogramPage;
