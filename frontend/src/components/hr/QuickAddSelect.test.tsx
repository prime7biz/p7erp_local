// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createHrDepartment = vi.fn();
vi.mock("@/api/client", () => ({
  api: {
    createHrDepartment: (...a: unknown[]) => createHrDepartment(...a),
    createHrDesignation: vi.fn(),
    createHrSection: vi.fn(),
  },
}));

import { QuickAddSelect } from "./QuickAddSelect";

afterEach(() => {
  cleanup();
  createHrDepartment.mockReset();
});

function Harness({ onOuterSubmit }: { onOuterSubmit: () => void }) {
  const [options, setOptions] = useState([{ id: 1, label: "DEPT-0001 - Cutting" }]);
  const [value, setValue] = useState<number | null>(null);
  const [name, setName] = useState("Rahima (unsaved)");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onOuterSubmit();
      }}
    >
      <input aria-label="Employee name" value={name} onChange={(e) => setName(e.target.value)} />
      <QuickAddSelect
        kind="department"
        label="Department"
        emptyLabel="No department"
        value={value}
        options={options}
        onChange={setValue}
        onCreated={(r) => setOptions((p) => [...p, { id: r.id, label: `${r.code} - ${"name" in r ? r.name : ""}` }])}
      />
    </form>
  );
}

describe("QuickAddSelect", () => {
  it("creates a department from the drop-down, selects it and keeps the unsaved form", async () => {
    const user = userEvent.setup();
    const outerSubmit = vi.fn();
    createHrDepartment.mockResolvedValue({ id: 7, code: "DEPT-0002", name: "Sewing", is_active: true });
    render(<Harness onOuterSubmit={outerSubmit} />);

    await user.click(screen.getByRole("button", { name: "Add new department" }));
    expect(screen.getByRole("dialog", { name: "Add department" })).toBeTruthy();
    expect(screen.getByText("Code assigned automatically")).toBeTruthy();
    await user.type(screen.getByLabelText(/Department name/), "  Sewing ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(createHrDepartment).toHaveBeenCalledWith({ name: "Sewing", is_active: true }); // no code sent
    const select = screen.getByLabelText("Department") as HTMLSelectElement;
    expect(select.value).toBe("7");
    expect(select.selectedOptions[0]?.textContent).toBe("DEPT-0002 - Sewing");
    expect((screen.getByLabelText("Employee name") as HTMLInputElement).value).toBe("Rahima (unsaved)");
    expect(outerSubmit).not.toHaveBeenCalled(); // the modal form never submits the page form
  });

  it("refuses an empty name without calling the API", async () => {
    const user = userEvent.setup();
    render(<Harness onOuterSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add new department" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");
    expect(createHrDepartment).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the API error and keeps the dialog open", async () => {
    const user = userEvent.setup();
    createHrDepartment.mockRejectedValue(new Error("Department code or name already exists"));
    render(<Harness onOuterSubmit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add new department" }));
    await user.type(screen.getByLabelText(/Department name/), "Cutting");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("already exists");
    expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe("");
  });
});
