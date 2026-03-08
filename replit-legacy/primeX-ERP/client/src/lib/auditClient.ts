import { apiRequest } from "@/lib/queryClient";

export async function logClientAction(
  action: string,
  entityType: string,
  entityId?: number,
  details?: Record<string, any>
): Promise<void> {
  try {
    await apiRequest("/api/audit/log-action", "POST", {
      action,
      entityType,
      entityId: entityId || 0,
      details,
    });
  } catch {
  }
}
