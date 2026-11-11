// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { clearAllSessionsForNewLogin, clearInternalSessionStorage } from "./authStorage";

describe("sign-out cleanup on shared devices", () => {
  afterEach(() => localStorage.clear());

  it("removes the token and company figures but keeps per-user scan queues and preferences", () => {
    localStorage.setItem("p7_token", "t");
    localStorage.setItem("p7_tenant_id", "1");
    localStorage.setItem("p7_inventory_kpi_snapshot", "{}");
    localStorage.setItem("p7_inventory_overview_snapshot", "{}");
    localStorage.setItem("p7_owner_cost_alerts_dismissed", "[1]");
    localStorage.setItem("p7_scan_queue:1:10", "[{}]");
    localStorage.setItem("p7_lang", "bn");

    clearInternalSessionStorage();

    for (const k of [
      "p7_token",
      "p7_tenant_id",
      "p7_inventory_kpi_snapshot",
      "p7_inventory_overview_snapshot",
      "p7_owner_cost_alerts_dismissed",
    ]) {
      expect(localStorage.getItem(k)).toBeNull();
    }
    expect(localStorage.getItem("p7_scan_queue:1:10")).toBe("[{}]");
    expect(localStorage.getItem("p7_lang")).toBe("bn");
  });

  it("a new login also drops the previous company's figures", () => {
    localStorage.setItem("p7_inventory_kpi_snapshot", "{}");
    clearAllSessionsForNewLogin();
    expect(localStorage.getItem("p7_inventory_kpi_snapshot")).toBeNull();
  });

  it("sign-out and a new sign-in close the remembered menu module", () => {
    localStorage.setItem("p7_sidebar_open_section", "Finance");
    clearInternalSessionStorage();
    expect(localStorage.getItem("p7_sidebar_open_section")).toBeNull();
    localStorage.setItem("p7_sidebar_open_section", "Finance");
    clearAllSessionsForNewLogin();
    expect(localStorage.getItem("p7_sidebar_open_section")).toBeNull();
  });
});
