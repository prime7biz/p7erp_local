import { describe, expect, it } from "vitest";
import { getCreateActions } from "./createActions";

const menuLabels = (tenantType: "manufacturer" | "buying_house" | "both", roleName: string) =>
  getCreateActions({ tenantType, roleName })
    .filter((a) => !a.paletteOnly)
    .map((a) => a.label);

describe("getCreateActions", () => {
  it("gives admins every create action, without duplicates", () => {
    const all = getCreateActions({ tenantType: "both", roleName: "Admin" }).map((a) => a.label);
    expect(menuLabels("both", "Admin")).toEqual(
      expect.arrayContaining(["New order", "New customer", "New PO", "New challan", "New voucher"]),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("limits finance roles to finance actions", () => {
    expect(menuLabels("manufacturer", "finance_officer")).toEqual(["New voucher"]);
  });

  it("adds palette-only voucher shortcuts that open the right voucher type", () => {
    const palette = getCreateActions({ tenantType: "manufacturer", roleName: "finance_officer" }).filter((a) => a.paletteOnly);
    expect(palette.map((a) => a.href)).toEqual([
      "/app/accounts/vouchers?new=PAYMENT",
      "/app/accounts/vouchers?new=RECEIPT",
      "/app/accounts/vouchers?new=JOURNAL",
      "/app/accounts/vouchers?new=CONTRA",
    ]);
  });

  it("never returns an empty menu", () => {
    expect(menuLabels("manufacturer", "hr_assistant").length).toBeGreaterThan(0);
  });
});
