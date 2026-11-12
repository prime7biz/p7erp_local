// @vitest-environment jsdom
import "./domMatchers";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEMBER_ME } from "./statementTestFixtures";

const h = vi.hoisted(() => ({
  me: {} as Record<string, unknown>,
  exportStatement: vi.fn(),
  saveBlob: vi.fn(),
  printCurrentPage: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: h.me }) }));
vi.mock("@/api/financeStatements", () => ({ financeStatementsApi: { exportStatement: h.exportStatement } }));
vi.mock("@/lib/fileSave", () => ({ saveBlob: h.saveBlob }));
vi.mock("@/lib/reportExport", () => ({ printCurrentPage: h.printCurrentPage }));

import { StatementExportBar } from "./StatementExportBar";

function renderBar() {
  return render(<StatementExportBar report="trial-balance" query={{ fiscal_year: 2026 }} fileBase="trial-balance-2026-27" />);
}

beforeEach(() => {
  h.me = { ...MEMBER_ME };
  h.exportStatement.mockReset();
  h.saveBlob.mockReset();
  h.printCurrentPage.mockReset();
});
afterEach(cleanup);

describe("StatementExportBar", () => {
  it("downloads Excel through saveBlob with the report, format and period", async () => {
    const blob = new Blob(["x"]);
    h.exportStatement.mockResolvedValue(blob);
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => expect(h.saveBlob).toHaveBeenCalledWith(blob, "trial-balance-2026-27.xlsx"));
    expect(h.exportStatement).toHaveBeenCalledWith("trial-balance", "xlsx", { fiscal_year: 2026 });
  });

  it("downloads PDF through saveBlob", async () => {
    const blob = new Blob(["p"]);
    h.exportStatement.mockResolvedValue(blob);
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(h.saveBlob).toHaveBeenCalledWith(blob, "trial-balance-2026-27.pdf"));
    expect(h.exportStatement).toHaveBeenCalledWith("trial-balance", "pdf", { fiscal_year: 2026 });
  });

  it("disables both buttons with a tooltip when the export permission is explicitly denied", () => {
    h.me = { ...MEMBER_ME, role_permissions: { "finance.mis_report.export": false } };
    renderBar();
    for (const name of ["Excel", "PDF"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "You do not have permission to export statements.");
    }
    expect(screen.getByRole("button", { name: "Print" })).toBeEnabled();
    expect(h.exportStatement).not.toHaveBeenCalled();
  });

  it("switches the export buttons off after a 403 from the server", async () => {
    h.exportStatement.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Excel" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "PDF" })).toBeDisabled();
    expect(h.saveBlob).not.toHaveBeenCalled();
  });

  it("shows other export failures without switching the buttons off", async () => {
    h.exportStatement.mockRejectedValue(new Error("Export failed"));
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Export failed");
    expect(screen.getByRole("button", { name: "PDF" })).toBeEnabled();
  });

  it("prints the page", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(h.printCurrentPage).toHaveBeenCalledTimes(1);
  });
});
