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
      expect.arrayContaining([
        "New order",
        "New customer",
        "New PO",
        "New challan",
        "New gate pass",
        "New voucher",
        "New employee",
      ]),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("with authority ON only shows granted modules", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: ["inventory"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).toContain("New gate pass");
    expect(labels).not.toContain("New voucher");
    expect(labels).not.toContain("New inquiry");
  });

  it("with authority ON and merch grant shows merch New shortcuts", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: ["merch"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "New inquiry",
        "New quotation",
        "New order",
        "New customer",
        "New proforma",
        "New export case",
      ]),
    );
    expect(labels).not.toContain("New gate pass");
    expect(labels).not.toContain("New voucher");
    expect(labels).not.toContain("Trade cases");
    expect(labels).not.toContain("New facility");
  });

  it("with authority ON and empty grants does not invent New inquiry", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: [],
    }).map((a) => a.label);
    expect(labels).not.toContain("New inquiry");
    expect(labels).toEqual([]);
  });

  it("with authority ON and finance-only grant does not invent New inquiry for ops roles", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: ["finance"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    // role "user" is not finance, so voucher shortcuts are also hidden → empty, not merch fallback
    expect(labels).not.toContain("New inquiry");
    expect(labels).not.toContain("New voucher");
  });

  it("with authority ON and production grant shows production New shortcuts", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: ["production"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).toEqual(expect.arrayContaining(["Cutting pipeline", "Hourly production"]));
    expect(labels).not.toContain("New inquiry");
    expect(labels).not.toContain("New gate pass");
  });

  it("with authority ON and hr grant shows New employee for HR roles", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "hr_assistant",
      authorityClassesEnabled: true,
      moduleGrants: ["hr"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).toContain("New employee");
    expect(labels).not.toContain("New inquiry");
    expect(labels).not.toContain("New voucher");
  });

  it("with authority ON and trade grant shows Trade cases", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: ["trade"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).toContain("Trade cases");
    expect(labels).not.toContain("New proforma");
    expect(labels).not.toContain("New facility");
  });

  it("with authority ON and facility grant shows New facility for finance roles", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "finance_officer",
      authorityClassesEnabled: true,
      moduleGrants: ["facility", "finance"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).toContain("New facility");
    expect(labels).toContain("New voucher");
    expect(labels).not.toContain("Trade cases");
  });

  it("with authority ON and merch-only grant hides production and HR shortcuts", () => {
    const labels = getCreateActions({
      tenantType: "both",
      roleName: "user",
      authorityClassesEnabled: true,
      moduleGrants: ["merch"],
    })
      .filter((a) => !a.paletteOnly)
      .map((a) => a.label);
    expect(labels).not.toContain("Cutting pipeline");
    expect(labels).not.toContain("Hourly production");
    expect(labels).not.toContain("New employee");
  });

  it("limits finance roles to finance actions", () => {
    expect(menuLabels("manufacturer", "finance_officer")).toEqual(["New voucher", "New facility"]);
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
