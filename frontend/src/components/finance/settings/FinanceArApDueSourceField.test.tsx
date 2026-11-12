// @vitest-environment jsdom
import "@/components/finance/statements/domMatchers";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceArApDueSourceField } from "./FinanceArApDueSourceField";

afterEach(cleanup);

function field() {
  return screen.getByLabelText("Bill source for amounts due") as HTMLSelectElement;
}

describe("FinanceArApDueSourceField", () => {
  it("lists 'Automatic (recommended)' and the three bill sources, with help", () => {
    render(<FinanceArApDueSourceField value={undefined} onChange={() => {}} />);
    const options = Array.from(field().options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ["", "Automatic (recommended): party ledgers when switched on, otherwise outstanding bills"],
      ["outstanding_bills", "Outstanding bills"],
      ["party_ledger", "Party ledgers"],
      ["bill_references", "Bill references"],
    ]);
    const help = document.getElementById(field().getAttribute("aria-describedby") ?? "");
    expect(help).toHaveTextContent(
      "Which bill records Ratio Analysis and the Finance Control Tower use for amounts due till today. Leave it on Automatic unless your company keeps its bills in one specific place.",
    );
    expect(field().value).toBe("");
    expect(screen.queryByText(/Not chosen/)).toBeNull();
  });

  it("shows the saved choice", () => {
    render(<FinanceArApDueSourceField value="party_ledger" onChange={() => {}} />);
    expect(field().value).toBe("party_ledger");
  });

  it("treats an unknown saved value as Automatic", () => {
    render(<FinanceArApDueSourceField value="something_old" onChange={() => {}} />);
    expect(field().value).toBe("");
  });

  it("sends the picked source", () => {
    const onChange = vi.fn();
    render(<FinanceArApDueSourceField value={undefined} onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "bill_references" } });
    expect(onChange).toHaveBeenCalledWith("bill_references");
  });

  it("sends undefined (never an empty string) for 'Automatic', so the key is removed", () => {
    const onChange = vi.fn();
    render(<FinanceArApDueSourceField value="outstanding_bills" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]).toEqual([undefined]);
  });

  it("can be read only", () => {
    render(<FinanceArApDueSourceField value="outstanding_bills" onChange={() => {}} disabled />);
    expect(field()).toBeDisabled();
  });
});
