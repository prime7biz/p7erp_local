import { describe, expect, it } from "vitest";
import { canExportHrData, resolveRole } from "./roles";

describe("resolveRole", () => {
  it("treats hr_* and payroll as HR", () => {
    expect(resolveRole("hr_assistant").isHr).toBe(true);
    expect(resolveRole("payroll").isHr).toBe(true);
    expect(resolveRole("user").isHr).toBe(false);
  });
});

describe("canExportHrData", () => {
  it("allows legacy manager role names as a string", () => {
    expect(canExportHrData("admin")).toBe(true);
    expect(canExportHrData("manager")).toBe(true);
    expect(canExportHrData("hr_assistant")).toBe(false);
    expect(canExportHrData(null)).toBe(false);
  });

  it("allows /me with a legacy manager role_name even when authority is OFF", () => {
    expect(
      canExportHrData({
        role_name: "manager",
        authority_classes_enabled: false,
        authority_class: "CLASS_4",
        module_grants: [],
      }),
    ).toBe(true);
  });

  it("denies Class 1 + hr when authority classes are OFF", () => {
    expect(
      canExportHrData({
        role_name: "user",
        authority_classes_enabled: false,
        authority_class: "CLASS_1",
        module_grants: ["hr"],
      }),
    ).toBe(false);
  });

  it("allows Class 1 + hr when authority classes are ON", () => {
    expect(
      canExportHrData({
        role_name: "user",
        authority_classes_enabled: true,
        authority_class: "CLASS_1",
        module_grants: ["hr"],
      }),
    ).toBe(true);
  });

  it("reads the feature flag on /me when authority_classes_enabled is unset", () => {
    expect(
      canExportHrData({
        role_name: "user",
        authority_class: "CLASS_1",
        module_grants: ["hr"],
        feature_flags: { user_authority_classes_v1: true },
      }),
    ).toBe(true);
  });

  it("denies Class 4 + hr and Class 1 without hr when authority is ON", () => {
    expect(
      canExportHrData({
        role_name: "user",
        authority_classes_enabled: true,
        authority_class: "CLASS_4",
        module_grants: ["hr"],
      }),
    ).toBe(false);
    expect(
      canExportHrData({
        role_name: "user",
        authority_classes_enabled: true,
        authority_class: "CLASS_1",
        module_grants: ["merch"],
      }),
    ).toBe(false);
  });

  it("allows tenant Super Admin when authority is ON", () => {
    expect(
      canExportHrData({
        role_name: "user",
        authority_classes_enabled: true,
        is_tenant_super_admin: true,
        module_grants: [],
      }),
    ).toBe(true);
  });
});
