import { describe, expect, it } from "vitest";
import type { LiveRatesResponse } from "@/api/client";
import { targetInQuotationCurrency } from "./targetMatch";

const NOW = new Date("2026-11-25T12:00:00Z");

function rates(over: Partial<LiveRatesResponse> = {}): LiveRatesResponse {
  return {
    base: "USD",
    rates: { USD: 1, BDT: 120, EUR: 0.9 },
    source: "open.er-api.com",
    fetched_at: "2026-11-25T10:00:00Z",
    live: true,
    ...over,
  };
}

describe("targetInQuotationCurrency", () => {
  it("needs a positive target", () => {
    const r = targetInQuotationCurrency({ targetPrice: "", targetCurrency: "USD", quotationCurrency: "USD", rates: null, now: NOW });
    expect(r.ok).toBe(false);
  });

  it("same currency needs no rate", () => {
    const r = targetInQuotationCurrency({ targetPrice: "2.5", targetCurrency: "usd", quotationCurrency: "USD", rates: null, now: NOW });
    expect(r).toEqual({ ok: true, perPiece: 2.5, rate: 1, source: "same currency" });
  });

  it("converts with a fresh live rate", () => {
    const r = targetInQuotationCurrency({ targetPrice: "240", targetCurrency: "BDT", quotationCurrency: "USD", rates: rates(), now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.perPiece).toBeCloseTo(2, 6);
  });

  it("refuses fallback (not live) rates", () => {
    const r = targetInQuotationCurrency({ targetPrice: "240", targetCurrency: "BDT", quotationCurrency: "USD", rates: rates({ live: false }), now: NOW });
    expect(r.ok).toBe(false);
  });

  it("refuses another provider", () => {
    const r = targetInQuotationCurrency({ targetPrice: "240", targetCurrency: "BDT", quotationCurrency: "USD", rates: rates({ source: "fallback" }), now: NOW });
    expect(r.ok).toBe(false);
  });

  it("refuses a rate older than 36 hours", () => {
    const r = targetInQuotationCurrency({
      targetPrice: "240",
      targetCurrency: "BDT",
      quotationCurrency: "USD",
      rates: rates({ fetched_at: "2026-11-23T11:00:00Z" }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
  });

  it("accepts the provider's own timestamp format (updated once a day)", () => {
    const r = targetInQuotationCurrency({
      targetPrice: "240",
      targetCurrency: "BDT",
      quotationCurrency: "USD",
      rates: rates({ fetched_at: "Tue, 24 Nov 2026 00:02:31 +0000" }),
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("refuses a missing currency in the rate table", () => {
    const r = targetInQuotationCurrency({ targetPrice: "10", targetCurrency: "JPY", quotationCurrency: "USD", rates: rates(), now: NOW });
    expect(r.ok).toBe(false);
  });
});
