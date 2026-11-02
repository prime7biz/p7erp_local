import { describe, expect, it } from "vitest";
import { getCreateActions } from "./createActions";

const labels = (tenantType: "manufacturer" | "buying_house" | "both", roleName: string) =>
  getCreateActions({ tenantType, roleName }).map((a) => a.label);

describe("getCreateActions", () => {
  it("gives admins every create action, without duplicates", () => {
    const l = labels("both", "Admin");
    expect(l).toEqual(expect.arrayContaining(["New order", "New customer", "New PO", "New challan", "New voucher"]));
    expect(new Set(l).size).toBe(l.length);
  });

  it("limits finance roles to finance actions", () => {
    expect(labels("manufacturer", "finance_officer")).toEqual(["New voucher"]);
  });

  it("never returns an empty menu", () => {
    expect(labels("manufacturer", "hr_assistant").length).toBeGreaterThan(0);
  });
});
