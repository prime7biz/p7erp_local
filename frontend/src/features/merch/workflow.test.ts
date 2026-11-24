import { describe, expect, it } from "vitest";

import {
  canCancelInquiry,
  canEditInquiry,
  canMarkInquiryLost,
  isInquiryTerminal,
  isQuotationOpenForOrderLink,
} from "./workflow";

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

describe("inquiry workbench workflow helpers", () => {
  it("treats converted / lost / cancelled as terminal", () => {
    expect(isInquiryTerminal("CONVERTED")).toBe(true);
    expect(isInquiryTerminal("LOST")).toBe(true);
    expect(isInquiryTerminal("CANCELLED")).toBe(true);
    expect(isInquiryTerminal("DRAFT")).toBe(false);
    expect(isInquiryTerminal("SUBMITTED")).toBe(false);
  });

  it("allows edit only when not terminal", () => {
    expect(canEditInquiry("DRAFT")).toBe(true);
    expect(canEditInquiry("SUBMITTED")).toBe(true);
    expect(canEditInquiry("LOST")).toBe(false);
  });

  it("marks lost only from SUBMITTED", () => {
    expect(canMarkInquiryLost("SUBMITTED")).toBe(true);
    expect(canMarkInquiryLost("DRAFT")).toBe(false);
  });

  it("cancels from DRAFT or SUBMITTED", () => {
    expect(canCancelInquiry("DRAFT")).toBe(true);
    expect(canCancelInquiry("SUBMITTED")).toBe(true);
    expect(canCancelInquiry("CONVERTED")).toBe(false);
  });
});
