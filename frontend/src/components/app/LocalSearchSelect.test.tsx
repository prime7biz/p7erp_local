// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocalSearchSelect, type LocalSelectOption } from "./LocalSearchSelect";

afterEach(() => {
  cleanup();
});

const OPTIONS: LocalSelectOption[] = [
  { value: 1, label: "Junior Operator" },
  { value: 2, label: "Senior Operator" },
  { value: 3, label: "Cutting Supervisor" },
  { value: 4, label: "Quality Inspector" },
];

function Harness({
  initial = null as number | null,
  onChange,
  required = false,
}: {
  initial?: number | null;
  onChange?: (next: string | number | "") => void;
  required?: boolean;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <LocalSearchSelect
      value={value}
      options={OPTIONS}
      aria-label="Designation"
      placeholder="Search designation…"
      required={required}
      onChange={(next) => {
        const n = next === "" ? null : Number(next);
        setValue(n);
        onChange?.(next);
      }}
    />
  );
}

describe("LocalSearchSelect", () => {
  it("narrows options with a multi-character contains match", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Designation" });
    await user.click(input);
    await user.type(input, "operator");

    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("option", { name: "Junior Operator" })).toBeTruthy();
    expect(within(list).getByRole("option", { name: "Senior Operator" })).toBeTruthy();
    expect(within(list).queryByRole("option", { name: "Cutting Supervisor" })).toBeNull();
    expect(within(list).queryByRole("option", { name: "Quality Inspector" })).toBeNull();
  });

  it("narrows further as more letters are typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Designation" });
    await user.click(input);
    await user.type(input, "senior op");

    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("option", { name: "Senior Operator" })).toBeTruthy();
    expect(within(list).queryByRole("option", { name: "Junior Operator" })).toBeNull();
  });

  it("picks an option with keyboard arrows and Enter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "Designation" });
    await user.click(input);
    await user.type(input, "operator");
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(1);
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("Junior Operator");
  });

  it("clears the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={2} onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "Designation" });
    expect((input as HTMLInputElement).value).toBe("Senior Operator");
    await user.click(input);
    await user.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(onChange).toHaveBeenCalledWith("");
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });

  it("matches words in any order (multi-word search)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Designation" });
    await user.click(input);
    await user.type(input, "operator senior");

    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("option", { name: "Senior Operator" })).toBeTruthy();
    expect(within(list).queryByRole("option", { name: "Junior Operator" })).toBeNull();
  });

  it("can reach every row of a long list by scrolling and by typing", async () => {
    const user = userEvent.setup();
    const many: LocalSelectOption[] = Array.from({ length: 400 }, (_, i) => ({
      value: i + 1,
      label: `Designation ${i + 1}`,
    }));
    render(<LocalSearchSelect value={null} onChange={() => {}} options={many} aria-label="Many" />);

    const input = screen.getByRole("combobox", { name: "Many" });
    await user.click(input);
    const list = screen.getByRole("listbox");
    // First batch only, with a count line so nothing looks missing.
    expect(within(list).getAllByRole("option").length).toBe(150);
    expect(within(list).getByText(/Showing 150 of 400/)).toBeTruthy();

    // Scrolling to the bottom draws the next batch.
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
    list.scrollTop = 800;
    fireEvent.scroll(list);
    expect(within(list).getAllByRole("option").length).toBe(300);

    // Typing finds a row that was not on screen yet.
    await user.type(input, "designation 399");
    expect(within(screen.getByRole("listbox")).getByRole("option", { name: "Designation 399" })).toBeTruthy();
  });

  it("keeps moving down with the arrow key past the first batch of rows", async () => {
    const user = userEvent.setup();
    const many: LocalSelectOption[] = Array.from({ length: 400 }, (_, i) => ({
      value: i + 1,
      label: `Designation ${i + 1}`,
    }));
    render(<LocalSearchSelect value={null} onChange={() => {}} options={many} aria-label="Many" />);

    const input = screen.getByRole("combobox", { name: "Many" });
    await user.click(input);
    await user.keyboard("{ArrowDown}".repeat(152));

    expect(within(screen.getByRole("listbox")).getAllByRole("option").length).toBeGreaterThan(150);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByRole("combobox", { name: "Designation" });
    await user.click(input);
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
