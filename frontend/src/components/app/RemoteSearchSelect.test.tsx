// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemoteSearchSelect, type RemoteSelectOption } from "./RemoteSearchSelect";

afterEach(() => {
  cleanup();
});

const ALL: RemoteSelectOption[] = Array.from({ length: 250 }, (_, i) => ({
  value: i + 1,
  label: `Item ${i + 1}`,
}));

/** Fake server: filters by query and returns one page. */
function makeFetchPage() {
  return vi.fn(async (query: string, page: number, pageSize: number) => {
    const q = query.toLowerCase();
    const matches = q ? ALL.filter((o) => o.label.toLowerCase().includes(q)) : ALL;
    const start = (page - 1) * pageSize;
    return { options: matches.slice(start, start + pageSize), total: matches.length };
  });
}

function scrollToBottom(list: HTMLElement) {
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(list, "clientHeight", { configurable: true, value: 200 });
  list.scrollTop = 800;
  fireEvent.scroll(list);
}

describe("RemoteSearchSelect", () => {
  it("loads 100 rows at first, shows the total, and auto-loads the next page on scroll", async () => {
    const fetchPage = makeFetchPage();
    render(<RemoteSearchSelect value="" onChange={() => {}} fetchPage={fetchPage} aria-label="Item" />);

    const input = screen.getByRole("combobox", { name: "Item" });
    await userEvent.setup().click(input);

    const list = await screen.findByRole("listbox");
    await waitFor(() => expect(within(list).getAllByRole("option").length).toBe(100));
    expect(fetchPage).toHaveBeenCalledWith("", 1, 100);
    expect(within(list).getByText(/Showing 100 of 250/)).toBeTruthy();

    scrollToBottom(list);

    await waitFor(() => expect(within(list).getAllByRole("option").length).toBe(200));
    expect(fetchPage).toHaveBeenCalledWith("", 2, 100);
  });

  it("keeps loading to the very end when the server only guesses the total", async () => {
    // Like the employee list: no real total, a full page means "maybe more".
    const fetchPage = vi.fn(async (_query: string, page: number, pageSize: number) => {
      const start = (page - 1) * pageSize;
      const options = ALL.slice(start, start + pageSize);
      const full = options.length >= pageSize;
      return {
        options,
        total: full ? page * pageSize + 1 : start + options.length,
        totalIsEstimate: full,
      };
    });
    render(<RemoteSearchSelect value="" onChange={() => {}} fetchPage={fetchPage} aria-label="Item" />);

    await userEvent.setup().click(screen.getByRole("combobox", { name: "Item" }));
    const list = await screen.findByRole("listbox");
    await waitFor(() => expect(within(list).getAllByRole("option").length).toBe(100));
    expect(within(list).queryByText(/of 101/)).toBeNull(); // a guess is never shown as a count

    scrollToBottom(list);
    await waitFor(() => expect(within(list).getAllByRole("option").length).toBe(200));
    scrollToBottom(list);
    await waitFor(() => expect(within(list).getAllByRole("option").length).toBe(250));
    expect(within(list).getByText(/Showing 250 of 250/)).toBeTruthy();
  });

  it("sends the typed text to the server", async () => {
    const fetchPage = makeFetchPage();
    render(<RemoteSearchSelect value="" onChange={() => {}} fetchPage={fetchPage} debounceMs={10} aria-label="Item" />);

    const user = userEvent.setup();
    const input = screen.getByRole("combobox", { name: "Item" });
    await user.click(input);
    await user.type(input, "item 249");

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith("item 249", 1, 100));
    const list = screen.getByRole("listbox");
    await waitFor(() => expect(within(list).getByRole("option", { name: "Item 249" })).toBeTruthy());
  });
});
