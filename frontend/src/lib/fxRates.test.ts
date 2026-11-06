import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/client", () => ({ api: { getLiveRates: vi.fn() } }));

import { pickExchangeRate } from "./fxRates";

describe("pickExchangeRate", () => {
  it("reads a direct rate when the base is the transaction currency", () => {
    const r = pickExchangeRate({ base: "USD", rates: { BDT: 122.5 }, source: "open.er-api.com", fetched_at: "", live: true }, "usd", "BDT");
    expect(r).toEqual({ rate: 122.5, source: "open.er-api.com", live: true });
  });

  it("computes a cross rate when the backend fell back to a USD table", () => {
    const r = pickExchangeRate({ base: "USD", rates: { EUR: 0.5, BDT: 120 }, source: "fallback", fetched_at: "", live: false }, "EUR", "BDT");
    expect(r?.rate).toBe(240);
    expect(r?.live).toBe(false);
  });

  it("rejects missing, zero, negative and non-finite rates", () => {
    const base = { base: "USD", source: "x", fetched_at: "", live: true };
    expect(pickExchangeRate({ ...base, rates: {} }, "USD", "BDT")).toBeNull();
    expect(pickExchangeRate({ ...base, rates: { BDT: 0 } }, "USD", "BDT")).toBeNull();
    expect(pickExchangeRate({ ...base, rates: { BDT: -3 } }, "USD", "BDT")).toBeNull();
    expect(pickExchangeRate({ ...base, rates: { BDT: Number.POSITIVE_INFINITY } }, "USD", "BDT")).toBeNull();
    expect(pickExchangeRate({ ...base, rates: { BDT: "120" as unknown as number } }, "USD", "BDT")).toBeNull();
    expect(pickExchangeRate(null, "USD", "BDT")).toBeNull();
  });

  it("same currency is always 1", () => {
    expect(pickExchangeRate(null, "BDT", "bdt")?.rate).toBe(1);
  });
});
