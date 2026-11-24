// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  me: {
    id: 1,
    role_name: "admin",
    is_tenant_super_admin: true,
  },
  api: {
    settingsListUsers: vi.fn(),
    settingsListAuditLogs: vi.fn(),
    settingsListMyActivity: vi.fn(),
    settingsListUserSessions: vi.fn(),
    settingsListMySessions: vi.fn(),
    settingsSignOutOtherSessions: vi.fn(),
  },
  setAuth: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ me: h.me }),
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api, setAuth: h.setAuth };
});

vi.mock("@/components/app/AppPageHeader", () => ({
  AppPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { AuditPage } from "./AuditPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.setAuth.mockReset();
  h.api.settingsListUsers.mockResolvedValue([]);
  h.api.settingsListAuditLogs.mockResolvedValue({
    items: [
      {
        id: 11,
        tenant_id: 1,
        user_id: 7,
        username: "ada",
        full_name: "Ada Admin",
        action: "LOGIN",
        resource: "auth",
        details: "Staff login [impersonated_by_platform_admin=99]",
        ip_address: "10.0.0.8",
        location: "Private network",
        created_at: "2026-11-22T10:00:00Z",
      },
    ],
    total: 1,
    limit: 25,
    offset: 0,
  });
  h.api.settingsListMyActivity.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
  h.api.settingsListUserSessions.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
  h.api.settingsListMySessions.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
});

afterEach(cleanup);

describe("AuditPage (User Activity)", () => {
  it("shows activity rows with user, via Support badge, IP and location", async () => {
    render(<AuditPage />);
    expect(await screen.findByRole("heading", { name: /user activity/i })).toBeTruthy();
    await waitFor(() => expect(h.api.settingsListAuditLogs).toHaveBeenCalled());
    expect(await screen.findByText(/Ada Admin/)).toBeTruthy();
    expect(screen.getByText("via Support")).toBeTruthy();
    expect(screen.getByText("10.0.0.8")).toBeTruthy();
    expect(screen.getByText("Private network")).toBeTruthy();
    expect(screen.getByText("Signed in")).toBeTruthy();
  });
});
