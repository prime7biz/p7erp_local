import { describe, expect, it } from "vitest";

import { costDisplay, marginDisplay, revenueDisplay } from "./tradeMarginDisplay";

describe("trade margin display", () => {
  it("shows foreign revenue in base currency with the original amount and rate as detail", () => {
    const view = revenueDisplay({
      trade_case_id: 1,
      amount: 1000,
      amount_currency: "USD",
      amount_base: 120000,
      fx_rate_to_base: 120,
      margin_currency: "BDT",
    });
    expect(view.text).toBe("BDT 120,000.00");
    expect(view.detail).toBe("USD 1,000.00 @ 120");
    expect(view.title).toBe("USD 1,000.00 × 120 = BDT 120,000.00");
    expect(view.missingRate).toBe(false);
  });

  it("has no detail when revenue is already in base currency", () => {
    const view = revenueDisplay({
      trade_case_id: 1,
      amount: 500,
      currency: "BDT",
      amount_base: 500,
      fx_rate_to_base: 1,
      margin_currency: "BDT",
    });
    expect(view.text).toBe("BDT 500.00");
    expect(view.detail).toBeNull();
  });

  it("keeps the original amount and flags a missing rate instead of showing a wrong number", () => {
    const view = revenueDisplay({
      trade_case_id: 1,
      amount: 10,
      amount_currency: "EUR",
      amount_base: null,
      margin_currency: "BDT",
    });
    expect(view.text).toBe("EUR 10.00");
    expect(view.missingRate).toBe(true);
    expect(view.detail).toBe("Revenue shown in EUR: no rate to BDT");
  });

  it("shows cost and margin in base currency, and a dash when unknown", () => {
    const margin = {
      trade_case_id: 1,
      estimated_cost: 74000,
      estimated_cost_currency: "BDT",
      cost_po_count: 2,
      margin_amount: 46000,
      margin_pct: 38.3333,
      margin_currency: "BDT",
    };
    expect(costDisplay(margin).text).toBe("BDT 74,000.00");
    expect(costDisplay(margin).title).toContain("2 purchase order(s)");
    expect(marginDisplay(margin)).toMatchObject({ text: "BDT 46,000.00", detail: "38.33%" });
    expect(marginDisplay({ trade_case_id: 1, margin_amount: null }).text).toBe("—");
    expect(costDisplay(null).text).toBe("—");
    expect(revenueDisplay(undefined).text).toBe("—");
  });
});
