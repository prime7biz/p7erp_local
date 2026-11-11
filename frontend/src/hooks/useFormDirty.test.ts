// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { formSnapshot, useFormDirty } from "./useFormDirty";

describe("useFormDirty", () => {
  it("is clean on the first render, dirty after a change and clean again when the change is undone", () => {
    const { result, rerender } = renderHook(({ values }) => useFormDirty(values), {
      initialProps: { values: { supplier_name: "", items: [] as string[] } },
    });
    expect(result.current).toBe(false);
    rerender({ values: { supplier_name: "ACME", items: [] } });
    expect(result.current).toBe(true);
    rerender({ values: { supplier_name: "", items: [] } });
    expect(result.current).toBe(false);
  });

  it("voucher style: loading a record together with a new baseline key is not a change; saving resets it", () => {
    const blank = { voucher_type: "JOURNAL", lines: [{ amount: "0" }] };
    const { result, rerender } = renderHook(({ values, key }) => useFormDirty(values, key), {
      initialProps: { values: blank, key: 0 },
    });
    const loaded = { voucher_type: "PAYMENT", lines: [{ amount: "1500.00" }, { amount: "1500.00" }] };
    rerender({ values: loaded, key: 1 });
    expect(result.current).toBe(false);
    rerender({ values: { ...loaded, lines: [{ amount: "1600.00" }, { amount: "1500.00" }] }, key: 1 });
    expect(result.current).toBe(true);
    rerender({ values: blank, key: 2 });
    expect(result.current).toBe(false);
  });

  it("treats a missing optional field the same as one cleared to undefined", () => {
    expect(formSnapshot({ customer_id: 0 })).toBe(formSnapshot({ customer_id: 0, remarks: undefined }));
  });
});
