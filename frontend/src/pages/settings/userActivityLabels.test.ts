import { describe, expect, it } from "vitest";
import { actionLabel, displayUserName, parseImpersonation } from "./userActivityLabels";

describe("userActivityLabels", () => {
  it("maps known actions to plain English", () => {
    expect(actionLabel("LOGIN_FAILED")).toBe("Wrong password attempt");
    expect(actionLabel("LOGIN")).toBe("Signed in");
    expect(actionLabel("PROFORMA_CREATED")).toBe("Proforma invoice created");
    expect(actionLabel("BTB_LC_CREATED")).toBe("BTB LC created");
    expect(actionLabel("INQUIRY_CREATED")).toBe("Inquiry created");
    expect(actionLabel("QUOTATION_CREATED")).toBe("Quotation created");
    expect(actionLabel("BOM_APPROVED")).toBe("BOM approved");
    expect(actionLabel("BOM_FROZEN")).toBe("BOM frozen");
    expect(actionLabel("purchase_order.created")).toBe("Purchase order created");
    expect(actionLabel("goods_receiving.received")).toBe("GRN received into stock");
    expect(actionLabel("warehouse_transfer.created")).toBe("Warehouse transfer created");
    expect(actionLabel("warehouse_transfer.posted")).toBe("Warehouse transfer posted");
    expect(actionLabel("stock_adjustment.created")).toBe("Stock adjustment created");
    expect(actionLabel("stock_adjustment.posted")).toBe("Stock adjustment posted");
    expect(actionLabel("delivery_challan.created")).toBe("Delivery challan created");
    expect(actionLabel("delivery_challan.posted")).toBe("Delivery challan posted");
    expect(actionLabel("gate_pass.created")).toBe("Gate pass created");
    expect(actionLabel("gate_pass.released")).toBe("Gate pass released");
    expect(actionLabel("production_material_issue.posted")).toBe("Production material issue posted");
    expect(actionLabel("process_order.created")).toBe("Process order created");
    expect(actionLabel("process_order.issued")).toBe("Process order issued");
    expect(actionLabel("process_order.received")).toBe("Process order received");
  });

  it("parses impersonation tags and cleans details", () => {
    const parsed = parseImpersonation("Updated user [impersonated_by_platform_admin=42]");
    expect(parsed.isImpersonated).toBe(true);
    expect(parsed.adminId).toBe(42);
    expect(parsed.cleanDetails).toBe("Updated user");
  });

  it("formats user display names", () => {
    expect(displayUserName({ full_name: "Ada Admin", username: "ada", user_id: 1 })).toBe(
      "Ada Admin (@ada)",
    );
    expect(displayUserName({ full_name: null, username: null, user_id: 9 })).toBe("User #9");
  });
});
