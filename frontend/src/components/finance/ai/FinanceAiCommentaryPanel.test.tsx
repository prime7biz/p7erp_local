// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentaryResponse } from "@/api/financeAiInsights";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  getCommentary: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeAiInsights", async () => {
  const actual = await vi.importActual<typeof import("@/api/financeAiInsights")>("@/api/financeAiInsights");
  return { ...actual, financeAiInsightsApi: { getCommentary: h.getCommentary } };
});

import { fallbackReasonText, formatFactValue, sourceBadgeText } from "./aiCommentaryLogic";
import { FinanceAiCommentaryPanel } from "./FinanceAiCommentaryPanel";

const AI_ME = { feature_flags: { finance_ai_insights_v2: true, fiscal_year_start_month: 7 }, role_permissions: {} };

function answer(extra: Partial<CommentaryResponse> = {}): CommentaryResponse {
  return {
    report: "profit_loss",
    summary: "Gross margin fell because material cost rose.",
    findings: [{ text: "Material cost went up.", fact_ids: ["material_cost", "gross_margin_pct", "unknown_id"] }],
    source: "ai",
    deterministic_fallback: false,
    reason: null,
    facts: [
      { id: "material_cost", label: "Material cost", value: "1234567.5000", unit: "currency" },
      { id: "gross_margin_pct", label: "Gross margin", value: "12.3400", unit: "percent" },
    ],
    period: { from_date: "2026-07-01", to_date: "2026-10-31", fiscal_year: 2026, comparison: "none" },
    base_currency: "BDT",
    notes: [],
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  };
}

function renderPanel() {
  return render(<FinanceAiCommentaryPanel report="profit_loss" period={{ from_date: "2026-07-01", to_date: "2026-10-31" }} />);
}

function openAndExplain() {
  fireEvent.click(screen.getByRole("button", { name: "Explain this report" }));
  fireEvent.click(screen.getByRole("button", { name: "Explain" }));
}

beforeEach(() => {
  h.me = { ...AI_ME };
  h.getCommentary.mockReset();
});
afterEach(cleanup);

describe("FinanceAiCommentaryPanel", () => {
  it("is hidden and never calls the API when the flag is not exactly true", () => {
    for (const flags of [{}, { finance_ai_insights_v2: false }, { finance_ai_insights_v2: "true" }]) {
      h.me = { ...AI_ME, feature_flags: flags };
      const { container } = renderPanel();
      expect(container.textContent).toBe("");
      cleanup();
    }
    expect(h.getCommentary).not.toHaveBeenCalled();
  });

  it("shows the AI summary, findings with their cited facts as chips and the AI badge", async () => {
    h.getCommentary.mockResolvedValue(answer());
    renderPanel();
    openAndExplain();
    expect(await screen.findByText("Gross margin fell because material cost rose.")).toBeInTheDocument();
    expect(screen.getByTestId("ai-source-badge")).toHaveTextContent("AI");
    expect(screen.getByText("Material cost went up.")).toBeInTheDocument();
    expect(screen.getByTestId("fact-material_cost")).toHaveTextContent("Material cost: BDT 12,34,567.50");
    expect(screen.getByTestId("fact-gross_margin_pct")).toHaveTextContent("Gross margin: 12.34%");
    expect(screen.queryByTestId("fact-unknown_id")).toBeNull();
    expect(h.getCommentary).toHaveBeenCalledWith({
      report: "profit_loss",
      from_date: "2026-07-01",
      to_date: "2026-10-31",
      comparison: "none",
    });
  });

  it("shows the calculated badge and the fallback reason in plain words", async () => {
    h.getCommentary.mockResolvedValue(
      answer({ source: "deterministic", deterministic_fallback: true, reason: "provider_unavailable_or_budget_exhausted" }),
    );
    renderPanel();
    openAndExplain();
    expect(await screen.findByTestId("ai-source-badge")).toHaveTextContent("Calculated (no AI)");
    expect(screen.getByText(/AI budget is used up/)).toBeInTheDocument();
  });

  it("sends the comparison and the question", async () => {
    h.getCommentary.mockResolvedValue(answer());
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Explain this report" }));
    fireEvent.change(screen.getByLabelText(/Compare with/), { target: { value: "previous_year" } });
    fireEvent.change(screen.getByLabelText(/Question/), { target: { value: "  Why did gross margin fall?  " } });
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    await waitFor(() => expect(h.getCommentary).toHaveBeenCalledTimes(1));
    expect(h.getCommentary.mock.calls[0]![0]).toMatchObject({ comparison: "previous_year", question: "Why did gross margin fall?" });
  });

  it("never lets the question go past 300 characters", async () => {
    h.getCommentary.mockResolvedValue(answer());
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Explain this report" }));
    const input = screen.getByLabelText(/Question/) as HTMLInputElement;
    expect(input).toHaveAttribute("maxlength", "300");
    fireEvent.change(input, { target: { value: "a".repeat(350) } });
    expect(input.value).toHaveLength(300);
    expect(screen.getByTestId("ai-question-count")).toHaveTextContent("300/300");
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    await waitFor(() => expect(h.getCommentary).toHaveBeenCalledTimes(1));
    expect((h.getCommentary.mock.calls[0]![0] as { question: string }).question).toHaveLength(300);
  });

  it("shows the permission message for a 403", async () => {
    h.getCommentary.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderPanel();
    openAndExplain();
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to use finance AI");
  });

  it("hides itself after a 404 (switched off on the server)", async () => {
    h.getCommentary.mockRejectedValue(Object.assign(new Error("Not found"), { status: 404 }));
    const { container } = renderPanel();
    openAndExplain();
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});

describe("aiCommentaryLogic", () => {
  it("turns reason codes into plain words", () => {
    expect(fallbackReasonText({ source: "ai", reason: null })).toBe("");
    expect(fallbackReasonText({ source: "deterministic", reason: "provider_timeout" })).toMatch(/too long/);
    expect(fallbackReasonText({ source: "deterministic", reason: "validation_failed:unknown_number" })).toMatch(/could not be checked/);
    expect(fallbackReasonText({ source: "deterministic", reason: "something_new" })).toBe("AI was not used for this answer.");
    expect(sourceBadgeText("deterministic")).toBe("Calculated (no AI)");
  });

  it("formats fact values by unit without losing digits", () => {
    expect(formatFactValue({ value: "18138638702.6000", unit: "currency" }, "BDT")).toBe("BDT 18,13,86,38,702.60");
    expect(formatFactValue({ value: "3.0000", unit: "count" })).toBe("3");
    expect(formatFactValue({ value: "45.0000", unit: "days" })).toBe("45 days");
    expect(formatFactValue({ value: "1.5000", unit: "ratio" })).toBe("1.50");
  });
});
