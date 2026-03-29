import { describe, expect, it } from "vitest";
import type { VendorResponse } from "@/api/client";
import { vendorResponseToSnapshot, vendorSnapshotKeysToUpdate } from "./vendorFormShared";

describe("vendorFormShared", () => {
  it("maps vendor response to snapshot with camelCase keys", () => {
    const v = {
      id: 1,
      tenant_id: 9,
      vendor_code: "V01",
      name: "Widget Co",
      contact_person: "Pat",
      email: null,
      phone: null,
      address: null,
      is_active: true,
      ledger_id: null,
      default_currency: "USD",
      payment_terms_days: 30,
      vendor_type: "foreign",
      country: "BD",
      city: "Dhaka",
      tax_id: null,
      bank_name: null,
      bank_account_no: null,
      swift_code: null,
      credit_limit: null,
      legal_name: "Widget Co Ltd",
      website: "https://widget.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as VendorResponse;

    const snap = vendorResponseToSnapshot(v);
    expect(snap.vendorCode).toBe("V01");
    expect(snap.legalName).toBe("Widget Co Ltd");
    expect(snap.paymentTermsDays).toBe("30");
    expect(snap.isActive).toBe("true");
  });

  it("builds VendorUpdate from snapshot keys", () => {
    const u = vendorSnapshotKeysToUpdate({
      legalName: "New Legal",
      paymentTermsDays: "45",
      incoterms: "CIF",
    });
    expect(u.legal_name).toBe("New Legal");
    expect(u.payment_terms_days).toBe(45);
    expect(u.incoterms).toBe("CIF");
  });
});
