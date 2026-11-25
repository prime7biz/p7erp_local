// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CostingItemResponse } from "@/api/client";

const h = vi.hoisted(() => ({
  api: {
    listCostingItemsPage: vi.fn(),
    getCostingItem: vi.fn(),
  },
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return { ...actual, api: h.api };
});

import { MaterialItemCombobox } from "./MaterialItemCombobox";

function item(id: number, name: string, category_id = 1): CostingItemResponse {
  return { id, item_code: `IT-${id}`, name, category_id } as unknown as CostingItemResponse;
}

beforeEach(() => {
  h.api.listCostingItemsPage.mockReset();
  h.api.getCostingItem.mockReset();
});
afterEach(cleanup);

describe("MaterialItemCombobox", () => {
  it("loads items from the server on every row, not only the first (items prop is empty)", async () => {
    h.api.listCostingItemsPage.mockResolvedValue({ rows: [item(1, "Fabric"), item(2, "Zipper")], total: 2 });
    // Two rows, like two quotation material lines.
    render(
      <>
        <MaterialItemCombobox items={[]} categoryId={null} itemId={null} onSelect={() => {}} />
        <MaterialItemCombobox items={[]} categoryId={1} itemId={null} onSelect={() => {}} />
      </>,
    );
    const boxes = screen.getAllByRole("combobox");
    fireEvent.focus(boxes[1]!);
    await waitFor(() => expect(screen.getByText("IT-2 · Zipper")).toBeTruthy());
    // The category filter is sent to the server for that row.
    expect(h.api.listCostingItemsPage).toHaveBeenCalledWith(expect.objectContaining({ category_id: 1, offset: 0 }));
  });

  it("selects an item and reports it", async () => {
    h.api.listCostingItemsPage.mockResolvedValue({ rows: [item(5, "Button")], total: 1 });
    const onSelect = vi.fn();
    render(<MaterialItemCombobox items={[]} categoryId={null} itemId={null} onSelect={onSelect} />);
    fireEvent.focus(screen.getByRole("combobox"));
    const option = await screen.findByText("IT-5 · Button");
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it("offers Load more when the server has more matches", async () => {
    h.api.listCostingItemsPage
      .mockResolvedValueOnce({ rows: [item(1, "A")], total: 2 })
      .mockResolvedValueOnce({ rows: [item(2, "B")], total: 2 });
    render(<MaterialItemCombobox items={[]} categoryId={null} itemId={null} onSelect={() => {}} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByText(/Load more/));
    await waitFor(() => expect(screen.getByText("IT-2 · B")).toBeTruthy());
    expect(h.api.listCostingItemsPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }));
  });

  it("labels a saved item that is not on any loaded page by fetching just that item", async () => {
    h.api.getCostingItem.mockResolvedValue(item(900, "Old trim"));
    render(<MaterialItemCombobox items={[]} categoryId={null} itemId={900} onSelect={() => {}} />);
    await waitFor(() => expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("IT-900 · Old trim"));
    expect(h.api.getCostingItem).toHaveBeenCalledWith(900);
  });

  it("shows an error message when the server call fails", async () => {
    h.api.listCostingItemsPage.mockRejectedValue(new Error("boom"));
    render(<MaterialItemCombobox items={[]} categoryId={null} itemId={null} onSelect={() => {}} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(await screen.findByText(/Could not load items/)).toBeTruthy();
  });
});
