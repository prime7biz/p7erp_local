import { describe, expect, it } from "vitest";
import { actionLabel, displayUserName, parseImpersonation } from "./userActivityLabels";

describe("userActivityLabels", () => {
  it("maps known actions to plain English", () => {
    expect(actionLabel("LOGIN_FAILED")).toBe("Wrong password attempt");
    expect(actionLabel("LOGIN")).toBe("Signed in");
  });

  it("parses impersonation tags and cleans details", () => {
    const parsed = parseImpersonation("Updated user [impersonated_by_platform_admin=42]");
    expect(parsed.isImpersonated).toBe(true);
    expect(parsed.adminId).toBe(42);
    expect(parsed.cleanDetails).toBe("Updated user");
  });

  it("formats user display names", () => {
    expect(displayUserName({ full_name: "Ada Admin", username: "ada", user_id: 1 })).toBe(
      "Ada Admin (@ada)",
    );
    expect(displayUserName({ full_name: null, username: null, user_id: 9 })).toBe("User #9");
  });
});
