// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { GovernedExceptions, GovernedFinding } from "@/api/client";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: { ai_exception_agents_enabled: true } } }) }));

const api = vi.hoisted(() => ({
  getGovernedExceptions: vi.fn(),
  confirmGovernedException: vi.fn(),
  getOwnerBrief: vi.fn(),
  sendOwnerBrief: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));
vi.mock("@/components/app/data-grid/SavedViewsMenu", () => ({ SavedViewsMenu: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AiAgentsPage } from "./AiAgentsPage";
import { isAcknowledgeOnly } from "./agentFindings";

function finding(over: Partial<GovernedFinding>): GovernedFinding {
  return {
    agent: "tna_delay",
    agent_label: "TNA delays",
    key: "tna_action_overdue:1",
    severity: "high",
    title: "Fabric booking is late",
    detail: "Due 3 days ago",
    recommended_action: "Ask the merchandiser",
    href: null,
    order_id: null,
    suggested_action: { type: "notify", label: "Notify managers" },
    ...over,
  };
}

const TNA = finding({});
const FIN = finding({
  agent: "finance_exceptions",
  agent_label: "Finance exceptions",
  key: "finance_exception:GRN_NOT_BILLED",
  title: "GRNs not billed",
  suggested_action: { type: "acknowledge", label: "Acknowledge (hide for 7 days)" },
});

function payload(items: GovernedFinding[]): GovernedExceptions {
  return { agents: [], can_confirm: true, hidden_recently: 0, items };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AiAgentsPage />
    </MemoryRouter>,
  );
}

async function openMenuFor(title: string) {
  const cell = await screen.findByText(title);
  const row = cell.closest("tr") as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "Actions" }));
  return screen.getByRole("menu");
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.getGovernedExceptions.mockResolvedValue(payload([TNA, FIN]));
  api.confirmGovernedException.mockResolvedValue({ ok: true, decision: "DISMISSED", recipients: 0 });
  window.confirm = vi.fn(() => true);
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("isAcknowledgeOnly", () => {
  it("is true only when the server suggests acknowledge", () => {
    expect(isAcknowledgeOnly(FIN)).toBe(true);
    expect(isAcknowledgeOnly(TNA)).toBe(false);
  });
});

describe("Exception agents page", () => {
  it("offers Notify for an operations finding", async () => {
    renderPage();
    const menu = await openMenuFor("Fabric booking is late");
    expect(within(menu).getByRole("menuitem", { name: "Notify managers…" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Dismiss for 7 days" })).toBeTruthy();
    expect(screen.queryByTestId(`ack-only-${TNA.key}`)).toBeNull();
  });

  it("hides Notify for a finance finding and shows the acknowledge-only note", async () => {
    renderPage();
    expect(await screen.findByTestId(`ack-only-${FIN.key}`)).toBeTruthy();
    const menu = await openMenuFor("GRNs not billed");
    expect(within(menu).queryByRole("menuitem", { name: /Notify/ })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Dismiss for 7 days" })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Acknowledge (hide for 7 days)" })).toBeTruthy();
  });

  it("acknowledging a finance finding sends 'dismiss', never 'notify'", async () => {
    renderPage();
    const menu = await openMenuFor("GRNs not billed");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Acknowledge (hide for 7 days)" }));
    await waitFor(() =>
      expect(api.confirmGovernedException).toHaveBeenCalledWith({ key: FIN.key, decision: "dismiss", note: null }),
    );
    expect(api.confirmGovernedException).not.toHaveBeenCalledWith(expect.objectContaining({ decision: "notify" }));
  });
});
