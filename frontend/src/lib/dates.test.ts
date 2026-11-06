import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addDaysLocalISO,
  currentMonthLocal,
  startOfMonthLocalISO,
  startOfYearLocalISO,
  toLocalISODate,
  todayLocalISO,
} from "./dates";

// Vitest runs in Node; changing TZ at runtime switches the local time zone for new Date objects.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

describe("local dates in Bangladesh (UTC+6)", () => {
  const originalTz = env.TZ;

  beforeEach(() => {
    env.TZ = "Asia/Dhaka";
    vi.useFakeTimers();
    // 01:30 on 1 Nov 2026 in Dhaka is still 31 Oct in UTC.
    vi.setSystemTime(new Date("2026-10-31T19:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete env.TZ;
    else env.TZ = originalTz;
  });

  it("todayLocalISO uses the local calendar day, not UTC", () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(todayLocalISO()).toBe("2026-11-01");
  });

  it("month / year / offsets use local dates", () => {
    expect(startOfMonthLocalISO()).toBe("2026-11-01");
    expect(startOfYearLocalISO()).toBe("2026-01-01");
    expect(currentMonthLocal()).toBe("2026-11");
    expect(addDaysLocalISO(-1)).toBe("2026-10-31");
    expect(addDaysLocalISO(30)).toBe("2026-12-01");
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
