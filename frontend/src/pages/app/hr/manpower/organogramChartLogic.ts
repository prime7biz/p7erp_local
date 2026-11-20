/**
 * Pure helpers for the Manpower Organogram chart: filter/focus, tidy layout,
 * KPIs, colour keys, and a standalone SVG string for print/PNG export.
 * No React / DOM here — keep it unit-testable in the Node Vitest environment.
 */
import type { ManpowerOrgNode } from "@/api/hrManpower";

export const CARD_W = 200;
export const CARD_H = 92;
export const GAP_X = 28;
export const GAP_Y = 56;
export const LAYOUT_PAD = 24;

/** Canvas clamp for PNG export (desktop + iOS Safari safe). */
export const MAX_CANVAS_SIDE = 8192;
export const MAX_CANVAS_PIXELS = 16_000_000;

export const DEPT_PALETTE = [
  "#0f766e",
  "#1d4ed8",
  "#a16207",
  "#be123c",
  "#7c3aed",
  "#0369a1",
  "#b45309",
  "#047857",
] as const;

export type ColourMode = "attendance" | "department";

export type PreparedNode = ManpowerOrgNode & {
  /** Direct reports on the raw API node (before filters). */
  totalDirectReports: number;
  children: PreparedNode[];
};

export type FilteredNode = PreparedNode & {
  /** Kept only to bridge a matching descendant under a department/present filter. */
  isContextBridge: boolean;
  children: FilteredNode[];
};

export type LayoutNode = {
  id: number;
  x: number;
  y: number;
  depth: number;
  node: FilteredNode;
};

export type LayoutEdge = { from: number; to: number };

export type ChartLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
};

export type OrganogramKpis = {
  peopleMatching: number;
  presentMatching: number;
  presentPct: number | null;
  managers: number;
  avgSpan: number | null;
  maxSpan: number;
  maxDepth: number;
};

export type DepartmentOption = { id: number; name: string };

export type SearchHit = { id: number; label: string };

export type ExportSvgOptions = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  colourMode: ColourMode;
  title?: string;
};

function walkPrep(n: ManpowerOrgNode): PreparedNode {
  const children = n.children.map(walkPrep);
  return { ...n, totalDirectReports: n.children.length, children };
}

/** Attach span-of-control counts from the unfiltered API tree. */
export function prepareTree(roots: ManpowerOrgNode[]): PreparedNode[] {
  return roots.map(walkPrep);
}

export function isFlatTree(roots: ManpowerOrgNode[]): boolean {
  return roots.length > 1 && roots.every((r) => r.children.length === 0);
}

