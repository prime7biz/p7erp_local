export type RbacMode = "off" | "shadow" | "enforce";

const RBAC_MODES: ReadonlySet<RbacMode> = new Set<RbacMode>(["off", "shadow", "enforce"]);

// Mirror backend `app.common.tenant_feature_keys.get_tenant_rbac_mode`:
// the backend normalizes the flag with `.strip().lower()` before comparing,
// so any casing/whitespace drift here would let the UI render routes that
// the API will then reject with 403. Keep this in sync.
export function getRbacMode(
  featureFlags: Record<string, boolean | string | number | null> | null | undefined,
): RbacMode {
  const raw = featureFlags?.rbac_enforcement;
  if (typeof raw !== "string") return "off";
  const normalized = raw.trim().toLowerCase() as RbacMode;
  return RBAC_MODES.has(normalized) ? normalized : "off";
}
