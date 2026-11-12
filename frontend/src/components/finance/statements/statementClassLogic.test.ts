import { describe, expect, it } from "vitest";
import { canEditClassification, classLabel, effectiveStatementClass } from "./statementClassLogic";

describe("classLabel", () => {
  it("makes readable names", () => {
    expect(classLabel("SUNDRY_DEBTORS")).toBe("Sundry Debtors");
    expect(classLabel("BANK_OD")).toBe("Bank OD");
    expect(classLabel("COGS")).toBe("COGS");
    expect(classLabel(null)).toBe("Unclassified");
  });
});

describe("effectiveStatementClass", () => {
  const groups = [
    { id: 1, parent_group_id: null, statement_class: "CURRENT_ASSETS" },
    { id: 2, parent_group_id: 1, statement_class: null },
    { id: 3, parent_group_id: 2, statement_class: "CASH_IN_HAND" },
    { id: 4, parent_group_id: null, statement_class: null },
  ];

  it("uses the group's own class first", () => {
    expect(effectiveStatementClass(groups, 3)).toEqual({ effective: "CASH_IN_HAND", sourceId: 3, inherited: false });
  });

  it("inherits from the nearest classified parent", () => {
    expect(effectiveStatementClass(groups, 2)).toEqual({ effective: "CURRENT_ASSETS", sourceId: 1, inherited: true });
  });

  it("is Unclassified when nothing up the tree is set", () => {
    expect(effectiveStatementClass(groups, 4)).toEqual({ effective: null, sourceId: null, inherited: false });
  });

  it("survives a parent loop", () => {
    const loop = [
      { id: 1, parent_group_id: 2, statement_class: null },
      { id: 2, parent_group_id: 1, statement_class: null },
    ];
    expect(effectiveStatementClass(loop, 1).effective).toBeNull();
  });
});

describe("canEditClassification", () => {
  it("allows managers and admins only", () => {
    expect(canEditClassification("Admin")).toBe(true);
    expect(canEditClassification("manager")).toBe(true);
    expect(canEditClassification("accountant")).toBe(false);
    expect(canEditClassification(undefined)).toBe(false);
  });
});
