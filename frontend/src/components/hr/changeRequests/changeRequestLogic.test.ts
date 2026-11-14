import { describe, expect, it } from "vitest";
import type { HrChangeRequest } from "@/api/models";
import { decisionTier, diffRows, fieldLabel, isOpen, newChangeRequestId } from "./changeRequestLogic";

const base: HrChangeRequest = {
  id: 1, employee_id: 7, employee_code: "EMP-7", employee_name: "Karim", kind: "INFO", status: "PENDING_TIER1",
  reason: "Typo", payload: { first_name: "Rahim", national_id: null }, before: { first_name: "Karim", national_id: null },
  details_hidden: false, masked_fields: ["national_id"], request_id: "chg-1234567890", requested_by: 10,
  requested_at: null, tier1_by: null, tier1_at: null, tier1_note: null, tier2_by: null, tier2_at: null, tier2_note: null,
  applied_at: null, failure_reason: null,
};

describe("changeRequestLogic", () => {
  it("builds before / after rows and hides masked fields", () => {
    const rows = diffRows(base);
    expect(rows[0]).toMatchObject({ label: "First name", before: "Karim", after: "Rahim" });
    expect(rows[1]).toMatchObject({ hidden: true, after: "Hidden for your role" });
    expect(diffRows({ ...base, details_hidden: true, payload: null })).toEqual([]);
  });

  it("shows pay benefit switches as On / Off", () => {
    const rows = diffRows({
      ...base,
      kind: "PAY_BENEFITS",
      masked_fields: [],
      payload: { benefits: [{ benefit_code: "OVERTIME", enabled: false, amount_override: null }] },
      before: { benefits: [{ benefit_code: "OVERTIME", enabled: true, amount_override: null }] },
    });
    expect(rows).toEqual([{ field: "OVERTIME", label: "Overtime", before: "On", after: "Off", hidden: false }]);
  });

  it("follows the separation rules for the decision tier", () => {
    const me = { user_id: 20, can_tier1: true, can_tier2: true };
    expect(decisionTier(base, me)).toBe(1);
    expect(decisionTier({ ...base, requested_by: 20 }, me)).toBeNull(); // own request
    expect(decisionTier({ ...base, status: "PENDING_TIER2", tier1_by: 20 }, me)).toBeNull(); // gave Tier 1
    expect(decisionTier({ ...base, status: "PENDING_TIER2", tier1_by: 30 }, me)).toBe(2);
    expect(decisionTier({ ...base, status: "APPLIED" }, me)).toBeNull();
  });

  it("small helpers", () => {
    expect(isOpen(base)).toBe(true);
    expect(isOpen({ status: "REJECTED" })).toBe(false);
    expect(fieldLabel("bank_account_number")).toBe("Bank account number");
    expect(newChangeRequestId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
