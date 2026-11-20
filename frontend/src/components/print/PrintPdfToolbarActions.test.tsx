// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrintPdfToolbarActions } from "./PrintPdfToolbarActions";

vi.mock("@/hooks/useMobileUiV2", () => ({
  useMobileUiV2Phone: () => false,
}));

vi.mock("@/hooks/useInventoryListView", () => ({
  useMediaQuery: (query: string) => query.includes("767") || query.includes("768"),
}));

vi.mock("@/lib/fileSave", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fileSave")>("@/lib/fileSave");
  return {
    ...actual,
    preferShareOverPrint: () => true,
    shareOrSaveBlob: vi.fn(async () => ({ method: "download" as const })),
  };
});

vi.mock("@/utils/logApiError", () => ({
  logApiError: vi.fn(),
}));

describe("PrintPdfToolbarActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("on phone layout shows Save PDF and Share and downloads the blob", async () => {
    const { shareOrSaveBlob } = await import("@/lib/fileSave");
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const downloadPdf = vi.fn(async () => blob);

    render(
      <PrintPdfToolbarActions
        downloadPdf={downloadPdf}
        filename="demo.pdf"
        logKey="PrintPdfToolbarActions.test"
      />,
    );

    expect(screen.getByRole("button", { name: "Save PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Print / Save PDF" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save PDF" }));
    await waitFor(() => expect(downloadPdf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(shareOrSaveBlob).toHaveBeenCalledWith(blob, "demo.pdf"));
  });
});
