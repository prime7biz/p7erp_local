import { describe, expect, it } from "vitest";

import { ACTION_LABEL, ACTION_TO_STATUS, ACTIONS_NEEDING_REASON, VOUCHER_STATUSES } from "./workflowMeta";

describe("voucher workflow meta", () => {
  it("keeps required statuses for list filtering", () => {
    expect(VOUCHER_STATUSES).toContain("DRAFT");
    expect(VOUCHER_STATUSES).toContain("POSTED");
    expect(VOUCHER_STATUSES).toContain("REVERSED");
  });

  it("maps workflow actions to backend statuses", () => {
    expect(ACTION_TO_STATUS.submit).toBe("SUBMITTED");
    expect(ACTION_TO_STATUS.approve).toBe("APPROVED");
    expect(ACTION_TO_STATUS.cancel).toBe("CANCELLED");
  });

  it("contains user-facing labels", () => {
    expect(ACTION_LABEL.cancel_posting).toBe("Cancel posting");
    expect(ACTION_LABEL.reverse).toBe("Reverse");
  });

  it("requires reason for destructive/rejection actions", () => {
    expect(ACTIONS_NEEDING_REASON.has("reject")).toBe(true);
    expect(ACTIONS_NEEDING_REASON.has("cancel")).toBe(true);
    expect(ACTIONS_NEEDING_REASON.has("reverse")).toBe(true);
    expect(ACTIONS_NEEDING_REASON.has("submit")).toBe(false);
  });
});
