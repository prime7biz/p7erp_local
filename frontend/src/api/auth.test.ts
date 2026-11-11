// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./auth";

describe("authApi.logout", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("asks the server to end the session with the current token", async () => {
    localStorage.setItem("p7_token", "abc");
    localStorage.setItem("p7_tenant_id", "7");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await authApi.logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/auth\/logout$/);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer abc", "X-Tenant-Id": "7" });
  });

  it("does nothing without a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await authApi.logout();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws when offline or when the server rejects the token", async () => {
    localStorage.setItem("p7_token", "abc");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(authApi.logout()).resolves.toBeUndefined();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(authApi.logout()).resolves.toBeUndefined();
  });

  it("gives up after the timeout so signing out still works on a dead network", async () => {
    vi.useFakeTimers();
    localStorage.setItem("p7_token", "abc");
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      ),
    );
    const done = authApi.logout(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toBeUndefined();
  });
});
