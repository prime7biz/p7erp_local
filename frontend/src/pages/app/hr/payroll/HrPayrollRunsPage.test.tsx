// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let me = { role_name: "manager", feature_flags: {} as Record<string, boolean> };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me }) }));
const saveBlob = vi.hoisted(() => vi.fn().mockResolvedValue("downloaded"));
vi.mock("@/lib/fileSave", () => ({ saveBlob }));

const api = vi.hoisted(() => ({
  listHrPayrollRuns: vi.fn(),
  listHrPayrollPeriods: vi.fn(),
  finalizeHrPayrollRun: vi.fn(),
  approveHrPayrollRun: vi.fn(),
  postHrPayrollRun: vi.fn(),
  generateHrPayrollPayslips: vi.fn(),
  downloadHrPayrollRunBankFile: vi.fn(),
  previewHrPayrollAutoCalculate: vi.fn(),
  createHrPayrollRun: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { HrPayrollRunsPage } from "./HrPayrollRunsPage";
import { isPayrollRunActionEnabled, payrollRunRowActions } from "./payrollRunActions";
import { isAnyFormDirty } from "@/lib/unsavedChanges";

const run = (id: number, status: string, period_id = 1) => ({
  id,
  period_id,
  run_code: `RUN-${id}`,
  run_date: "2026-10-31",
  status,
  gross_total: "10000.0000",
  deduction_total: "500.0000",
  net_total: "9500.0000",
  finalized_by: null,
  finalized_at: null,
  created_by: null,
  created_at: "2026-10-31",
  updated_at: "2026-10-31",
});
const period = (id: number, code: string, is_locked: boolean) => ({
  id,
  period_code: code,
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  payment_date: "2026-11-05",
  status: is_locked ? "FINALIZED" : "OPEN",
  is_locked,
  finalized_by: null,
  finalized_at: null,
  created_at: "",
  updated_at: "",
});

beforeEach(() => {
  me = { role_name: "manager", feature_flags: {} };
  api.listHrPayrollPeriods.mockResolvedValue([period(1, "2026-10", true), period(2, "2026-11", false)]);
  api.listHrPayrollRuns.mockResolvedValue([run(11, "DRAFT", 2), run(12, "APPROVED"), run(13, "POSTED"), run(14, "CANCELLED")]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function rowOf(code: string) {
  const table = await screen.findByRole("table");
  await within(table).findByText(code);
  return within(table).getAllByRole("row").find((r) => r.textContent?.includes(code))!;
}
const visibleButtons = (row: HTMLElement) =>
  within(row)
    .getAllByRole("button")
    .map((b) => b.textContent)
    .filter((t) => t !== "Actions");

describe("payrollRunRowActions (pure)", () => {
  it("keeps today's enable rules for every action", () => {
    expect(isPayrollRunActionEnabled("finalize", "DRAFT")).toBe(true);
    expect(isPayrollRunActionEnabled("finalize", "FINALIZED")).toBe(false);
    expect(isPayrollRunActionEnabled("approve", "CHECKED")).toBe(true);
    expect(isPayrollRunActionEnabled("post", "FINALIZED")).toBe(false);
    expect(isPayrollRunActionEnabled("post", "POSTED")).toBe(true);
  });

  it("offers the bank file only after approval (server rule)", () => {
    for (const s of ["DRAFT", "CHECKED", "FINALIZED", "REJECTED", "CANCELLED"]) {
      expect(isPayrollRunActionEnabled("bank", s)).toBe(false);
    }
    expect(isPayrollRunActionEnabled("bank", "APPROVED")).toBe(true);
    expect(isPayrollRunActionEnabled("bank", "POSTED")).toBe(true);
    const finalized = payrollRunRowActions("FINALIZED", () => undefined, false);
    expect(finalized.find((a) => a.key === "bank")?.disabled).toBe(true);
  });

  it("shows the next steps for each status and nothing visible for unknown / cancelled runs", () => {
    const vis = (s: string) => payrollRunRowActions(s, () => undefined, false).filter((a) => a.primary).map((a) => a.key);
    expect(vis("DRAFT")).toEqual(["autocalc", "finalize"]);
    expect(vis("CHECKED")).toEqual(["finalize", "approve"]);
    expect(vis("FINALIZED")).toEqual(["approve"]);
    expect(vis("APPROVED")).toEqual(["post", "payslips"]);
    expect(vis("POSTED")).toEqual(["payslips", "bank"]);
    expect(vis("CANCELLED")).toEqual([]);
    const all = payrollRunRowActions("CANCELLED", () => undefined, false);
    expect(all).toHaveLength(6);
    expect(all.filter((a) => !a.disabled).map((a) => a.key)).toEqual([]);
  });

  it("disables everything while an action is running", () => {
    expect(payrollRunRowActions("DRAFT", () => undefined, true).every((a) => a.disabled)).toBe(true);
  });
});

describe("HrPayrollRunsPage runs table", () => {
  it("shows the period code even for locked periods, but the create form offers only open periods", async () => {
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    expect((await rowOf("RUN-12")).textContent).toContain("2026-10");
    expect((await rowOf("RUN-11")).textContent).toContain("2026-11");
    const select = screen.getByLabelText(/Payroll period/) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(options.some((o) => o.startsWith("2026-11"))).toBe(true);
    expect(options.some((o) => o.startsWith("2026-10"))).toBe(false);
  });

  it("shows the next steps as buttons per status, none for a cancelled run", async () => {
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    expect(visibleButtons(await rowOf("RUN-11"))).toEqual(["Auto-calculate", "Finalize"]);
    expect(visibleButtons(await rowOf("RUN-12"))).toEqual(["Post GL", "Payslips"]);
    expect(visibleButtons(await rowOf("RUN-13"))).toEqual(["Payslips", "Bank CSV"]);
    expect(visibleButtons(await rowOf("RUN-14"))).toEqual([]);
  });

  it("Post GL asks first; cancel makes no call; OK posts once and shows the voucher", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    let release: (v: unknown) => void = () => undefined;
    api.postHrPayrollRun.mockImplementation(() => new Promise((r) => (release = r)));
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    const postBtn = within(await rowOf("RUN-12")).getByRole("button", { name: "Post GL" });
    await user.click(postBtn);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Post payroll run RUN-12 to the general ledger"));
    expect(api.postHrPayrollRun).not.toHaveBeenCalled();
    await user.click(postBtn);
    await user.click(postBtn);
    expect(api.postHrPayrollRun).toHaveBeenCalledTimes(1);
    release({ voucher_id: 501 });
    expect(await screen.findByText(/voucher 501/)).toBeTruthy();
  });

  it("asks a different question for an already posted run", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    await user.click(within(await rowOf("RUN-13")).getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Post GL" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("already posted"));
    expect(api.postHrPayrollRun).not.toHaveBeenCalled();
  });

  it("Finalize asks first and an error releases the busy lock", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    api.finalizeHrPayrollRun.mockRejectedValueOnce(new Error("Missing OUT punches")).mockResolvedValue({});
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    const finalize = within(await rowOf("RUN-11")).getByRole("button", { name: "Finalize" });
    await user.click(finalize);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.finalizeHrPayrollRun).not.toHaveBeenCalled();
    await user.click(finalize);
    expect(await screen.findByText("Missing OUT punches")).toBeTruthy();
    await user.click(within(await rowOf("RUN-11")).getByRole("button", { name: "Finalize" }));
    await waitFor(() => expect(api.finalizeHrPayrollRun).toHaveBeenCalledTimes(2));
  });

  it("Bank CSV downloads, Auto-calculate opens the preview", async () => {
    const user = userEvent.setup();
    api.downloadHrPayrollRunBankFile.mockResolvedValue(new Blob(["a,b"]));
    api.previewHrPayrollAutoCalculate.mockResolvedValue({ run_id: 11, employees: [], warnings: [] });
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    await user.click(within(await rowOf("RUN-13")).getByRole("button", { name: "Bank CSV" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "payroll-run-13-bank.csv"));
    await user.click(within(await rowOf("RUN-11")).getByRole("button", { name: "Auto-calculate" }));
    expect(api.previewHrPayrollAutoCalculate).toHaveBeenCalledWith(11);
    expect(await screen.findByText(/Auto-calculate preview/)).toBeTruthy();
  });

  it("shows the server's message when the bank file is refused", async () => {
    const user = userEvent.setup();
    api.downloadHrPayrollRunBankFile.mockRejectedValue(new Error("The bank file is available after the run is approved"));
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    await user.click(within(await rowOf("RUN-13")).getByRole("button", { name: "Bank CSV" }));
    expect(await screen.findByText("The bank file is available after the run is approved")).toBeTruthy();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("warns about an unsaved new run only after the user types, and not after it is created", async () => {
    const user = userEvent.setup();
    api.createHrPayrollRun.mockResolvedValue(run(15, "DRAFT", 2));
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    await rowOf("RUN-11");
    expect(isAnyFormDirty()).toBe(false);
    await user.selectOptions(screen.getByLabelText(/Payroll period/), "2");
    await user.type(screen.getByLabelText(/Run code/), "NOV-A");
    expect(isAnyFormDirty()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Create run" }));
    expect(await screen.findByText("Payroll run created.")).toBeTruthy();
    expect(api.createHrPayrollRun).toHaveBeenCalledTimes(1);
    expect(isAnyFormDirty()).toBe(false);
  });

  it("offers Export CSV to managers only", async () => {
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /export csv/i })).toBeTruthy();
    cleanup();
    me = { role_name: "hr_officer", feature_flags: {} };
    render(<MemoryRouter><HrPayrollRunsPage /></MemoryRouter>);
    await rowOf("RUN-11");
    expect(screen.queryByRole("button", { name: /export csv/i })).toBeNull();
  });
});
