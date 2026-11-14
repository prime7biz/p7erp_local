// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { HrChangeRequest } from "@/api/models";

vi.mock("@/components/shell/recordBreadcrumb", () => ({ useRecordBreadcrumb: () => undefined }));
const api = vi.hoisted(() => ({
  getHrChangeRequestRights: vi.fn(),
  listHrChangeRequests: vi.fn(),
  decideHrChangeRequest: vi.fn(),
  cancelHrChangeRequest: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { HrChangeApprovalsPage } from "./HrChangeApprovalsPage";

const REQ: HrChangeRequest = {
  id: 12, employee_id: 7, employee_code: "EMP-7", employee_name: "Karim", kind: "INFO", status: "PENDING_TIER1",
  reason: "Typo in name", payload: { first_name: "Rahim" }, before: { first_name: "Karim" }, details_hidden: false,
  masked_fields: [], request_id: "chg-1234567890", requested_by: 10, requested_at: "2026-11-14T10:00:00",
  tier1_by: null, tier1_at: null, tier1_note: null, tier2_by: null, tier2_at: null, tier2_note: null,
  applied_at: null, failure_reason: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <HrChangeApprovalsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getHrChangeRequestRights.mockResolvedValue({ enabled: true, user_id: 20, can_tier1: true, can_tier2: false, can_view_pay: true });
  api.listHrChangeRequests.mockResolvedValue([REQ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HrChangeApprovalsPage", () => {
  it("lists the Tier 1 queue and approves with a before / after review", async () => {
    const user = userEvent.setup();
    api.decideHrChangeRequest.mockResolvedValue({ ...REQ, status: "PENDING_TIER2", tier1_by: 20 });
    renderPage();
    await waitFor(() => expect(api.listHrChangeRequests).toHaveBeenCalledWith({ view: "tier1", limit: 200 }));
    await user.click(await screen.findByRole("button", { name: "Review (Tier 1)" }));
    const dialog = screen.getByRole("dialog");
    const table = within(dialog).getByRole("table", { name: "Before and after" });
    expect(table.textContent).toContain("Karim");
    expect(table.textContent).toContain("Rahim");
    await user.click(within(dialog).getByRole("button", { name: "Approve (Tier 1)" }));
    expect(api.decideHrChangeRequest).toHaveBeenCalledWith(12, 1, { decision: "APPROVE", note: null });
    expect(await screen.findByText("Approved; now waiting for Tier 2.")).toBeTruthy();
  });

  it("needs a note to reject", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Review (Tier 1)" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("alert").textContent).toContain("why you reject");
    expect(api.decideHrChangeRequest).not.toHaveBeenCalled();
  });

  it("a user without tier keys sees their own requests only and no approve button", async () => {
    api.getHrChangeRequestRights.mockResolvedValue({ enabled: true, user_id: 10, can_tier1: false, can_tier2: false, can_view_pay: false });
    renderPage();
    await waitFor(() => expect(api.listHrChangeRequests).toHaveBeenCalledWith({ view: "mine", limit: 200 }));
    expect(await screen.findByRole("button", { name: "Details" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
  });
});
