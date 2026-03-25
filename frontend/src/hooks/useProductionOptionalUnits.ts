import { useCallback, useEffect, useState } from "react";
import type { TenantType } from "@/api/client";
import { api } from "@/api/client";

/**
 * Optional departments (knitting, dyeing, …) enabled in Production setup.
 * Always-on units (cutting, sewing, iron, finishing) are not listed here.
 */
export function useProductionOptionalUnits(tenantType: TenantType | undefined) {
  const [enabledOptionalUnits, setEnabledOptionalUnits] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getProductionSettings();
      setEnabledOptionalUnits(s.enabled_optional_units ?? []);
    } catch {
      setEnabledOptionalUnits([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!tenantType || (tenantType !== "manufacturer" && tenantType !== "both")) {
      setEnabledOptionalUnits([]);
      setLoaded(true);
      return;
    }
    void refresh();
  }, [tenantType, refresh]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("production-optional-units-changed", handler);
    return () => {
      window.removeEventListener("production-optional-units-changed", handler);
    };
  }, [refresh]);

  return { enabledOptionalUnits, loaded, refresh };
}
