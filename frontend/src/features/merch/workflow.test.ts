import { describe, expect, it } from "vitest";

import { isQuotationOpenForOrderLink } from "./workflow";

describe("isQuotationOpenForOrderLink", () => {
  it("allows only SENT quotations", () => {
    expect(isQuotationOpenForOrderLink({ status: "SENT", is_converted_to_order: false })).toBe(true);
    expect(isQuotationOpenForOrderLink({ status: "APPROVED", is_converted_to_order: false })).toBe(false);
    expect(isQuotationOpenForOrderLink({ status: "DRAFT", is_converted_to_order: false })).toBe(false);
  });

  it("rejects already converted quotations", () => {
    expect(isQuotationOpenForOrderLink({ status: "SENT", is_converted_to_order: true })).toBe(false);
  });
});
