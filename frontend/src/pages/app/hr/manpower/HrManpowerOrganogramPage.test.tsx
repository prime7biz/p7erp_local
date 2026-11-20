// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ManpowerOrgNode } from "@/api/hrManpower";

const organogram = vi.fn();
const attendanceBridge = vi.fn();
const downloadPng = vi.fn();

vi.mock("@/api/hrManpower", () => ({
  hrManpowerApi: {
    organogram: (...args: unknown[]) => organogram(...args),
    attendanceBridge: (...args: unknown[]) => attendanceBridge(...args),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    me: {
      role_name: "manager",
      feature_flags: {
        hr_employee_change_approval: false,
        hr_onboarding_workspace_v2: true,
      },
    },
  }),
}));

vi.mock("./organogramExport", () => ({
  downloadOrganogramPng: (...args: unknown[]) => downloadPng(...args),
}));

vi.mock("@/components/hr/HrPageHeader", () => ({
  HrPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { HrManpowerOrganogramPage } from "./HrManpowerOrganogramPage";

function node(
  id: number,
  opts: Partial<ManpowerOrgNode> & { children?: ManpowerOrgNode[] } = {},
): ManpowerOrgNode {
  const { children = [], ...rest } = opts;
  return {
    employee_id: id,
    employee_code: rest.employee_code ?? `E${id}`,
    name: rest.name ?? `Person ${id}`,
    department_id: rest.department_id ?? 1,
    department_name: rest.department_name ?? "Sewing",
    designation_id: rest.designation_id ?? null,
    designation_title: rest.designation_title ?? "Operator",
    depth: rest.depth ?? 0,
    suggested: rest.suggested ?? null,
    approved_quota: rest.approved_quota ?? null,
    present_standing: true,
    present_today: rest.present_today ?? true,
    children,
  };
}

const tree = [
  node(1, {
    name: "Plant Head",
    employee_code: "PH-1",
    designation_title: "GM",
    children: [
      node(2, {
        depth: 1,
        name: "Line Manager",
        employee_code: "LM-1",
        designation_title: "Supervisor",
        children: [
          node(3, {
            depth: 2,
            name: "Karim Ali",
            employee_code: "K-9",
            designation_title: "Operator",
          }),
        ],
      }),
    ],
  }),
];

describe("HrManpowerOrganogramPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    organogram.mockReset();
    attendanceBridge.mockReset();
    downloadPng.mockReset();
    organogram.mockResolvedValue({
      date: "2026-11-19",
      roots: tree,
      total_roots: 1,
      nodes_returned: 3,
      truncated: false,
      max_depth: 8,
      max_nodes: 500,
      root_offset: 0,
      root_limit: 100,
    });
    attendanceBridge.mockResolvedValue({
      date: "2026-11-19",
      standing_active: 3,
      present_today: 3,
      absent_or_unmarked: 0,
      on_floor_statuses: ["PRESENT", "LATE", "HALF_DAY"],
    });
  });

  it("loads the chart with people and opens the inspector from a card", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HrManpowerOrganogramPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(organogram).toHaveBeenCalled());
    expect(organogram.mock.calls[0]?.[0]).toMatchObject({ root_limit: 100, root_offset: 0 });
    const card = await screen.findByRole("button", { name: /Plant Head/i });
    await user.click(card);
    const inspector = await screen.findByLabelText("Selected employee");
    expect(within(inspector).getByText("PH-1")).toBeTruthy();
    expect(within(inspector).getByRole("link", { name: "View profile" }).getAttribute("href")).toBe(
      "/app/hr/employees/1/profile",
    );
  });

  it("searches, focuses a team, and switches to the filtered table", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HrManpowerOrganogramPage />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /Plant Head/i });

    await user.type(screen.getByPlaceholderText("Name or code"), "Karim");
    await user.click(screen.getByRole("button", { name: "Go" }));
    const inspector = await screen.findByLabelText("Selected employee");
    expect(within(inspector).getByText("K-9")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Line Manager/i }));
    await user.click(screen.getByRole("button", { name: "Focus this team" }));
    expect(screen.getByRole("button", { name: /Back to full company/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("columnheader", { name: "Suggested" })).toBeTruthy();
    expect(screen.getByText("Line Manager")).toBeTruthy();
    expect(screen.queryByText("Plant Head")).toBeNull();
  });

  it("shows a root pagination banner when total_roots exceeds the page", async () => {
    organogram.mockResolvedValue({
      date: "2026-11-19",
      roots: [node(1, { name: "Only Root" })],
      total_roots: 150,
      nodes_returned: 1,
      truncated: false,
      max_depth: 8,
      max_nodes: 500,
    });
    render(
      <MemoryRouter>
        <HrManpowerOrganogramPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Showing top-level roots 1–1 of 150/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next roots" })).toBeTruthy();
  });

  it("downloads PNG for manager roles", async () => {
    const user = userEvent.setup();
    downloadPng.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <HrManpowerOrganogramPage />
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /Plant Head/i });
    await user.click(screen.getByRole("button", { name: "Download PNG" }));
    await waitFor(() => expect(downloadPng).toHaveBeenCalled());
  });
});
