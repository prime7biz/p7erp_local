// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MasterDeleteDialog } from "./MasterDeleteDialog";

afterEach(cleanup);

describe("MasterDeleteDialog", () => {
  it("shows how many records become Undefined, then deletes", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <MasterDeleteDialog
        title="Delete department"
        recordLabel="DEPT-0001 - Sewing"
        loadImpact={() => Promise.resolve([{ label: "employee(s)", count: 42 }, { label: "designation(s)", count: 0 }])}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText("42 employee(s)")).toBeTruthy();
    expect(screen.queryByText(/designation/)).toBeNull();
    expect(screen.getByText("Undefined")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open with the server message when the delete fails", async () => {
    const user = userEvent.setup();
    render(
      <MasterDeleteDialog
        title="Delete section / line"
        recordLabel="SEC-0001 - Line 1"
        loadImpact={() => Promise.resolve([])}
        onConfirm={() => Promise.reject(new Error("Only manager/admin can perform this action"))}
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Nothing uses it/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Only manager/admin can perform this action")).toBeTruthy();
  });
});
