import { describe, expect, it } from "vitest";
import { nextPollDelay } from "./usePolling";

describe("nextPollDelay", () => {
  it("uses the normal interval when healthy", () => {
    expect(nextPollDelay(3000, 0, 60_000)).toBe(3000);
  });

  it("doubles per consecutive failure and caps", () => {
    expect(nextPollDelay(3000, 1, 60_000)).toBe(6000);
    expect(nextPollDelay(3000, 2, 60_000)).toBe(12_000);
    expect(nextPollDelay(3000, 10, 60_000)).toBe(60_000);
  });

  it("never waits less than the interval even with a small cap", () => {
    expect(nextPollDelay(300_000, 3, 60_000)).toBe(300_000);
  });
});
