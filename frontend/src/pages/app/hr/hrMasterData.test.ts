import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listHrDepartments: vi.fn(),
  listHrDesignations: vi.fn(),
  listHrEmployees: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

import { fetchAllHrDepartments, fetchAllHrDesignations, fetchAllHrEmployees } from "./hrMasterData";

/** Fake server that returns `total` rows, at most `limit` per call. */
function serverWith(total: number) {
  return vi.fn(async (params: { limit?: number; offset?: number }) => {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const count = Math.max(0, Math.min(limit, total - offset));
    return Array.from({ length: count }, (_, i) => ({ id: offset + i + 1 }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hrMasterData", () => {
  it("pages past 500 designations so none are missing", async () => {
    api.listHrDesignations.mockImplementation(serverWith(1203));
    const rows = await fetchAllHrDesignations();
    expect(rows).toHaveLength(1203);
    expect(api.listHrDesignations).toHaveBeenCalledWith({ active_only: false, limit: 500, offset: 0 });
    expect(api.listHrDesignations).toHaveBeenCalledWith({ active_only: false, limit: 500, offset: 1000 });
  });

  it("passes activeOnly through to the server", async () => {
    api.listHrEmployees.mockImplementation(serverWith(3));
    const rows = await fetchAllHrEmployees({ activeOnly: true });
    expect(rows).toHaveLength(3);
    expect(api.listHrEmployees).toHaveBeenCalledWith({ active_only: true, limit: 500, offset: 0 });
  });

  it("loads every department", async () => {
    api.listHrDepartments.mockImplementation(serverWith(620));
    expect(await fetchAllHrDepartments()).toHaveLength(620);
  });
});
