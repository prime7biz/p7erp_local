import { describe, expect, it } from "vitest";
import { screenContextFromPath } from "./screenContext";

describe("screenContextFromPath", () => {
  it("detects record detail pages", () => {
    expect(screenContextFromPath("/app/orders/14")).toEqual({ route: "/app/orders/14", record_type: "order", record_id: 14 });
    expect(screenContextFromPath("/erp/app/customers/3/")?.record_type).toBe("customer");
    expect(screenContextFromPath("/app/accounts/vouchers/9")?.record_type).toBe("voucher");
    expect(screenContextFromPath("/app/hr/employees/21")?.record_id).toBe(21);
    expect(screenContextFromPath("/app/merchandising/styles/5")?.record_type).toBe("style");
  });

  it("ignores lists, new forms and non-numeric ids", () => {
    expect(screenContextFromPath("/app/orders")).toBeNull();
    expect(screenContextFromPath("/app/orders/new")).toBeNull();
    expect(screenContextFromPath("/app/customers/abc")).toBeNull();
    expect(screenContextFromPath("/app/orders/0")).toBeNull();
  });
});
