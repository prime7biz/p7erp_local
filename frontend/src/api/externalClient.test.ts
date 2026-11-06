import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_REFRESH_MODE_KEY,
  EXTERNAL_REFRESH_TOKEN_KEY,
  EXTERNAL_TOKEN_KEY,
  revokeExternalCookieSession,
} from "@/api/authStorage";
import { externalGet, externalLogin, externalLogout, setExtAuth } from "@/api/externalClient";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

type Call = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokens(extra: Record<string, unknown> = {}) {
  return {
    access_token: "new-access",
    refresh_token: "",
    token_type: "bearer",
    tenant_id: 7,
    principal_type: "customer",
    refresh_cookie: true,
    ...extra,
  };
}

let calls: Call[];

function mockFetch(responses: Response[]) {
  calls = [];
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error(`unexpected fetch ${url}`);
      return next;
    }),
  );
}

function nth(index: number): Call {
  const call = calls[index];
  if (!call) throw new Error(`fetch call ${index} was not made`);
  return call;
}

function header(call: Call, name: string): string | undefined {
  return (call.init.headers as Record<string, string> | undefined)?.[name];
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portal refresh token storage", () => {
  it("cookie mode stores no refresh token and removes a stale one", () => {
    localStorage.setItem(EXTERNAL_REFRESH_TOKEN_KEY, "stale-refresh-token");
    setExtAuth("access", "", 7, "customer", true);
    expect(localStorage.getItem(EXTERNAL_TOKEN_KEY)).toBe("access");
    expect(localStorage.getItem(EXTERNAL_REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(EXTERNAL_REFRESH_MODE_KEY)).toBe("cookie");
  });

  it("body mode keeps the refresh token as before", () => {
    setExtAuth("access", "body-refresh-token", 7, "customer");
    expect(localStorage.getItem(EXTERNAL_REFRESH_TOKEN_KEY)).toBe("body-refresh-token");
    expect(localStorage.getItem(EXTERNAL_REFRESH_MODE_KEY)).toBeNull();
  });
});

describe("portal auth requests", () => {
  it("login sends the cookie-aware header and credentials", async () => {
    mockFetch([jsonResponse(200, tokens())]);
    await externalLogin({ company_code: "C1", email: "a@example.com", password: "x", principal_type: "customer" });
    expect(nth(0).url).toBe("/api/external/auth/login");
    expect(nth(0).init.credentials).toBe("include");
    expect(header(nth(0), "X-Requested-With")).toBe("p7");
  });

  it("cookie mode: a 401 refreshes through the cookie with an empty body, then retries", async () => {
    setExtAuth("old-access", "", 7, "customer", true);
    mockFetch([jsonResponse(401, { detail: "expired" }), jsonResponse(200, tokens()), jsonResponse(200, { ok: 1 })]);

    await expect(externalGet<{ ok: number }>("/customer/orders")).resolves.toEqual({ ok: 1 });

    const refresh = nth(1);
    expect(refresh.url).toBe("/api/external/auth/refresh");
    expect(refresh.init.credentials).toBe("include");
    expect(header(refresh, "X-Requested-With")).toBe("p7");
    expect(header(refresh, "Authorization")).toBeUndefined();
    expect(JSON.parse(refresh.init.body as string)).toEqual({});
    expect(header(nth(2), "Authorization")).toBe("Bearer new-access");
    expect(localStorage.getItem(EXTERNAL_REFRESH_TOKEN_KEY)).toBeNull();
  });

  it("body mode: refresh sends the stored token and moves to cookie mode when the server switches", async () => {
    setExtAuth("old-access", "body-refresh-token", 7, "customer");
    mockFetch([jsonResponse(401, { detail: "expired" }), jsonResponse(200, tokens()), jsonResponse(200, { ok: 1 })]);

    await externalGet("/customer/orders");

    expect(JSON.parse(nth(1).init.body as string)).toEqual({ refresh_token: "body-refresh-token" });
    expect(localStorage.getItem(EXTERNAL_REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(EXTERNAL_REFRESH_MODE_KEY)).toBe("cookie");
  });

  it("body mode stays in body mode while the server flag is off", async () => {
    setExtAuth("old-access", "body-refresh-token", 7, "customer");
    mockFetch([
      jsonResponse(401, { detail: "expired" }),
      jsonResponse(200, tokens({ refresh_token: "rotated-refresh-token", refresh_cookie: false })),
      jsonResponse(200, { ok: 1 }),
    ]);

    await externalGet("/customer/orders");

    expect(localStorage.getItem(EXTERNAL_REFRESH_TOKEN_KEY)).toBe("rotated-refresh-token");
    expect(localStorage.getItem(EXTERNAL_REFRESH_MODE_KEY)).toBeNull();
  });

  it("without a refresh token or cookie session a 401 does not call refresh", async () => {
    localStorage.setItem(EXTERNAL_TOKEN_KEY, "old-access");
    mockFetch([jsonResponse(401, { detail: "expired" })]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(externalGet("/customer/orders")).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("logout sends credentials and the cookie-aware header", async () => {
    setExtAuth("access", "", 7, "customer", true);
    mockFetch([jsonResponse(204, null)]);
    await externalLogout();
    expect(nth(0).url).toBe("/api/external/auth/logout");
    expect(nth(0).init.credentials).toBe("include");
    expect(header(nth(0), "X-Requested-With")).toBe("p7");
    expect(header(nth(0), "Authorization")).toBe("Bearer access");
  });
});

describe("staff login over a portal cookie session", () => {
  it("revokes the portal cookie session only in cookie mode", () => {
    mockFetch([jsonResponse(204, null)]);
    setExtAuth("access", "body-refresh-token", 7, "customer");
    revokeExternalCookieSession();
    expect(calls).toHaveLength(0);

    setExtAuth("access", "", 7, "customer", true);
    revokeExternalCookieSession();
    expect(calls).toHaveLength(1);
    expect(nth(0).url).toBe("/api/external/auth/logout");
    expect(nth(0).init.credentials).toBe("include");
    expect(header(nth(0), "X-Requested-With")).toBe("p7");
  });
});
