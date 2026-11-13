// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollToTop } from "@/app/router";
import { prepareAppContainer, revealApp } from "@/lib/prerenderSnapshot";

let goTo: (path: string) => void = () => {};
function NavigateHandle() {
  const navigate = useNavigate();
  goTo = (path) => navigate(path);
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <NavigateHandle />
    </MemoryRouter>,
  );
}

afterEach(() => {
  revealApp();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ScrollToTop", () => {
  it("scrolls to the top on first render and on every navigation (app pages, unchanged)", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderAt("/app/orders");
    expect(scroll).toHaveBeenCalledTimes(1);
    act(() => goTo("/app/customers"));
    expect(scroll).toHaveBeenCalledTimes(2);
  });

  it("keeps the visitor's scroll position on a pre-rendered page, then scrolls on navigation", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-prerendered="true"><h1>Pricing</h1></div>';
    document.body.appendChild(root);
    prepareAppContainer(root);
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    renderAt("/pricing");
    expect(scroll).not.toHaveBeenCalled();
    act(() => goTo("/features"));
    expect(scroll).toHaveBeenCalledTimes(1);
  });
});
