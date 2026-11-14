// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExtraDetailsPanel } from "./ExtraDetailsPanel";
import type { ExtraExtractedField } from "@/types/extraction";

const OPTIONS = [
  { key: "style_ref", label: "Style ref" },
  { key: "season", label: "Season" },
  { key: "quantity", label: "Quantity" },
  { key: "notes", label: "Notes" },
];

const EXTRAS: ExtraExtractedField[] = [
  { label: "Article Code", value: "ART-1", suggested_field: "style_ref", confidence: 0.6 },
  { label: "Material", value: "100% Cotton", suggested_field: "notes", confidence: 0.6 },
  { label: "Fax", value: "+880 2 555", suggested_field: null, confidence: 0.5 },
  { label: "Order Qty", value: "about fifty", suggested_field: "quantity", confidence: 0.5 },
];

afterEach(() => cleanup());

describe("ExtraDetailsPanel", () => {
  it("preselects the suggested field and defaults to Don't use otherwise", () => {
    render(<ExtraDetailsPanel extras={EXTRAS} options={OPTIONS} onApply={() => {}} />);
    expect((screen.getByLabelText("Put Article Code into") as HTMLSelectElement).value).toBe("style_ref");
    expect((screen.getByLabelText("Put Fax into") as HTMLSelectElement).value).toBe("");
    expect(screen.getByText("Apply all suggested (3)")).toBeTruthy();
  });

  it("lets the user change the target before applying", async () => {
    const onApply = vi.fn();
    render(<ExtraDetailsPanel extras={EXTRAS} options={OPTIONS} onApply={onApply} />);
    await userEvent.selectOptions(screen.getByLabelText("Put Article Code into"), "season");
    const row = screen.getByTestId("extra-row-extra-0");
    await userEvent.click(row.querySelector("button")!);
    expect(onApply).toHaveBeenCalledWith("season", "ART-1", { label: "Article Code", value: "ART-1" });
    expect(screen.getByText("Added to Season")).toBeTruthy();
  });

  it("dismisses a row and can restore it", async () => {
    render(<ExtraDetailsPanel extras={EXTRAS} options={OPTIONS} onApply={() => {}} />);
    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    await userEvent.click(dismissButtons[2]!);
    expect(screen.getByText("Not used")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(screen.queryByText("Not used")).toBeNull();
  });

  it("Apply all applies suggested rows and explains values that do not fit", async () => {
    const onApply = vi.fn();
    render(<ExtraDetailsPanel extras={EXTRAS} options={OPTIONS} onApply={onApply} />);
    await userEvent.click(screen.getByText("Apply all suggested (3)"));
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenCalledWith("style_ref", "ART-1", expect.anything());
    expect(onApply).toHaveBeenCalledWith("notes", "100% Cotton", { label: "Material", value: "100% Cotton" });
    expect(screen.getByText(/Doesn't fit Quantity: Needs a whole number/)).toBeTruthy();
  });

  it("rebuilds the rows for a new extraction", () => {
    const { rerender } = render(<ExtraDetailsPanel extras={EXTRAS} options={OPTIONS} onApply={() => {}} />);
    rerender(
      <ExtraDetailsPanel
        extras={[{ label: "Season", value: "SS27", suggested_field: "season", confidence: 0.6 }]}
        options={OPTIONS}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByText("Article Code")).toBeNull();
    expect((screen.getByLabelText("Put Season into") as HTMLSelectElement).value).toBe("season");
  });

  it("renders nothing without extras", () => {
    const { container } = render(<ExtraDetailsPanel extras={[]} options={OPTIONS} onApply={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
