// @vitest-environment jsdom
/**
 * More Bangladesh HR lists on the HR kit: allowances, cases, rule sets and manual IN/OUT.
 * Same contract as bdKitPages.test.tsx: next step visible, destructive actions only in the menu,
 * existing confirmations kept.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { role_name: "manager", feature_flags: {} } }) }));

const bd = vi.hoisted(() => ({
  allowanceRules: vi.fn(),
  allowanceEntries: vi.fn(),
  approveAllowanceRule: vi.fn(),
  rejectAllowance: vi.fn(),
  correctAllowance: vi.fn(),
  cases: vi.fn(),
  absenceCandidates: vi.fn(),
  caseDetail: vi.fn(),
  casePdf: vi.fn(),
  bdRuleSets: vi.fn(),
  bdRuleSet: vi.fn(),
  bdApproveRuleSet: vi.fn(),
  bdRetireRuleSet: vi.fn(),
  bdSeedOfficial: vi.fn(),
  missingOut: vi.fn(),
  manualLookup: vi.fn(),
}));
vi.mock("@/api/hrBangladesh", () => ({ hrBangladeshApi: bd, openBlob: vi.fn() }));

const api = vi.hoisted(() => ({ listHrEmployees: vi.fn(), listHrPayrollBonuses: vi.fn() }));
vi.mock("@/api/client", () => ({ api }));

import { HrAllowancesBonusesPage } from "./payroll/HrAllowancesBonusesPage";
import { HrEmployeeCasesPage } from "./cases/HrEmployeeCasesPage";
import { RuleSetsTab } from "./bangladesh/rules/RuleSetsTab";
import { HrManualAttendancePage } from "./attendance/HrManualAttendancePage";

const renderPage = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

async function rowOf(text: string) {
  await waitFor(() => expect(screen.getAllByRole("table").some((t) => t.textContent?.includes(text))).toBe(true));
  const table = screen.getAllByRole("table").find((t) => t.textContent?.includes(text)) as HTMLElement;
  return within(table).getAllByRole("row").find((r) => r.textContent?.includes(text)) as HTMLElement;
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

describe("Allowances (meal bills)", () => {
  beforeEach(() => {
    bd.allowanceRules.mockResolvedValue([
      { id: 1, code: "TIF", bill_type: "TIFFIN", eligibility_basis: "MIN_OT_MINUTES", threshold_minutes: 120, amount: "50", effective_from: "2026-11-01", status: "DRAFT" },
    ]);
    bd.allowanceEntries.mockResolvedValue([{ id: 9, work_date: "2026-11-05", employee_id: 7, rule_id: 1, amount: "50", status: "PENDING" }]);
    bd.approveAllowanceRule.mockResolvedValue({});
    bd.rejectAllowance.mockResolvedValue({});
  });

  it("bill rule Approve asks first", async () => {
    renderPage(<HrAllowancesBonusesPage />);
    const rule = await rowOf("TIF");
    expect(visibleButtons(rule)).toEqual(["Approve"]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(within(rule).getByRole("button", { name: "Approve" }));
    expect(bd.approveAllowanceRule).not.toHaveBeenCalled();
    await userEvent.click(within(rule).getByRole("button", { name: "Approve" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(bd.approveAllowanceRule).toHaveBeenCalledWith(1));
  });

  it("a pending bill shows Correct amount; Reject is only in the menu and confirms", async () => {
    renderPage(<HrAllowancesBonusesPage />);
    const bill = await rowOf("2026-11-05");
    expect(visibleButtons(bill)).toEqual(["Correct amount"]);
    expect(await menuItems(bill)).toEqual(["Reject"]);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("menuitem", { name: "Reject" }));
    await waitFor(() => expect(bd.rejectAllowance).toHaveBeenCalledWith(9));
  });

  it("offers no Export CSV on these money lists", async () => {
    renderPage(<HrAllowancesBonusesPage />);
    await rowOf("TIF");
    expect(screen.queryByRole("button", { name: /export csv/i })).toBeNull();
  });
});

describe("Notices & cases", () => {
  beforeEach(() => {
    bd.absenceCandidates.mockResolvedValue([{ employee_id: 7, employee_code: "E-7", name: "Rina", last_present: "2026-10-20", days_absent: 15 }]);
    bd.cases.mockResolvedValue([{ id: 4, case_no: "CASE-4", employee_id: 7, case_type: "SHOW_CAUSE", subject: "Late arrival", status: "ISSUED" }]);
  });

  it("absence list starts a case; case rows show Open and Print as buttons", async () => {
    renderPage(<HrEmployeeCasesPage />);
    const candidate = await rowOf("2026-10-20");
    expect(visibleButtons(candidate)).toEqual(["Start absence case"]);
    const caseRow = await rowOf("CASE-4");
    expect(visibleButtons(caseRow)).toEqual(["Open", "Print"]);
    expect(within(caseRow).queryByRole("button", { name: "Actions" })).toBeNull();

    await userEvent.click(within(candidate).getByRole("button", { name: "Start absence case" }));
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Unauthorised absence: explain and rejoin");
    expect(screen.queryByRole("button", { name: /export csv/i })).toBeNull();
  });
});

describe("Rule sets", () => {
  beforeEach(() => {
    bd.bdRuleSets.mockResolvedValue([{ id: 2, code: "BD-2023", catalog_version: "v1", effective_from: "2023-12-01", effective_to: null, status: "DRAFT" }]);
    bd.bdRetireRuleSet.mockResolvedValue({});
  });

  it("View values and Approve are visible; Retire is only in the menu and confirms", async () => {
    renderPage(<RuleSetsTab onChanged={() => undefined} />);
    const row = await rowOf("BD-2023");
    expect(visibleButtons(row)).toEqual(["View values", "Approve"]);
    expect(await menuItems(row)).toEqual(["Retire"]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("menuitem", { name: "Retire" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(bd.bdRetireRuleSet).toHaveBeenCalledWith(2));
  });
});

describe("Manual IN/OUT", () => {
  it("the missing-OUT list opens the OUT form for that employee and date", async () => {
    bd.missingOut.mockResolvedValue([{ id: 11, attendance_date: "2026-11-09", employee_code: "E-7", employee_name: "Rina", in_time: "08:01:00" }]);
    renderPage(<HrManualAttendancePage />);
    await waitFor(() => expect(screen.getAllByRole("tab").some((t) => t.textContent?.includes("(1)"))).toBe(true));
    await userEvent.click(screen.getAllByRole("tab").find((t) => t.textContent?.includes("(1)")) as HTMLElement);
    const row = await rowOf("2026-11-09");
    const buttons = within(row).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0] as HTMLElement);
    expect((document.getElementById("ma-employee") as HTMLInputElement).value).toBe("E-7");
    expect((document.getElementById("ma-date") as HTMLInputElement).value).toBe("2026-11-09");
  });
});
