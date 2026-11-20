// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  api: {
    listAdvancedVoucherTypes: vi.fn(),
    patchAdvancedVoucherType: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { VoucherTypeConfigPage } from "./VoucherTypeConfigPage";

beforeEach(() => {
  for (const fn of Object.values(h.api)) fn.mockReset();
  h.api.listAdvancedVoucherTypes.mockResolvedValue({
    rows: [
      {
        id: 1,
        code: "JOURNAL",
        name: "Journal",
        is_active: true,
        is_credit_note: false,
        is_debit_note: false,
        is_memorandum: false,
        is_optional: false,
        is_post_dated: false,
        is_stock_transfer: false,
      },
    ],
    feature_flags: {
      voucher_class_enabled: true,
      recurring_voucher_enabled: false,
      post_dated_voucher_enabled: false,
      memorandum_voucher_enabled: false,
      optional_voucher_enabled: false,
      credit_debit_note_enabled: false,
      stock_transfer_voucher_enabled: false,
    },
  });
  h.api.patchAdvancedVoucherType.mockResolvedValue({});
});

afterEach(cleanup);

describe("VoucherTypeConfigPage", () => {
  it("renders rows and patches when a checkbox is toggled", async () => {
    render(
      <MemoryRouter>
        <VoucherTypeConfigPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Journal")).toBeTruthy();
    expect(screen.getByText(/Voucher classes: On/)).toBeTruthy();

    const active = screen.getByLabelText("JOURNAL active") as HTMLInputElement;
    expect(active.checked).toBe(true);
    fireEvent.click(active);
    await waitFor(() => {
      expect(h.api.patchAdvancedVoucherType).toHaveBeenCalledWith(1, { is_active: false });
    });
  });
});