export function collectDepartments(roots: ManpowerOrgNode[]): DepartmentOption[] {
  const map = new Map<number, string>();
  const walk = (nodes: ManpowerOrgNode[]) => {
    for (const n of nodes) {
      if (n.department_id != null) {
        map.set(n.department_id, n.department_name || `Dept ${n.department_id}`);
      }
      walk(n.children);
    }
  };
  walk(roots);
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function nodeMatches(
  n: PreparedNode,
  deptId: number | null,
  presentOnly: boolean,
): boolean {
  if (deptId != null && n.department_id !== deptId) return false;
  if (presentOnly && !n.present_today) return false;
  return true;
}

/**
 * Keep matching nodes; keep non-matching managers only when a descendant matches
 * (marked `isContextBridge`). Absent managers with zero matching descendants drop out.
 */
export function filterTree(
  roots: PreparedNode[],
  opts: { deptId: number | null; presentOnly: boolean },
): FilteredNode[] {
  const walk = (n: PreparedNode): FilteredNode | null => {
    const kids = n.children.map(walk).filter((c): c is FilteredNode => c != null);
    const direct = nodeMatches(n, opts.deptId, opts.presentOnly);
    if (direct || kids.length > 0) {
      return {
        ...n,
        isContextBridge: !direct,
        children: kids,
      };
    }
    return null;
  };
  return roots.map(walk).filter((n): n is FilteredNode => n != null);
}

export function findNodeById(
  roots: (FilteredNode | PreparedNode | ManpowerOrgNode)[],
  employeeId: number,
): ManpowerOrgNode | null {
  for (const n of roots) {
    if (n.employee_id === employeeId) return n;
    const hit = findNodeById(n.children, employeeId);
    if (hit) return hit;
  }
  return null;
}

/** Ancestor ids from root down to (but not including) the target; empty if missing. */
export function ancestorIds(
  roots: (FilteredNode | PreparedNode | ManpowerOrgNode)[],
  employeeId: number,
): number[] {
  const path: number[] = [];
  const walk = (nodes: (FilteredNode | PreparedNode | ManpowerOrgNode)[]): boolean => {
    for (const n of nodes) {
      if (n.employee_id === employeeId) return true;
      path.push(n.employee_id);
      if (walk(n.children)) return true;
      path.pop();
    }
    return false;
  };
  return walk(roots) ? path : [];
}

export function searchNodes(
  roots: ManpowerOrgNode[],
  query: string,
  limit = 20,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const walk = (nodes: ManpowerOrgNode[]) => {
    for (const n of nodes) {
      if (hits.length >= limit) return;
      const code = (n.employee_code || "").toLowerCase();
      const name = (n.name || "").toLowerCase();
      if (code.includes(q) || name.includes(q)) {
        hits.push({ id: n.employee_id, label: `${n.name} (${n.employee_code})` });
      }
      walk(n.children);
    }
  };
  walk(roots);
  return hits;
}

export function initialCollapsedIds(
  roots: ManpowerOrgNode[],
  nodesReturned: number,
): Set<number> {
  const collapsed = new Set<number>();
  if (nodesReturned <= 40) return collapsed;
  const walk = (nodes: ManpowerOrgNode[]) => {
    for (const n of nodes) {
      if (n.depth >= 1 && n.children.length > 0) collapsed.add(n.employee_id);
      walk(n.children);
    }
  };
  walk(roots);
  return collapsed;
}

export function allExpandableIds(roots: ManpowerOrgNode[]): number[] {
  const ids: number[] = [];
  const walk = (nodes: ManpowerOrgNode[]) => {
    for (const n of nodes) {
      if (n.children.length > 0) ids.push(n.employee_id);
      walk(n.children);
    }
  };
  walk(roots);
  return ids;
}

export function collapseToManagersIds(roots: ManpowerOrgNode[]): Set<number> {
  const collapsed = new Set<number>();
  const walk = (nodes: ManpowerOrgNode[]) => {
    for (const n of nodes) {
      if (n.depth >= 1 && n.children.length > 0) collapsed.add(n.employee_id);
      walk(n.children);
    }
  };
  walk(roots);
  return collapsed;
}

function visibleChildren(n: FilteredNode, collapsed: Set<number>): FilteredNode[] {
  if (collapsed.has(n.employee_id)) return [];
  return n.children;
}

/**
 * Top-down tidy packing: each leaf takes one column; parents centre over children.
 */
export function layoutTree(
  roots: FilteredNode[],
  collapsed: Set<number>,
): ChartLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let cursor = 0;

  const place = (n: FilteredNode, depth: number): { mid: number; y: number } => {
    const kids = visibleChildren(n, collapsed);
    const y = LAYOUT_PAD + depth * (CARD_H + GAP_Y);
    let mid: number;
    if (!kids.length) {
      mid = LAYOUT_PAD + cursor * (CARD_W + GAP_X) + CARD_W / 2;
      cursor += 1;
    } else {
      const mids = kids.map((c) => {
        edges.push({ from: n.employee_id, to: c.employee_id });
        return place(c, depth + 1).mid;
      });
      const firstMid = mids[0] ?? 0;
      const lastMid = mids[mids.length - 1] ?? firstMid;
      mid = (firstMid + lastMid) / 2;
    }
    nodes.push({
      id: n.employee_id,
      x: mid - CARD_W / 2,
      y,
      depth,
      node: n,
    });
    return { mid, y };
  };

  for (const r of roots) place(r, 0);

  const width =
    nodes.length === 0
      ? LAYOUT_PAD * 2 + CARD_W
      : Math.max(...nodes.map((n) => n.x + CARD_W)) + LAYOUT_PAD;
  const height =
    nodes.length === 0
      ? LAYOUT_PAD * 2 + CARD_H
      : Math.max(...nodes.map((n) => n.y + CARD_H)) + LAYOUT_PAD;

  return { nodes, edges, width, height };
}

/** KPIs on matching (non-bridge) nodes of the filtered+focused tree — ignore collapse. */
export function computeKpis(roots: FilteredNode[]): OrganogramKpis {
  let peopleMatching = 0;
  let presentMatching = 0;
  let managers = 0;
  let spanSum = 0;
  let maxSpan = 0;
  let maxDepth = 0;

  const walk = (nodes: FilteredNode[]) => {
    for (const n of nodes) {
      if (!n.isContextBridge) {
        maxDepth = Math.max(maxDepth, n.depth);
        peopleMatching += 1;
        if (n.present_today) presentMatching += 1;
        if (n.totalDirectReports > 0) {
          managers += 1;
          spanSum += n.totalDirectReports;
          maxSpan = Math.max(maxSpan, n.totalDirectReports);
        }
      }
      walk(n.children);
    }
  };
  walk(roots);

  return {
    peopleMatching,
    presentMatching,
    presentPct: peopleMatching === 0 ? null : Math.round((presentMatching / peopleMatching) * 1000) / 10,
    managers,
    avgSpan: managers === 0 ? null : Math.round((spanSum / managers) * 10) / 10,
    maxSpan,
    maxDepth,
  };
}

