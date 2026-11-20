// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthorityCutoverPanel } from "./AuthorityCutoverPanel";

const dryRun = vi.fn();
const apply = vi.fn();
const restore = vi.fn();
const confirmFn = vi.fn();

vi.mock("@/api/client", () => ({
  api: {
    authorityCutoverDryRun: (...args: unknown[]) => dryRun(...args),
    authorityCutoverApply: (...args: unknown[]) => apply(...args),
    authorityCutoverRestore: (...args: unknown[]) => restore(...args),
  },
}));

vi.mock("@/components/app/useConfirm", () => ({
  useConfirm: () => confirmFn,
}));

vi.mock("@/utils/logApiError", () => ({
  logApiError: vi.fn(),
}));

const proposalPayload = {
  tenant_id: 1,
  earliest_admin_user_id: 10,
  unresolved_count: 0,
  blocked: false,
  proposals: [
    {
      user_id: 10,
      username: "admin1",
      original_role_name: "admin",
      proposed_is_tenant_super_admin: true,
      proposed_module_grants: ["settings"],
      status: "PROPOSED",
      reason: "Earliest admin",
    },
  ],
};

describe("AuthorityCutoverPanel", () => {
  beforeEach(() => {
    dryRun.mockReset();
    apply.mockReset();
    restore.mockReset();
    confirmFn.mockReset();
    confirmFn.mockResolvedValue(true);
    dryRun.mockResolvedValue(proposalPayload);
    apply.mockResolvedValue({ tenant_id: 1, applied: 1, skipped: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads proposals from dry-run and applies when confirmed", async () => {
    render(<AuthorityCutoverPanel />);
    fireEvent.click(screen.getByRole("button", { name: /1\. Dry-run/i }));
    await waitFor(() => expect(dryRun).toHaveBeenCalled());
    expect(await screen.findByText(/Earliest admin/i)).toBeInTheDocument();
    expect(screen.getByText("admin1")).toBeInTheDocument();
    // Class column + help copy both mention Super Admin
    expect(screen.getAllByText(/Super Admin/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /2\. Apply/i }));
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(await screen.findByText(/Applied 1 user/i)).toBeInTheDocument();
  });
});
