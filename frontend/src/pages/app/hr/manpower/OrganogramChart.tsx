/**
 * Pure-SVG hierarchy canvas for Manpower Organogram (pan / zoom / fit / print-clean).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilteredNode, LayoutNode } from "./organogramChartLogic";
import {
  CARD_H,
  CARD_W,
  cardAccent,
  layoutTree,
  type ColourMode,
  type ChartLayout,
} from "./organogramChartLogic";

type Props = {
  roots: FilteredNode[];
  collapsed: Set<number>;
  colourMode: ColourMode;
  selectedId: number | null;
  highlightId: number | null;
  printMode?: boolean;
  onSelect: (id: number) => void;
  onToggleCollapse: (id: number) => void;
  /** Bumped when the page wants Fit to screen (e.g. after search jump). */
  fitToken?: number;
  /** Optional: centre on this employee after layout. */
  centerOnId?: number | null;
  className?: string;
};

export type OrganogramChartHandle = {
  getLayout: () => ChartLayout;
};

function connector(
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

export function OrganogramChart({
  roots,
  collapsed,
  colourMode,
  selectedId,
  highlightId,
  printMode = false,
  onSelect,
  onToggleCollapse,
  fitToken = 0,
  centerOnId = null,
  className = "",
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutTree(roots, collapsed), [roots, collapsed]);
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fit = useCallback(() => {
    const el = viewportRef.current;
    const vw = el?.clientWidth || 800;
    const vh = el?.clientHeight || 520;
    const pad = 24;
    const sx = (vw - pad * 2) / Math.max(layout.width, 1);
    const sy = (vh - pad * 2) / Math.max(layout.height, 1);
    const next = Math.min(1.2, Math.max(0.25, Math.min(sx, sy)));
    setScale(next);
    setTx((vw - layout.width * next) / 2);
    setTy(pad);
  }, [layout.height, layout.width]);

  useEffect(() => {
    if (printMode) return;
    fit();
  }, [fit, fitToken, printMode]);

  useEffect(() => {
    if (printMode || centerOnId == null) return;
    const ln = byId.get(centerOnId);
    const el = viewportRef.current;
    if (!ln || !el) return;
    const vw = el.clientWidth || 800;
    const vh = el.clientHeight || 520;
    setTx(vw / 2 - (ln.x + CARD_W / 2) * scale);
    setTy(vh / 3 - (ln.y + CARD_H / 2) * scale);
  }, [byId, centerOnId, printMode, scale]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (printMode || e.button !== 0) return;
    if ((e.target as Element).closest("[data-org-card]")) return;
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const zoomBy = (factor: number) => {
    setScale((s) => Math.min(2, Math.max(0.25, s * factor)));
  };

  const transform = printMode ? undefined : `translate(${tx} ${ty}) scale(${scale})`;

  return (
    <div className={`relative ${className}`}>
      {!printMode ? (
        <div className="no-print absolute right-2 top-2 z-10 flex gap-1 rounded-md border border-border bg-surface p-1 shadow-sm">
          <button type="button" className="rounded px-2 py-1 text-xs hover:bg-surface-subtle" onClick={() => zoomBy(1.15)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="rounded px-2 py-1 text-xs hover:bg-surface-subtle" onClick={() => zoomBy(1 / 1.15)} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="rounded px-2 py-1 text-xs hover:bg-surface-subtle" onClick={fit} aria-label="Fit to screen">
            Fit
          </button>
        </div>
      ) : null}
      <div
        ref={viewportRef}
        className={
          printMode
            ? "org-chart-print-viewport w-full"
            : "org-chart-viewport h-[min(70vh,640px)] w-full cursor-grab overflow-hidden rounded-lg border border-border bg-slate-50 active:cursor-grabbing"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <svg
          width="100%"
          height={printMode ? undefined : "100%"}
          viewBox={printMode ? `0 0 ${layout.width} ${layout.height}` : undefined}
          className={printMode ? "h-auto w-full" : "h-full w-full"}
          role="img"
          aria-label="Employee reporting hierarchy chart"
        >
          {!printMode ? <rect width="100%" height="100%" fill="#f8fafc" /> : <rect width={layout.width} height={layout.height} fill="#ffffff" />}
          <g transform={transform}>
            {layout.edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={connector(a, b)}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                />
              );
            })}
            {layout.nodes.map((ln) => {
              const n = ln.node;
              const accent = cardAccent(n, colourMode);
              const selected = selectedId === ln.id;
              const highlighted = highlightId === ln.id;
              const label = `${n.name}, ${n.employee_code}${n.present_today ? ", present" : ", away"}`;
              return (
                <g
                  key={ln.id}
                  data-org-card
                  transform={`translate(${ln.x},${ln.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  className="outline-none"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect(ln.id);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onSelect(ln.id);
                    }
                  }}
                >
                  <rect
                    width={CARD_W}
                    height={CARD_H}
                    rx={8}
                    fill={n.isContextBridge ? "#f8fafc" : "#ffffff"}
                    stroke={highlighted || selected ? "#0f766e" : accent}
                    strokeWidth={selected || highlighted ? 3 : 2}
                    strokeDasharray={n.isContextBridge ? "4 3" : undefined}
                  />
                  <rect x={0} y={0} width={6} height={CARD_H} rx={2} fill={accent} />
                  <text x={14} y={22} fontSize={12} fontWeight={600} fill="#0f172a">
                    {n.name.length > 22 ? `${n.name.slice(0, 20)}…` : n.name}
                  </text>
                  <text x={14} y={38} fontSize={10} fill="#64748b">
                    {n.employee_code}
                  </text>
                  <text x={14} y={54} fontSize={10} fill="#475569">
                    {([n.department_name, n.designation_title].filter(Boolean).join(" · ") || "—").slice(0, 28)}
                  </text>
                  <text x={14} y={72} fontSize={10} fill="#334155">
                    {n.present_today ? "Present" : "Away"}
                    {n.totalDirectReports > 0 ? ` · Span ${n.totalDirectReports}` : ""}
                  </text>
                  {n.children.length > 0 ? (
                    <g
                      transform={`translate(${CARD_W - 22}, 8)`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onToggleCollapse(ln.id);
                      }}
                    >
                      <rect width={16} height={16} rx={3} fill="#e2e8f0" />
                      <text x={8} y={12} textAnchor="middle" fontSize={12} fill="#0f172a">
                        {collapsed.has(ln.id) ? "+" : "−"}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {!printMode ? (
        <div className="no-print mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-emerald-600" /> Present / accent
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm border border-dashed border-slate-400 bg-slate-50" /> Bridge (filter context)
          </span>
          <span>Drag background to pan · use + / − / Fit to zoom</span>
        </div>
      ) : null}
    </div>
  );
}

export default OrganogramChart;
