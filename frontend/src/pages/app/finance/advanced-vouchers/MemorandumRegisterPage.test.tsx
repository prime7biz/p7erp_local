// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MemorandumRegisterPage } from "./MemorandumRegisterPage";

afterEach(() => cleanup());

const h = vi.hoisted(() => ({
  api: {
    listMemorandumRegister: vi.fn(async () => ({
      rows: [{ id: 6, voucher_number: "MEMO-6", voucher_date: "2026-12-01", voucher_type: "JOURNAL", description: null, status: "MEMO" }],
    })),
    convertMemorandumVoucher: vi.fn(async () => ({ id: 6, voucher_type: "JOURNAL" })),
  },
}));
vi.mock("@/api/client", async (orig) => ({ ...(await orig<typeof import("@/api/client")>()), api: h.api }));

describe("MemorandumRegisterPage", () => {
  it("converts after confirmation from the Actions menu", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <MemoryRouter>
        <MemorandumRegisterPage />
      </MemoryRouter>,
    );
    await screen.findByText("MEMO-6");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Convert" }));
    await waitFor(() => expect(h.api.convertMemorandumVoucher).toHaveBeenCalledWith(6));
  });
});
