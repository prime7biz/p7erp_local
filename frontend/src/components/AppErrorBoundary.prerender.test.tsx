// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { isPrerenderedPagePending, prepareAppContainer, revealApp } from "@/lib/prerenderSnapshot";

function Boom(): never {
  throw new Error("page failed");
}

afterEach(() => {
  revealApp();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AppErrorBoundary on a pre-rendered page", () => {
  it("shows the error screen instead of leaving it hidden behind the static copy", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-prerendered="true"><h1>Pricing</h1></div>';
    document.body.appendChild(root);
    const container = prepareAppContainer(root);
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
      { container },
    );

    expect(isPrerenderedPagePending()).toBe(false);
    expect(container.style.display).toBe("contents");
    expect(root.querySelector("[data-prerendered]")).toBeNull();
  });
});
