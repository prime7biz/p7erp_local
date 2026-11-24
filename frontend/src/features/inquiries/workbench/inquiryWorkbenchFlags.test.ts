import { describe, expect, it } from "vitest";
import { isInquiryWorkbenchV1Enabled } from "./inquiryWorkbenchFlags";

describe("isInquiryWorkbenchV1Enabled", () => {
  it("is true only for explicit true", () => {
    expect(isInquiryWorkbenchV1Enabled({ inquiry_workbench_v1: true })).toBe(true);
  });

  it("is false for missing, false, or non-boolean values", () => {
    expect(isInquiryWorkbenchV1Enabled(undefined)).toBe(false);
    expect(isInquiryWorkbenchV1Enabled(null)).toBe(false);
    expect(isInquiryWorkbenchV1Enabled({})).toBe(false);
    expect(isInquiryWorkbenchV1Enabled({ inquiry_workbench_v1: false })).toBe(false);
    expect(isInquiryWorkbenchV1Enabled({ inquiry_workbench_v1: "true" })).toBe(false);
    expect(isInquiryWorkbenchV1Enabled({ inquiry_workbench_v1: 1 })).toBe(false);
  });
});
