// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AiMessageResponse } from "@/api/models";

vi.mock("@/api/client", () => ({ api: { aiSubmitFeedback: vi.fn() } }));

import { AiChatThread } from "./AiChatThread";
import { typewriterStep } from "@/pages/app/ai/hooks/useTypewriter";
import { blockedToolCount, checkedToolLabels } from "@/pages/app/ai/utils/agentToolLabels";

afterEach(cleanup);

const toolResults = [
  { tool_name: "search_sales_orders", status: "SUCCESS", summary: "Found 2 orders.", source_area: "orders", data: { items: [] } },
  { tool_name: "search_inventory_shortages", status: "SUCCESS", summary: "Found 1 item.", source_area: "inventory", data: {} },
  { tool_name: "get_financial_summary", status: "BLOCKED", summary: "Blocked", source_area: "finance", data: {} },
];

function message(id: number, content: string, contentJson: Record<string, unknown> | null): AiMessageResponse {
  return { id, session_id: 1, role: "assistant", content, content_json: contentJson, created_at: "2026-11-12T10:00:00Z" };
}

function renderThread(messages: AiMessageResponse[]) {
  return render(
    <MemoryRouter>
      <AiChatThread
        messages={messages}
        loading={false}
        approvingEscalationId={null}
        onApproveEscalation={() => {}}
        onCancelEscalation={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("AiChatThread agent answers", () => {
  it("renders safe markdown: internal links only, no images, no javascript: links", () => {
    const md = [
      "**3 orders** are late.",
      "",
      "- [Order ORD-1](/app/orders/12)",
      "- [Click me](javascript:alert(1))",
      "- [Outside](https://evil.example/phish)",
      "",
      "![pixel](https://evil.example/leak.png)",
    ].join("\n");
    const { container } = renderThread([message(1, md, { mode: "agent", tool_results: toolResults })]);

    expect(screen.getByText("3 orders").tagName).toBe("STRONG");
    const internal = screen.getByRole("link", { name: "Order ORD-1" });
    expect(internal.getAttribute("href")).toBe("/app/orders/12");
    expect(screen.queryByRole("link", { name: "Click me" })).toBeNull();
    expect(screen.getByText("Click me")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Outside" })).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
    expect(container.innerHTML).not.toContain("evil.example");
  });

  it("shows a Checked line and skips the per-tool cards", () => {
    renderThread([message(2, "Answer", { mode: "agent", tool_results: toolResults })]);

    expect(screen.getByTestId("ai-agent-checked").textContent).toBe("Checked: Orders, Stock shortages");
    expect(screen.getByText(/1 lookup was skipped/)).toBeTruthy();
    expect(screen.queryByText("Found 2 orders.")).toBeNull();
  });

  it("keeps legacy answers as plain text with their tool cards", () => {
    renderThread([message(3, "**not bold**", { tool_results: [toolResults[0]] })]);

    expect(screen.getByText("**not bold**")).toBeTruthy();
    expect(screen.queryByTestId("ai-agent-checked")).toBeNull();
  });
});

describe("agent helpers", () => {
  it("caps the typewriter duration on long replies", () => {
    expect(typewriterStep(100, 16)).toBe(1);
    expect(typewriterStep(100, 16, 2500)).toBe(1);
    // 2500ms / 16ms = 156 ticks, so 3000 characters need 20 per tick.
    expect(typewriterStep(3000, 16, 2500)).toBe(20);
  });

  it("lists unique successful tools and counts blocked ones", () => {
    const repeated = [...toolResults, toolResults[0]] as Parameters<typeof checkedToolLabels>[0];
    expect(checkedToolLabels(repeated)).toEqual(["Orders", "Stock shortages"]);
    expect(blockedToolCount(repeated)).toBe(1);
  });
});
