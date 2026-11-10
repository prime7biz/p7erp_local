// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

let me: { feature_flags: Record<string, boolean>; role_name: string } = { feature_flags: {}, role_name: "manager" };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me }) }));

const mocks = vi.hoisted(() => ({
  tenant: "1",
  lookupHrEmployees: vi.fn(),
  listHrEmployees: vi.fn(),
}));
vi.mock("@/api/client", () => ({
  api: { lookupHrEmployees: mocks.lookupHrEmployees, listHrEmployees: mocks.listHrEmployees },
  getTenantId: () => mocks.tenant,
}));

import { HrSimpleCrudPage } from "@/pages/app/hr/components/HrSimpleCrudPage";
import { HrDataTable } from "./HrDataTable";
import { clearEmployeeLookupCache } from "./useEmployeeLookup";

type Item = { id: number; employee_id: number; status: string; amount: string };
type Create = { employee_id: number; leave_type_id: number; note: string };

const items: Item[] = [
  { id: 1, employee_id: 11, status: "PENDING", amount: "100" },
  { id: 2, employee_id: 12, status: "APPROVED", amount: "250.5" },
  { id: 3, employee_id: 99, status: "PENDING", amount: "-5" },
];

function renderPage(createItem = vi.fn().mockResolvedValue({})) {
  render(
    <MemoryRouter>
      <HrSimpleCrudPage<Item, Create>
        title="Things"
        description="Test page"
        emptyMessage="None"
        loadItems={() => Promise.resolve(items)}
        createItem={createItem}
        createLabel="Add thing"
        exportFileName="things"
        initialForm={{ employee_id: 0, leave_type_id: 0, note: "" }}
        fields={[
          { key: "employee_id", label: "Employee", type: "employee", required: true },
          { key: "leave_type_id", label: "Leave type", type: "select", required: true, options: [{ value: 5, label: "CL · Casual" }] },
          { key: "note", label: "Note", type: "textarea" },
        ]}
        columns={[
          { header: "Employee", cell: (r) => r.employee_id, kind: "employee" },
          { header: "Amount", cell: (r) => r.amount, kind: "money" },
          { header: "Status", cell: (r) => r.status, kind: "status" },
        ]}
        rowActions={(r) => [
          { key: "approve", label: "Approve", primary: true, onClick: () => undefined },
          { key: "delete", label: `Delete ${r.id}`, danger: true, onClick: () => undefined },
        ]}
      />
    </MemoryRouter>,
  );
  return createItem;
}

beforeEach(() => {
  me = { feature_flags: {}, role_name: "manager" };
  mocks.tenant = "1";
  clearEmployeeLookupCache();
  mocks.lookupHrEmployees.mockImplementation((ids: number[]) =>
    Promise.resolve(
      [
        { id: 11, employee_code: "EMP-11", full_name: "Rahima Akter", department_id: null, is_active: true },
        { id: 12, employee_code: "EMP-12", full_name: "Karim Mia", department_id: null, is_active: true },
      ].filter((e) => ids.includes(e.id)),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HrSimpleCrudPage on the HR kit", () => {
  it("shows employee names instead of ids, with a fallback for unknown employees", async () => {
    renderPage();
    expect((await screen.findAllByText("Rahima Akter")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("EMP-12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Employee #99").length).toBeGreaterThan(0);
    expect(mocks.lookupHrEmployees).toHaveBeenCalledTimes(1);
    expect(mocks.lookupHrEmployees).toHaveBeenCalledWith([11, 12, 99]);
  });

  it("formats money, shows status chips with counts, and filters by status", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("Rahima Akter");
    expect(screen.getAllByText("250.50").length).toBeGreaterThan(0);
    const chips = screen.getByRole("group", { name: "Filter by status" });
    await user.click(within(chips).getByRole("button", { name: /approved/i }));
    await waitFor(() => expect(screen.queryAllByText("Rahima Akter")).toHaveLength(0));
    expect(screen.getAllByText("Karim Mia").length).toBeGreaterThan(0);
  });

  it("shows up to two buttons per row and keeps Delete inside the Actions menu", async () => {
    renderPage();
    await screen.findAllByText("Rahima Akter");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("button", { name: "Approve" })).toHaveLength(3);
    expect(within(table).queryByRole("button", { name: "Delete 1" })).toBeNull();
    expect(within(table).getAllByRole("button", { name: "Actions" })).toHaveLength(3);
  });

  it("offers Export CSV to managers only", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /export csv/i })).toBeTruthy();
    cleanup();
    me = { feature_flags: {}, role_name: "hr_officer" };
    renderPage();
    await screen.findAllByText("Rahima Akter");
    expect(screen.queryByRole("button", { name: /export csv/i })).toBeNull();
  });

  it("opens the create form in a side panel and blocks saving without required pickers", async () => {
    const user = userEvent.setup();
    const createItem = renderPage();
    await screen.findAllByText("Rahima Akter");
    await user.click(screen.getAllByRole("button", { name: "+ Add thing" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add thing" });
    await user.selectOptions(within(dialog).getByLabelText(/Leave type/), "5");
    await user.click(within(dialog).getByRole("button", { name: /^(save|crud\.save)$/i }));
    expect(createItem).not.toHaveBeenCalled();
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Employee");
  });

  it("keeps focus and every typed character in the side-panel form", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("Rahima Akter");
    await user.click(screen.getAllByRole("button", { name: "+ Add thing" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add thing" });
    const note = within(dialog).getByLabelText("Note") as HTMLTextAreaElement;
    await user.click(note);
    await user.type(note, "Hello world");
    expect(note.value).toBe("Hello world");
    expect(document.activeElement).toBe(note);
  });

  it("does not open the employee search list when the panel opens", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("Rahima Akter");
    await user.click(screen.getAllByRole("button", { name: "+ Add thing" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add thing" });
    expect(document.activeElement).toBe(dialog);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("resets a status filter that no longer matches after the list reloads", async () => {
    const user = userEvent.setup();
    const cols = [{ key: "s", header: "Status", render: (r: Item) => r.status, value: (r: Item) => r.status }];
    const { rerender } = render(
      <MemoryRouter>
        <HrDataTable rows={items} rowKey={(r) => r.id} columns={cols} statusOf={(r) => r.status} />
      </MemoryRouter>,
    );
    await user.click(within(screen.getByRole("group", { name: "Filter by status" })).getByRole("button", { name: /pending/i }));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    const approvedOnly = items.map((i) => ({ ...i, status: "APPROVED" }));
    rerender(
      <MemoryRouter>
        <HrDataTable rows={approvedOnly} rowKey={(r) => r.id} columns={cols} statusOf={(r) => r.status} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("does not reuse one company's employee names for another company", async () => {
    renderPage();
    await screen.findAllByText("Rahima Akter");
    cleanup();
    mocks.tenant = "2";
    mocks.lookupHrEmployees.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Employee #11").length).toBeGreaterThan(0));
    expect(screen.queryByText("Rahima Akter")).toBeNull();
  });
});
