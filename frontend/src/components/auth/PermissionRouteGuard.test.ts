import { describe, expect, it } from "vitest";
import { getRbacMode } from "./rbacMode";

describe("PermissionRouteGuard.getRbacMode", () => {
  it("defaults to off when feature flags are missing", () => {
    expect(getRbacMode(undefined)).toBe("off");
    expect(getRbacMode(null)).toBe("off");
  });

  it("supports shadow and enforce modes", () => {
    expect(getRbacMode({ rbac_enforcement: "shadow" })).toBe("shadow");
    expect(getRbacMode({ rbac_enforcement: "enforce" })).toBe("enforce");
  });

  it("normalizes casing and surrounding whitespace to match the backend", () => {
    expect(getRbacMode({ rbac_enforcement: "Enforce" })).toBe("enforce");
    expect(getRbacMode({ rbac_enforcement: "ENFORCE" })).toBe("enforce");
    expect(getRbacMode({ rbac_enforcement: " shadow " })).toBe("shadow");
    expect(getRbacMode({ rbac_enforcement: "OFF" })).toBe("off");
  });

  it("falls back to off for unknown values and non-string values", () => {
    expect(getRbacMode({ rbac_enforcement: "ON" })).toBe("off");
    expect(getRbacMode({ rbac_enforcement: true })).toBe("off");
    expect(getRbacMode({ rbac_enforcement: 1 })).toBe("off");
    expect(getRbacMode({ rbac_enforcement: null })).toBe("off");
  });
});
