// @vitest-environment jsdom
/**
 * Bangladesh HR lists on the HR kit: the next step is a visible button, destructive actions stay in
 * the Actions menu, and every existing confirmation / reference prompt still runs before the API call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { role_name: "manager", feature_flags: {} } }) }));

const bd = vi.hoisted(() => ({
  gatePasses: vi.fn(),
  gateEvents: vi.fn(),
  activateGatePass: vi.fn(),
  revokeGatePass: vi.fn(),
  gatePassPdf: vi.fn(),
  bdMaternityCases: vi.fn(),
  bdApproveMaternity: vi.fn(),
  bdPayMaternity: vi.fn(),
  bdCancelMaternity: vi.fn(),
  separations: vi.fn(),
  approveSeparation: vi.fn(),
  cancelSeparation: vi.fn(),
}));
vi.mock("@/api/hrBangladesh", () => ({ hrBangladeshApi: bd, openBlob: vi.fn() }));

const api = vi.hoisted(() => ({
  listHrEmployees: vi.fn(),
  getPayrollStatutoryConfig: vi.fn(),
  updatePayrollStatutoryConfig: vi.fn(),
  previewPayrollStatutoryConfig: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { toRowActions } from "@/components/hr/bd/bdKitActions";
import { HrGatePassesPage } from "./gate/HrGatePassesPage";
import { MaternityTab } from "./bangladesh/rules/MaternityTab";
import { HrSeparationsPage } from "./separation/HrSeparationsPage";
import { PayrollStatutoryConfigPage } from "./payroll/PayrollStatutoryConfigPage";

const renderPage = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

async function rowOf(text: string, tableIndex = 0) {
  const tables = await screen.findAllByRole("table");
  const table = tables[tableIndex] as HTMLElement;
  await within(table).findByText(text);
  return within(table).getAllByRole("row").find((r) => r.textContent?.includes(text))!;
}
const visibleButtons = (row: HTMLElement) =>
  within(row)
    .getAllByRole("button")
    .map((b) => b.textContent)
    .filter((t) => t !== "Actions");

async function menuItems(row: HTMLElement) {
  await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
  return screen.getAllByRole("menuitem").map((m) => m.textContent);
}

beforeEach(() => {
  api.listHrEmployees.mockResolvedValue([{ id: 7, employee_code: "E-7", first_name: "Rina", last_name: "Akter" }]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("toRowActions", () => {
  it("drops hidden items and never shows a danger action as a button", () => {
    const out = toRowActions([
      { label: "Approve", primary: true, onClick: () => undefined },
      { label: "Hidden", primary: true, hidden: true, onClick: () => undefined },
      { label: "Delete", primary: true, danger: true, onClick: () => undefined },
    ]);
    expect(out.map((a) => a.label)).toEqual(["Approve", "Delete"]);
    expect(out.find((a) => a.label === "Delete")?.primary).toBe(false);
  });
});

describe("Gate passes", () => {
  beforeEach(() => {
    bd.gatePasses.mockResolvedValue([
      { id: 1, pass_code: "GP-1", person_name: "Visitor A", mobile: "0171", purpose: "Audit", valid_from: "2026-11-10T08:00", valid_to: "2026-11-10T17:00", status: "DRAFT", expired: false },
      { id: 2, pass_code: "GP-2", person_name: "Visitor B", mobile: "0172", purpose: "Repair", valid_from: "2026-11-10T08:00", valid_to: "2026-11-10T17:00", status: "REVOKED", expired: false },
    ]);
    bd.gateEvents.mockResolvedValue([]);
    bd.activateGatePass.mockResolvedValue({});
    bd.revokeGatePass.mockResolvedValue({});
  });

  it("shows Activate and Print for a draft pass; Revoke stays in the menu and asks for a reason", async () => {
    renderPage(<HrGatePassesPage />);
    const draft = await rowOf("GP-1");
    expect(visibleButtons(draft)).toEqual(["Activate", "Print"]);
    expect(await menuItems(draft)).toEqual(["Revoke"]);

    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Lost card");
    await userEvent.click(screen.getByRole("menuitem", { name: "Revoke" }));
    expect(prompt).toHaveBeenCalled();
    await waitFor(() => expect(bd.revokeGatePass).toHaveBeenCalledWith(1, "Lost card"));
  });

  it("a revoked pass has no actions", async () => {
    renderPage(<HrGatePassesPage />);
    const revoked = await rowOf("GP-2");
    expect(within(revoked).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("Maternity cases", () => {
  beforeEach(() => {
    bd.bdMaternityCases.mockResolvedValue([
      { id: 5, employee_id: 7, status: "APPROVED", eligible: true, daily_rate: "500", benefit_amount: "56000", leave_start: "2026-12-01", leave_end: "2027-03-22" },
      { id: 6, employee_id: 7, status: "ELIGIBLE", eligible: true, daily_rate: "480", benefit_amount: "53760", leave_start: "2027-01-01", leave_end: "2027-04-22" },
    ]);
    bd.bdPayMaternity.mockResolvedValue({});
    bd.bdApproveMaternity.mockResolvedValue({});
  });

  it("Mark paid needs the payment reference; Cancel is only in the menu", async () => {
    renderPage(<MaternityTab />);
    const approved = await rowOf("2026-12-01 to 2027-03-22");
    expect(visibleButtons(approved)).toEqual(["Mark paid"]);
    expect(await menuItems(approved)).toEqual(["Cancel"]);
    await userEvent.keyboard("{Escape}");

    const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce(null).mockReturnValueOnce("BANK-778");
    await userEvent.click(within(approved).getByRole("button", { name: "Mark paid" }));
    expect(bd.bdPayMaternity).not.toHaveBeenCalled();
    await userEvent.click(within(approved).getByRole("button", { name: "Mark paid" }));
    expect(prompt).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(bd.bdPayMaternity).toHaveBeenCalledWith(5, "BANK-778"));
  });

  it("Approve asks first; cancelling the question makes no call", async () => {
    renderPage(<MaternityTab />);
    const eligible = await rowOf("2027-01-01 to 2027-04-22");
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(within(eligible).getByRole("button", { name: "Approve" }));
    expect(bd.bdApproveMaternity).not.toHaveBeenCalled();
    await userEvent.click(within(eligible).getByRole("button", { name: "Approve" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(bd.bdApproveMaternity).toHaveBeenCalledWith(6));
  });
});

describe("Separations", () => {
  beforeEach(() => {
    bd.separations.mockResolvedValue([
      { id: 3, employee_id: 7, separation_type: "RESIGNATION", last_working_date: "2026-11-30", status: "DRAFT", settlement_status: null },
    ]);
    bd.approveSeparation.mockResolvedValue({});
    bd.cancelSeparation.mockResolvedValue({});
  });

  it("shows Open and Approve; Approve confirms; Cancel stays in the menu and confirms", async () => {
    renderPage(<HrSeparationsPage />);
    const row = await rowOf("2026-11-30");
    expect(visibleButtons(row)).toEqual(["Open", "Approve"]);

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await userEvent.click(within(row).getByRole("button", { name: "Approve" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(bd.approveSeparation).not.toHaveBeenCalled();

    expect(await menuItems(row)).toEqual(["Cancel"]);
    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));
    await waitFor(() => expect(bd.cancelSeparation).toHaveBeenCalledWith(3));
  });
});

describe("Statutory config", () => {
  const cfg = {
    id: 9,
    pf_employee_rate: "12",
    pf_employer_rate: "12",
    esi_employee_rate: "0.75",
    esi_employer_rate: "3.25",
    pf_wage_ceiling: "15000",
    esi_wage_ceiling: "21000",
    pt_state: "Dhaka",
    gratuity_days_per_year: "30",
    is_active: true,
    pt_slabs: [
      { from: 0, to: 10000, amount: 0 },
      { from: 10001, to: 20000, amount: 150 },
      { from: 20001, to: null, amount: 200 },
    ],
  };

  it("saves the same payload as before, including slab edits", async () => {
    api.getPayrollStatutoryConfig.mockResolvedValue(cfg);
    api.updatePayrollStatutoryConfig.mockResolvedValue(cfg);
    renderPage(<PayrollStatutoryConfigPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove slab 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Save config" }));
    await waitFor(() =>
      expect(api.updatePayrollStatutoryConfig).toHaveBeenCalledWith({
        pf_employee_rate: "12",
        pf_employer_rate: "12",
        esi_employee_rate: "0.75",
        esi_employer_rate: "3.25",
        pf_wage_ceiling: "15000",
        esi_wage_ceiling: "21000",
        pt_state: "Dhaka",
        gratuity_days_per_year: "30",
        is_active: true,
        pt_slabs: [
          { from: 0, to: 10000, amount: 0 },
          { from: 20001, to: null, amount: 200 },
        ],
      }),
    );
    expect(api.updatePayrollStatutoryConfig).toHaveBeenCalledTimes(1);
  });
});
