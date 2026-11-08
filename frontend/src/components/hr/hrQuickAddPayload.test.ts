import { describe, expect, it } from "vitest";
import {
  buildDepartmentQuickPayload,
  buildDesignationQuickPayload,
  buildSectionQuickPayload,
  prepareHrMasterPayload,
  validateQuickAddName,
} from "./hrQuickAddPayload";

describe("hrQuickAddPayload", () => {
  it("validates the quick-add name", () => {
    expect(validateQuickAddName("   ")).toBe("Name is required.");
    expect(validateQuickAddName("Sewing")).toBe("");
    expect(validateQuickAddName("x".repeat(129))).not.toBe("");
  });

  it("builds department / designation / section payloads without a code", () => {
    expect(buildDepartmentQuickPayload("  Finance ")).toEqual({ name: "Finance", is_active: true });
    expect(buildDesignationQuickPayload(" Manager ", 7)).toEqual({
      title: "Manager",
      department_id: 7,
      is_active: true,
    });
    expect(buildDesignationQuickPayload("Manager", undefined).department_id).toBeNull();
    expect(buildSectionQuickPayload(" Cutting ")).toEqual({
      name: "Cutting",
      section_type: "SECTION",
      is_active: true,
    });
    for (const p of [
      buildDepartmentQuickPayload("a"),
      buildDesignationQuickPayload("a", null),
      buildSectionQuickPayload("a"),
    ]) {
      expect("code" in p).toBe(false);
    }
  });

  it("drops code on create", () => {
    const out = prepareHrMasterPayload({ code: "DEP-9", name: "X" }, false);
    expect("code" in out).toBe(false);
    expect(out.name).toBe("X");
  });

  it("keeps a non-blank code on edit and drops a blank one", () => {
    expect(prepareHrMasterPayload({ code: " DEP-1 ", name: "X" }, true).code).toBe("DEP-1");
    expect("code" in prepareHrMasterPayload({ code: "  ", name: "X" }, true)).toBe(false);
  });
});