export function departmentColour(departmentId: number | null): string {
  if (departmentId == null) return "#64748b";
  return DEPT_PALETTE[Math.abs(departmentId) % DEPT_PALETTE.length] ?? "#64748b";
}

export function cardAccent(node: FilteredNode, mode: ColourMode): string {
  if (mode === "department") return departmentColour(node.department_id);
  return node.present_today ? "#059669" : "#94a3b8";
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function clampCanvasSize(width: number, height: number): { width: number; height: number; scale: number } {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const sideScale = Math.min(1, MAX_CANVAS_SIDE / w, MAX_CANVAS_SIDE / h);
  const areaScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
  const scale = Math.min(sideScale, areaScale);
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
    scale,
  };
}

function connectorPath(
  from: LayoutNode,
  to: LayoutNode,
): string {
  const x1 = from.x + CARD_W / 2;
  const y1 = from.y + CARD_H;
  const x2 = to.x + CARD_W / 2;
  const y2 = to.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
}

/** Standalone SVG for print / PNG (literal colours, system fonts, escaped text). */
export function buildExportSvg(opts: ExportSvgOptions): string {
  const { nodes, edges, width, height, colourMode, title } = opts;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edgePaths = edges
    .map((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) return "";
      return `<path d="${connectorPath(a, b)}" fill="none" stroke="#94a3b8" stroke-width="1.5"/>`;
    })
    .join("");

  const cards = nodes
    .map((ln) => {
      const n = ln.node;
      const accent = cardAccent(n, colourMode);
      const fill = n.isContextBridge ? "#f8fafc" : "#ffffff";
      const stroke = n.isContextBridge ? "#cbd5e1" : accent;
      const dash = n.isContextBridge ? ` stroke-dasharray="4 3"` : "";
      const sub = [n.department_name, n.designation_title].filter(Boolean).join(" · ") || "—";
      const present = n.present_today ? "Present" : "Away";
      const metrics = [
        n.suggested != null ? `Sug ${n.suggested}` : null,
        n.approved_quota != null ? `App ${n.approved_quota}` : null,
        n.totalDirectReports > 0 ? `Span ${n.totalDirectReports}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        `<g transform="translate(${ln.x},${ln.y})">` +
        `<rect width="${CARD_W}" height="${CARD_H}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash}/>` +
        `<rect x="0" y="0" width="6" height="${CARD_H}" rx="2" fill="${accent}"/>` +
        `<text x="14" y="22" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="12" font-weight="600" fill="#0f172a">${escapeXml(n.name)}</text>` +
        `<text x="14" y="38" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="10" fill="#64748b">${escapeXml(n.employee_code)}</text>` +
        `<text x="14" y="54" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="10" fill="#475569">${escapeXml(sub)}</text>` +
        `<text x="14" y="70" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="10" fill="#334155">${escapeXml(present)}${metrics ? " · " + escapeXml(metrics) : ""}</text>` +
        `</g>`
      );
    })
    .join("");

  const titleEl = title
    ? `<text x="${LAYOUT_PAD}" y="16" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="12" font-weight="600" fill="#0f172a">${escapeXml(title)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    titleEl +
    edgePaths +
    cards +
    `</svg>`
  );
}

/**
 * Pipeline used by the page: prepare → optional focus → filter.
 * `focusId` is resolved against the prepared (unfiltered) tree so Focus works before filters.
 */
export function buildVisibleForest(opts: {
  roots: ManpowerOrgNode[];
  deptId: number | null;
  presentOnly: boolean;
  focusId: number | null;
}): FilteredNode[] {
  const prepared = prepareTree(opts.roots);
  let base: PreparedNode[] = prepared;
  if (opts.focusId != null) {
    const hit = findNodeById(prepared, opts.focusId) as PreparedNode | null;
    base = hit ? [hit] : [];
  }
  return filterTree(base, { deptId: opts.deptId, presentOnly: opts.presentOnly });
}

/** Expand collapsed set so every ancestor of `employeeId` is open. */
export function expandAncestors(
  collapsed: Set<number>,
  roots: ManpowerOrgNode[],
  employeeId: number,
): Set<number> {
  const next = new Set(collapsed);
  for (const id of ancestorIds(roots, employeeId)) next.delete(id);
  return next;
}
