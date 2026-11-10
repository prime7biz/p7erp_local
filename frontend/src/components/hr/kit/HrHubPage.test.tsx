// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

let me: { feature_flags: Record<string, boolean>; role_name: string } = { feature_flags: {}, role_name: "manager" };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me, hasPermission: () => true }) }));

const mocks = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  const fns: Record<string, ReturnType<typeof vi.fn>> = {};
  const api = new Proxy(fns, {
    get: (target, prop: string) => (target[prop] ??= vi.fn().mockResolvedValue([])),
  });
  return { ApiError, fns, api };
});
vi.mock("@/api/client", () => ({ api: mocks.api, ApiError: mocks.ApiError }));

import { HrHubPage } from "./HrHubPage";
import { HrLegacyRedirect } from "./HrLegacyRedirect";
import type { HrHubId } from "./hrHubs";

// Tab pages load lazily; the first import can take over a second on a busy machine or CI runner.
const LAZY_WAIT = { timeout: 5000 };

function ShowLocation() {
  const loc = useLocation();
  return <output data-testid="location">{`${loc.pathname}${loc.search}${loc.hash}`}</output>;
}

function renderHub(hubId: HrHubId, url: string) {
  const path = new URL(url, "https://erp.test").pathname;
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={path} element={<HrHubPage hubId={hubId} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  me = { feature_flags: {}, role_name: "manager" };
  for (const key of Object.keys(mocks.fns)) delete mocks.fns[key];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HrHubPage", { timeout: 15000 }, () => {
  it("shows the hub title once, the tab bar, and the chosen tab's page without its own heading", async () => {
    renderHub("leave", "/app/hr/leave?tab=approvals");
    expect(await screen.findByText("Approve or reject pending leave requests.", {}, LAZY_WAIT)).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings.map((h) => h.textContent)).toEqual(["Leave"]);
    const approvals = screen.getByRole("link", { name: "Approvals" });
    expect(approvals.getAttribute("aria-current")).toBe("page");
    expect(approvals.getAttribute("href")).toBe("/app/hr/leave?tab=approvals");
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBeNull();
    await vi.waitFor(
      () => expect(mocks.fns.listHrLeaveRequests).toHaveBeenCalledWith({ status_filter: "PENDING" }),
      LAZY_WAIT,
    );
  });

  it("opens the first tab when the tab is missing or unknown", async () => {
    renderHub("leave", "/app/hr/leave?tab=does-not-exist");
    expect(await screen.findByText("Create and track employee leave requests.", {}, LAZY_WAIT)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
  });

  it("hides a switched-off feature tab and falls back to the first tab for its old link", async () => {
    renderHub("payroll-extras", "/app/hr/payroll-extras?tab=allowances");
    expect(screen.queryByRole("link", { name: "Allowances & bonuses" })).toBeNull();
    expect(screen.getByRole("link", { name: "Advances & loans" }).getAttribute("aria-current")).toBe("page");
    await vi.waitFor(() => expect(mocks.fns.listHrPayrollAdvances).toHaveBeenCalled(), LAZY_WAIT);
    expect(mocks.fns.listHrAllowances).toBeUndefined();
  });

  it("shows the feature tab when its flag is on", () => {
    me = { feature_flags: { hr_festival_bonus_enabled: true }, role_name: "manager" };
    renderHub("payroll-extras", "/app/hr/payroll-extras");
    expect(screen.getByRole("link", { name: "Allowances & bonuses" })).toBeTruthy();
  });

  it("My HR explains the missing employee link instead of loading self-service tabs", async () => {
    mocks.fns.getHrEssMyProfile = vi.fn().mockRejectedValue(new mocks.ApiError("Not found", 404));
    renderHub("my", "/app/hr/my?tab=payslips");
    expect(await screen.findByText("Your login is not linked to an employee record")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "My HR sections" })).toBeNull();
    expect(Object.keys(mocks.fns)).toEqual(["getHrEssMyProfile"]);
  });

  it("the not-linked state of My HR does not carry over to another hub", async () => {
    const user = userEvent.setup();
    mocks.fns.getHrEssMyProfile = vi.fn().mockRejectedValue(new mocks.ApiError("Not found", 404));
    render(
      <MemoryRouter initialEntries={["/app/hr/my"]}>
        <Link to="/app/hr/payroll">Sidebar payroll</Link>
        <Routes>
          <Route path="/app/hr/my" element={<HrHubPage hubId="my" />} />
          <Route path="/app/hr/payroll" element={<HrHubPage hubId="payroll" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Your login is not linked to an employee record")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Sidebar payroll" }));
    expect(await screen.findByRole("navigation", { name: "Payroll sections" })).toBeTruthy();
    expect(screen.queryByText("Your login is not linked to an employee record")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Payroll"]);
  });

  it("My HR shows its tabs when the login is linked", async () => {
    mocks.fns.getHrEssMyProfile = vi.fn().mockResolvedValue({ employee_code: "E-1", full_name: "Test User" });
    renderHub("my", "/app/hr/my?tab=tickets");
    expect(await screen.findByRole("navigation", { name: "My HR sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tickets" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("HrLegacyRedirect", () => {
  function renderRedirect(url: string, from: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={`/app/${from}`} element={<HrLegacyRedirect from={from} />} />
          <Route path="*" element={<ShowLocation />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("opens the hub tab and keeps the query string and #hash", () => {
    renderRedirect("/app/hr/designations?department=4#list", "hr/designations");
    expect(screen.getByTestId("location").textContent).toBe("/app/hr/setup?department=4&tab=designations#list");
  });

  it("replaces an existing tab parameter with the page's own tab", () => {
    renderRedirect("/app/hr/leave/approvals?tab=old", "hr/leave/approvals");
    expect(screen.getByTestId("location").textContent).toBe("/app/hr/leave?tab=approvals");
  });

  it("sends an unknown old path to the HR dashboard", () => {
    renderRedirect("/app/hr/not-a-page", "hr/not-a-page");
    expect(screen.getByTestId("location").textContent).toBe("/app/hr");
  });
});
