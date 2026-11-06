/**
 * Internal ERP API — import everything from here: `import { api, type OrderResponse } from "@/api/client"`.
 *
 * This file only re-exports. Where things live:
 *   api/core.ts      tokens, ApiError, fetch helpers (request, requestBlob, …)
 *   api/models.ts    request/response types and small shared helpers
 *   api/<domain>.ts  API methods per area (finance, inventory, hr, sales, merch, production,
 *                    commercial, ai, platform, auth, aiChat)
 * `api` below combines every domain object, so `api.someMethod()` works as before.
 */
import { financeApi } from "@/api/finance";
import { inventoryApi } from "@/api/inventory";
import { hrApi } from "@/api/hr";
import { authApi } from "@/api/auth";
import { aiChatApi } from "@/api/aiChat";
import { merchApi } from "@/api/merch";
import { productionApi } from "@/api/production";
import { salesApi } from "@/api/sales";
import { commercialApi } from "@/api/commercial";
import { aiApi } from "@/api/ai";
import { platformApi } from "@/api/platform";

export * from "@/api/models";
export { ApiError, clearAuth, getTenantId, getToken, setAuth } from "@/api/core";
export type { ListWithTotal, PaginatedRows } from "@/api/core";
export { financeApi } from "@/api/finance";
export { inventoryApi } from "@/api/inventory";
export { hrApi } from "@/api/hr";
export { authApi } from "@/api/auth";
export { aiChatApi } from "@/api/aiChat";
export { merchApi } from "@/api/merch";
export { productionApi } from "@/api/production";
export { salesApi } from "@/api/sales";
export { commercialApi } from "@/api/commercial";
export { aiApi } from "@/api/ai";
export { platformApi } from "@/api/platform";

export const api = {
  ...financeApi,
  ...inventoryApi,
  ...hrApi,
  ...authApi,
  ...aiChatApi,
  ...merchApi,
  ...productionApi,
  ...salesApi,
  ...commercialApi,
  ...aiApi,
  ...platformApi,
};
