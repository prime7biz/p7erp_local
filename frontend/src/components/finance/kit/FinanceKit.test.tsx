// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceFormDrawer } from "./FinanceFormDrawer";
import { FormSection } from "./FormSection";
import { FinanceListToolbar } from "./FinanceListToolbar";
import { ScrollTableCard } from "./ScrollTableCard";
import { showingCountLabel } from "./kitHelpers";
import { SummaryStrip } from "./SummaryStrip";

afterEach(() => cleanup());

describe("finance kit", () => {
  it("opens FinanceFormDrawer and submits", () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    const onClose = vi.fn();
    render(
      <FinanceFormDrawer open title="Add ledger" onClose={onClose} onSubmit={onSubmit} submitLabel="Create">
        <FormSection title="Basics">
          <input aria-label="Name" defaultValue="Cash" />
        </FormSection>
      </FinanceFormDrawer>,
    );
    expect(screen.getByRole("dialog", { name: "Add ledger" })).toBeTruthy();
    expect(screen.getByText("Basics")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("renders panel mode without submit", () => {
    render(
      <FinanceFormDrawer
        mode="panel"
        open
        title="Bill detail"
        onClose={() => undefined}
        footer={<button type="button">Post AP</button>}
      >
        <p>Line items</p>
      </FinanceFormDrawer>,
    );
    expect(screen.getByText("Line items")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post AP" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("renders toolbar primary action and summary strip", () => {
    const onAdd = vi.fn();
    render(
      <>
        <FinanceListToolbar
          search=""
          onSearchChange={() => undefined}
          primaryAction={{ label: "Add bill", onClick: onAdd }}
        />
        <SummaryStrip
          items={[
            { key: "open", label: "Open", value: "3" },
            { key: "paid", label: "Paid", value: "1", tone: "success" },
          ]}
        />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add bill" }));
    expect(onAdd).toHaveBeenCalled();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  it("ScrollTableCard shows footer count helper", () => {
    render(
      <ScrollTableCard footer={showingCountLabel(2, 5, "account")} maxHeight="panel">
        <table>
          <tbody>
            <tr>
              <td>A</td>
            </tr>
          </tbody>
        </table>
      </ScrollTableCard>,
    );
    expect(screen.getByText("Showing 2 of 5 accounts")).toBeTruthy();
  });
});
