import { describe, expect, it } from "vitest";
import type { ManpowerOrgNode } from "@/api/hrManpower";
import {
  ancestorIds,
  buildExportSvg,
  buildVisibleForest,
  clampCanvasSize,
  collapseToManagersIds,
  computeKpis,
  escapeXml,
  expandAncestors,
  filterTree,
  initialCollapsedIds,
  isFlatTree,
  layoutTree,
  MAX_CANVAS_PIXELS,
  MAX_CANVAS_SIDE,
  prepareTree,
  searchNodes,
} from "./organogramChartLogic";

function node(
  id: number,
  opts: Partial<ManpowerOrgNode> & { children?: ManpowerOrgNode[] } = {},
): ManpowerOrgNode {
  const { children = [], ...rest } = opts;
  return {
    employee_id: id,
    employee_code: rest.employee_code ?? `E${id}`,
    name: rest.name ?? `Person ${id}`,
    department_id: rest.department_id ?? null,
    department_name: rest.department_name ?? null,
    designation_id: rest.designation_id ?? null,
    designation_title: rest.designation_title ?? null,
    depth: rest.depth ?? 0,
    suggested: rest.suggested ?? null,
    approved_quota: rest.approved_quota ?? null,
    present_standing: true,
    present_today: rest.present_today ?? true,
    children,
  };
}

describe("organogramChartLogic", () => {
  it("centres a parent over two children", () => {
    const roots = prepareTree([
      node(1, {
        depth: 0,
        children: [node(2, { depth: 1 }), node(3, { depth: 1 })],
      }),
    ]);
    const filtered = filterTree(roots, { deptId: null, presentOnly: false });
    const layout = layoutTree(filtered, new Set());
    const parent = layout.nodes.find((n) => n.id === 1)!;
    const a = layout.nodes.find((n) => n.id === 2)!;
    const b = layout.nodes.find((n) => n.id === 3)!;
    expect(layout.edges).toEqual([
      { from: 1, to: 2 },
      { from: 1, to: 3 },
    ]);
    expect(parent.x + 100).toBeCloseTo((a.x + b.x) / 2 + 100, 5);
  });

  it("hides child edges when the parent is collapsed", () => {
    const roots = filterTree(
      prepareTree([node(1, { children: [node(2, { depth: 1 })] })]),
      { deptId: null, presentOnly: false },
    );
    const layout = layoutTree(roots, new Set([1]));
    expect(layout.nodes.map((n) => n.id)).toEqual([1]);
    expect(layout.edges).toEqual([]);
  });

  it("returns empty layout for empty roots", () => {
    const layout = layoutTree([], new Set());
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it("keeps a cross-department bridge manager and hides absent childless managers when present-only", () => {
    const plant = node(1, {
      name: "Plant Head",
      department_id: 10,
      department_name: "Management",
      present_today: true,
      children: [
        node(2, {
          name: "Sewing Mgr",
          depth: 1,
          department_id: 20,
          department_name: "Sewing",
          present_today: true,
          children: [
            node(3, {
              name: "Operator",
              depth: 2,
              department_id: 20,
              department_name: "Sewing",
              present_today: true,
            }),
          ],
        }),
        node(4, {
          name: "Away Mgr",
          depth: 1,
          department_id: 30,
          department_name: "Cutting",
          present_today: false,
          children: [
            node(5, {
              name: "Away Worker",
              depth: 2,
              department_id: 30,
              present_today: false,
            }),
          ],
        }),
      ],
    });
    const prepared = prepareTree([plant]);

    const sewing = filterTree(prepared, { deptId: 20, presentOnly: false });
    expect(sewing).toHaveLength(1);
    expect(sewing[0]?.employee_id).toBe(1);
    expect(sewing[0]?.isContextBridge).toBe(true);
    expect(sewing[0]?.children[0]?.employee_id).toBe(2);
    expect(sewing[0]?.children[0]?.isContextBridge).toBe(false);

    const present = filterTree(prepared, { deptId: null, presentOnly: true });
    expect(present[0]?.children.map((c) => c.employee_id)).toEqual([2]);
    const kpis = computeKpis(present);
    expect(kpis.peopleMatching).toBe(3);
    expect(kpis.presentPct).toBe(100);

    const sewingKpis = computeKpis(sewing);
    // Plant Head is a bridge — excluded from people / managers counts.
    expect(sewingKpis.peopleMatching).toBe(2);
    expect(sewing[0]?.isContextBridge).toBe(true);
    expect(sewingKpis.managers).toBe(1);
  });

  it("focuses a subtree and expands search ancestors", () => {
    const tree = [
      node(1, {
        children: [
          node(2, {
            depth: 1,
            children: [node(3, { depth: 2, name: "Karim", employee_code: "K-1" })],
          }),
        ],
      }),
    ];

    const focused = buildVisibleForest({
      roots: tree,
      deptId: null,
      presentOnly: false,
      focusId: 2,
    });
    expect(focused.map((n) => n.employee_id)).toEqual([2]);
    expect(focused[0]?.children[0]?.employee_id).toBe(3);

    expect(searchNodes(tree, "kar")).toEqual([{ id: 3, label: "Karim (K-1)" }]);
    expect(ancestorIds(tree, 3)).toEqual([1, 2]);
    const collapsed = expandAncestors(new Set([1, 2]), tree, 3);
    expect(collapsed.has(1)).toBe(false);
    expect(collapsed.has(2)).toBe(false);
  });

  it("detects flat trees and initial collapse", () => {
    expect(isFlatTree([node(1), node(2)])).toBe(true);
    expect(isFlatTree([node(1, { children: [node(2, { depth: 1 })] })])).toBe(false);
    const deep = [
      node(1, {
        children: [node(2, { depth: 1, children: [node(3, { depth: 2 })] })],
      }),
    ];
    const collapsed = initialCollapsedIds(deep, 41);
    expect(collapsed.has(2)).toBe(true);
    expect(collapseToManagersIds(deep).has(2)).toBe(true);
  });

  it("escapes XML and clamps canvas size", () => {
    expect(escapeXml(`A&B <C> "D"`)).toBe("A&amp;B &lt;C&gt; &quot;D&quot;");
    const huge = clampCanvasSize(40000, 1000);
    expect(huge.width).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(huge.width * huge.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);

    const roots = filterTree(
      prepareTree([node(1, { name: 'A&B', children: [node(2, { depth: 1 })] })]),
      { deptId: null, presentOnly: false },
    );
    const layout = layoutTree(roots, new Set());
    const svg = buildExportSvg({
      ...layout,
      colourMode: "attendance",
      title: 'Org <test>',
    });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("A&amp;B");
    expect(svg).toContain("Org &lt;test&gt;");
    expect(svg).not.toContain("<foreignObject");
  });
});
