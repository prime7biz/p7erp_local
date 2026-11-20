// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthorityInboxPanel } from "./AuthorityInboxPanel";

const getAuthorityInbox = vi.fn();

vi.mock("@/api/client", () => ({
  api: {
    getAuthorityInbox: (...args: unknown[]) => getAuthorityInbox(...args),
    listAuthorityChangeRequests: vi.fn(),
    decideAuthorityChangeRequest: vi.fn(),
    updateVoucherStatus: vi.fn(),
    class1ApproveVoucher: vi.fn(),
    class1RejectVoucher: vi.fn(),
  },
}));

let meFlags: Record<string, unknown> = {};
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    me: {
      authority_class: "CLASS_1",
      authority_classes_enabled: meFlags.user_authority_classes_v1 === true,
      feature_flags: meFlags,
    },
  }),
}));

vi.mock("@/hooks/useMobileUiV2", () => ({
  useMobileUiV2Phone: () => false,
}));

afterEach(() => {
  cleanup();
  getAuthorityInbox.mockReset();
  meFlags = {};
});

describe("AuthorityInboxPanel", () => {
  it("renders nothing when user_authority_classes_v1 is off", () => {
    meFlags = {};
    const { container } = render(
      <MemoryRouter>
        <AuthorityInboxPanel variant="dashboard" />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe("");
    expect(getAuthorityInbox).not.toHaveBeenCalled();
  });

  it("loads inbox and shows Approvals when the flag is on", async () => {
    meFlags = { user_authority_classes_v1: true };
    getAuthorityInbox.mockResolvedValue({
      authority_classes_enabled: true,
      authority_class: "CLASS_1",
      counts: { verify: 1, recommend: 0, approve: 0, class1_pending: 2, change_requests: 0 },
      waiting_for_me: [
        {
          kind: "voucher_class1",
          id: 9,
          number: "JV-9",
          date: "2026-11-19",
          status: "PENDING_CLASS1",
          href: "/app/accounts/vouchers/9",
          actions: ["class1_approve"],
        },
      ],
      my_requests: [],
    });
    render(
      <MemoryRouter>
        <AuthorityInboxPanel variant="dashboard" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getAuthorityInbox).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Approvals" })).toBeTruthy();
    expect(screen.getByText("JV-9 · PENDING_CLASS1")).toBeTruthy();
  });
});
