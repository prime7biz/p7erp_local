import { beforeEach, describe, expect, it, vi } from "vitest";

const tenant = { id: "1" };
const listChartOfAccounts = vi.fn<(params?: unknown) => Promise<{ id: number; name: string }[]>>(async () => [
  { id: 1, name: `Cash (tenant ${tenant.id})` },
]);
const listBankAccounts = vi.fn<(params?: unknown) => Promise<{ id: number; account_name: string }[]>>(async () => [
  { id: 7, account_name: "Main" },
]);

vi.mock("@/api/core", () => ({ getTenantId: () => tenant.id }));
vi.mock("@/api/client", () => ({
  api: {
    listChartOfAccounts: (p?: unknown) => listChartOfAccounts(p),
    listBankAccounts: (p?: unknown) => listBankAccounts(p),
  },
}));

import { queryClient } from "@/lib/queryClient";
import { getBankAccountsCached, getChartOfAccountsCached, invalidateMasterData } from "./masterData";

describe("finance pick-list cache", () => {
  beforeEach(() => {
    queryClient.clear();
    tenant.id = "1";
    listChartOfAccounts.mockClear();
    listBankAccounts.mockClear();
  });

  it("downloads each list once for many pages", async () => {
    await Promise.all([getChartOfAccountsCached({ active_only: true }), getChartOfAccountsCached({ active_only: true })]);
    await getChartOfAccountsCached({ active_only: true });
    expect(listChartOfAccounts).toHaveBeenCalledTimes(1);
    await getChartOfAccountsCached({ active_only: false });
    expect(listChartOfAccounts).toHaveBeenCalledTimes(2);
  });

  it("downloads again after the list is invalidated (e.g. an account was saved)", async () => {
    await getBankAccountsCached();
    await invalidateMasterData("bank-accounts");
    await getBankAccountsCached();
    expect(listBankAccounts).toHaveBeenCalledTimes(2);
  });

  it("a finance or account-creating write clears the account pick-list", async () => {
    const { forgetMasterListsAfterWrite } = await vi.importActual<typeof import("@/api/core")>("@/api/core");
    await getChartOfAccountsCached(); // warm the cache
    for (const path of ["/api/v1/finance/vouchers", "/api/v1/hr/payroll/runs/1/post", "/api/v1/facility/x", "/api/v1/customers"]) {
      listChartOfAccounts.mockClear();
      forgetMasterListsAfterWrite(path, "POST");
      await getChartOfAccountsCached();
      expect(listChartOfAccounts, path).toHaveBeenCalledTimes(1);
    }
    listChartOfAccounts.mockClear();
    forgetMasterListsAfterWrite("/api/v1/finance/vouchers", "GET");
    await getChartOfAccountsCached();
    expect(listChartOfAccounts).toHaveBeenCalledTimes(0);
  });

  it("never shares a cached list between companies", async () => {
    const a = await getChartOfAccountsCached();
    tenant.id = "2";
    const b = await getChartOfAccountsCached();
    expect(listChartOfAccounts).toHaveBeenCalledTimes(2);
    expect(a[0]?.name).toContain("tenant 1");
    expect(b[0]?.name).toContain("tenant 2");
  });
});
