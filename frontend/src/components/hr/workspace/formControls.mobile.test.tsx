// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

let flags: Record<string, boolean> = {};
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ me: { feature_flags: flags } }) }));

import { Section, TextField } from "./formControls";

function mockPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("767px") ? isPhone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  flags = {};
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function renderForm() {
  return render(
    <>
      <Section title="Facilities" collapsibleOnPhone>
        <TextField label="Other facility" value="Canteen" onChange={() => {}} />
      </Section>
      <Section title="Basic details">
        <TextField label="Mobile" type="tel" value="" onChange={() => {}} />
      </Section>
    </>,
  );
}

describe("HR form controls with mobile_ui_v2", () => {
  it("folds only the optional section on a phone and keeps its value in the form", () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    const { container } = renderForm();
    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details!.open).toBe(false);
    expect(screen.getByText("Facilities (optional)")).toBeTruthy();
    expect((screen.getByLabelText("Other facility") as HTMLInputElement).value).toBe("Canteen");
    expect(screen.getByRole("heading", { name: "Basic details" })).toBeTruthy();
  });

  it("uses 44px fields and the phone keypad for phone numbers", () => {
    flags = { mobile_ui_v2: true };
    mockPhone(true);
    renderForm();
    const mobile = screen.getByLabelText("Mobile");
    expect(mobile.className).toContain("min-h-[44px]");
    expect(mobile.getAttribute("inputmode")).toBe("tel");
  });

  it("does not fold sections on a desktop screen", () => {
    flags = { mobile_ui_v2: true };
    mockPhone(false);
    const { container } = renderForm();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByRole("heading", { name: "Facilities" })).toBeTruthy();
  });

  it("keeps today's form when the switch is off", () => {
    mockPhone(true);
    const { container } = renderForm();
    expect(container.querySelector("details")).toBeNull();
    const mobile = screen.getByLabelText("Mobile");
    expect(mobile.className).not.toContain("min-h-[44px]");
    expect(mobile.getAttribute("inputmode")).toBeNull();
  });
});
