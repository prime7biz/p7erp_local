import { describe, expect, it } from "vitest";
import customerDetailSource from "@/pages/app/CustomerDetailPage.tsx?raw";
import inquiriesSource from "@/pages/app/InquiriesPage.tsx?raw";
import quotationsSource from "@/pages/app/QuotationsPage.tsx?raw";
import ordersSource from "@/pages/app/OrdersPage.tsx?raw";
import financeApiSource from "@/api/finance.ts?raw";
import basicsStepSource from "@/features/inquiries/workbench/steps/BasicsStep.tsx?raw";
import inquiryDetailSource from "@/features/inquiries/workbench/InquiryWorkbenchDetail.tsx?raw";
import controlTowerSource from "@/pages/app/operations/ControlTowerPage.tsx?raw";
import externalAccessSource from "@/pages/settings/external-access/ExternalAccessPage.tsx?raw";
import externalTypesSource from "@/types/externalAccess.ts?raw";

describe("Cross-plan frontend wiring contracts", () => {
  it("Customer 360 deep-links PI and Export Case to /edit and ages by customer_id", () => {
    expect(customerDetailSource).toContain(
      "`/app/commercial/proforma-invoices/${i}/edit`",
    );
    expect(customerDetailSource).toContain("`/app/commercial/export-cases/${i}/edit`");
    expect(customerDetailSource).toContain(
      'getBillsAging({ bill_type: "RECEIVABLE", customer_id: customer.id })',
    );
    expect(financeApiSource).toContain("customer_id?: number");
    expect(financeApiSource).toContain('q.set("customer_id", String(params.customer_id))');
  });

  it("list pages seed search from ?q=", () => {
    for (const src of [inquiriesSource, quotationsSource, ordersSource]) {
      expect(src).toContain('searchParams.get("q")');
    }
  });

  it("Inquiry Workbench has Quick-add Style and Tentative Capacity CTA", () => {
    expect(basicsStepSource).toContain("+ Quick add style");
    expect(basicsStepSource).toContain("api.createStyle");
    expect(inquiryDetailSource).toContain("Book Tentative Capacity");
    expect(inquiryDetailSource).toContain(
      "`/app/control-tower?tab=tentative-demand&inquiry_id=${item.id}`",
    );
    expect(controlTowerSource).toContain('searchParams.get("inquiry_id")');
  });

  it("External Access Settings expose customer_portal_quotations_enabled", () => {
    expect(externalTypesSource).toContain("customer_portal_quotations_enabled");
    expect(externalAccessSource).toContain("customer_portal_quotations_enabled");
  });
});
