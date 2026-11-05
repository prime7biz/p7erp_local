import { describe, expect, it } from "vitest";
import { voucherTypeForKey } from "./useVoucherHotkeys";

const key = (k: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ key: k, code: "", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra }) as KeyboardEvent;

describe("voucherTypeForKey", () => {
  it("maps Tally F-keys to voucher types", () => {
    expect(voucherTypeForKey(key("F4"))).toBe("CONTRA");
    expect(voucherTypeForKey(key("F5"))).toBe("PAYMENT");
    expect(voucherTypeForKey(key("F6"))).toBe("RECEIPT");
    expect(voucherTypeForKey(key("F7"))).toBe("JOURNAL");
  });

  it("supports Alt+digit as a fallback, including layouts that change `key`", () => {
    expect(voucherTypeForKey(key("5", { altKey: true }))).toBe("PAYMENT");
    expect(voucherTypeForKey(key("¡", { altKey: true, code: "Digit6" }))).toBe("RECEIPT");
  });

  it("ignores plain digits, other F-keys and Ctrl/Shift combinations", () => {
    expect(voucherTypeForKey(key("5"))).toBeNull();
    expect(voucherTypeForKey(key("F8"))).toBeNull();
    expect(voucherTypeForKey(key("F5", { ctrlKey: true }))).toBeNull();
    expect(voucherTypeForKey(key("F5", { shiftKey: true }))).toBeNull();
  });
});
