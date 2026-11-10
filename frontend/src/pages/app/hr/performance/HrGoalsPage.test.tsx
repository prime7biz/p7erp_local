// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let me = { role_name: "manager", feature_flags: {} as Record<string, boolean> };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me }) }));

const api = vi.hoisted(() => ({
  listHrGoals: vi.fn(),
  listHrPerformanceCycles: vi.fn().mockResolvedValue([]),
  getHrEssMyProfile: vi.fn(),
  lookupHrEmployees: vi.fn().mockResolvedValue([]),
  listHrEmployees: vi.fn().mockResolvedValue([]),
  submitHrGoal: vi.fn(),
  createHrGoal: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api, getTenantId: () => "1" }));

import { HrGoalsPage } from "./HrGoalsPage";

const goal = (id: number, employee_id: number, status: string, title: string) => ({
  id,
  tenant_id: 1,
  cycle_id: 1,
  employee_id,
  title,
  description: null,
  weight: null,
  target_value: null,
  status,
  manager_comment: null,
  submitted_at: null,
  created_at: "2026-11-01",
  updated_at: "2026-11-01",
});

beforeEach(() => {
  api.getHrEssMyProfile.mockResolvedValue({ employee_id: 5 });
  api.listHrGoals.mockResolvedValue([
    goal(1, 5, "draft", "My own draft"),
    goal(2, 9, "submitted", "Their submitted"),
    goal(3, 9, "approved", "Their approved"),
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function rowFor(title: string) {
  const table = await screen.findByRole("table");
  await within(table).findByText(title);
  return within(table).getAllByRole("row").find((r) => r.textContent?.includes(title))!;
}

describe("HrGoalsPage actions follow the server rules", () => {
  it("manager: Submit on own draft, Approve on someone else's submitted goal, nothing on approved", async () => {
    render(<MemoryRouter><HrGoalsPage /></MemoryRouter>);
    expect(await within(await rowFor("My own draft")).findByRole("button", { name: "Submit" })).toBeTruthy();
    expect(within(await rowFor("Their submitted")).getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(within(await rowFor("Their approved")).queryByRole("button", { name: /submit|approve/i })).toBeNull();
  });

  it("non-manager never sees Approve on other people's goals", async () => {
    me = { role_name: "hr_officer", feature_flags: {} };
    render(<MemoryRouter><HrGoalsPage /></MemoryRouter>);
    expect(await within(await rowFor("My own draft")).findByRole("button", { name: "Submit" })).toBeTruthy();
    expect(within(await rowFor("Their submitted")).queryByRole("button", { name: "Approve" })).toBeNull();
    me = { role_name: "manager", feature_flags: {} };
  });
});
