// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const submitLead = vi.hoisted(() => vi.fn());
vi.mock("@/api/publicLeads", () => ({ submitLead }));

import { AccountDeletionPage } from "./AccountDeletionPage";
import { ACCOUNT_DELETION_SUBJECT, buildDeletionMessage } from "./accountDeletion";

afterEach(() => {
  cleanup();
  submitLead.mockReset();
});

describe("account deletion request", () => {
  it("builds a message the team can recognise", () => {
    expect(buildDeletionMessage("LAKH806201", "  Leaving the company  ")).toBe(
      `${ACCOUNT_DELETION_SUBJECT}\nCompany code: LAKH806201\n\nLeaving the company`,
    );
    expect(buildDeletionMessage("", "")).toBe(`${ACCOUNT_DELETION_SUBJECT}\nCompany code: (not given)`);
  });

  it("sends the request and confirms", async () => {
    submitLead.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <AccountDeletionPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/full name/i), "Rahim Uddin");
    await userEvent.type(screen.getByLabelText(/email you sign in with/i), "rahim@example.com");
    await userEvent.type(screen.getByLabelText(/company code/i), "PRIME1357");
    await userEvent.click(screen.getByRole("button", { name: /send deletion request/i }));

    expect(submitLead).toHaveBeenCalledTimes(1);
    const payload = submitLead.mock.calls[0]![0] as { name: string; email: string; message: string; website: string | null };
    expect(payload.name).toBe("Rahim Uddin");
    expect(payload.email).toBe("rahim@example.com");
    expect(payload.message.startsWith(ACCOUNT_DELETION_SUBJECT)).toBe(true);
    expect(payload.message).toContain("Company code: PRIME1357");
    expect(payload.website).toBeNull();
    expect((await screen.findByRole("status")).textContent).toMatch(/Request received/);
  });

  it("shows the error and keeps the form when sending fails", async () => {
    submitLead.mockRejectedValue(new Error("Too many submissions. Please wait a minute and try again."));
    render(
      <MemoryRouter>
        <AccountDeletionPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/full name/i), "A");
    await userEvent.type(screen.getByLabelText(/email you sign in with/i), "a@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send deletion request/i }));
    expect(await screen.findByText(/Too many submissions/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /send deletion request/i })).toBeTruthy();
  });
});
