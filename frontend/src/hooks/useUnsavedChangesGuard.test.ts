// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { isAnyFormDirty } from "@/lib/unsavedChanges";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

describe("useUnsavedChangesGuard marks the page dirty for automatic reloads", () => {
  afterEach(cleanup);

  it("is dirty only while active and while mounted", () => {
    const { rerender, unmount } = renderHook(({ active }) => useUnsavedChangesGuard(active, () => true), {
      initialProps: { active: false },
    });
    expect(isAnyFormDirty()).toBe(false);
    rerender({ active: true });
    expect(isAnyFormDirty()).toBe(true);
    rerender({ active: false });
    expect(isAnyFormDirty()).toBe(false);
    rerender({ active: true });
    unmount();
    expect(isAnyFormDirty()).toBe(false);
  });

  it("stays dirty until every guarded form is clean", () => {
    const a = renderHook(() => useUnsavedChangesGuard(true, () => true));
    const b = renderHook(() => useUnsavedChangesGuard(true, () => true));
    a.unmount();
    expect(isAnyFormDirty()).toBe(true);
    b.unmount();
    expect(isAnyFormDirty()).toBe(false);
  });
});
