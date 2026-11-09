// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { HrCompensationInput, HrCompensationPreview } from "@/api/models";

const previewHrCompensation = vi.fn();
vi.mock("@/api/client", () => ({ api: { previewHrCompensation: (...a: unknown[]) => previewHrCompensation(...a) } }));
vi.mock("@/utils/logApiError", () => ({ logApiError: vi.fn() }));

import { previewKey } from "./employeeWorkspaceLogic";
import { useCompensationPreview } from "./useCompensationPreview";

afterEach(() => previewHrCompensation.mockReset());

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const result = (p: Partial<HrCompensationPreview>): HrCompensationPreview => ({
  minimum_basic: null, minimum_gross: null, basic: null, gross: null, meets_minimum: true, message: null, ...p,
});
const req = (base: string): HrCompensationInput => ({ structure_id: 4, bd_wage_rate_id: null, base_salary: base, effective_from: "2026-12-01" });

describe("useCompensationPreview", () => {
  it("ignores a slow older answer once newer input was checked", async () => {
    const slow = deferred<HrCompensationPreview>();
    const fast = deferred<HrCompensationPreview>();
    previewHrCompensation.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result: hook, rerender } = renderHook(({ r }) => useCompensationPreview(r, true, 0, 0), { initialProps: { r: req("5000") } });
    await waitFor(() => expect(previewHrCompensation).toHaveBeenCalledTimes(1));
    rerender({ r: req("9000") });
    await waitFor(() => expect(previewHrCompensation).toHaveBeenCalledTimes(2));
    expect(hook.current.status).toBe("pending");

    await act(async () => fast.resolve(result({ basic: "9000.0000", meets_minimum: true })));
    await waitFor(() => expect(hook.current.status).toBe("valid"));
    await act(async () => slow.resolve(result({ basic: "5000.0000", meets_minimum: false, message: "below" })));
    expect(hook.current.status).toBe("valid");
    expect(hook.current.key).toBe(previewKey(req("9000")));
    expect(hook.current.preview?.basic).toBe("9000.0000");
  });

  it("reports invalid and error results and stays idle when disabled", async () => {
    previewHrCompensation.mockResolvedValueOnce(result({ meets_minimum: false, message: "Basic is below" }));
    const { result: hook, rerender } = renderHook(({ r, on }) => useCompensationPreview(r, on, 0, 0), {
      initialProps: { r: req("1"), on: true },
    });
    await waitFor(() => expect(hook.current.status).toBe("invalid"));
    expect(hook.current.message).toBe("Basic is below");

    previewHrCompensation.mockRejectedValueOnce(new Error("offline"));
    rerender({ r: req("2"), on: true });
    await waitFor(() => expect(hook.current.status).toBe("error"));
    expect(hook.current.message).toBe("offline");

    rerender({ r: req("3"), on: false });
    await waitFor(() => expect(hook.current.status).toBe("idle"));
    expect(previewHrCompensation).toHaveBeenCalledTimes(2);
  });

  it("checks the same input again when refreshKey changes", async () => {
    previewHrCompensation.mockResolvedValue(result({}));
    const { rerender } = renderHook(({ n }) => useCompensationPreview(req("9000"), true, n, 0), { initialProps: { n: 0 } });
    await waitFor(() => expect(previewHrCompensation).toHaveBeenCalledTimes(1));
    rerender({ n: 1 });
    await waitFor(() => expect(previewHrCompensation).toHaveBeenCalledTimes(2));
  });
});
