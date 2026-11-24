import { HubLegacyRedirect } from "@/components/app/hubs/HubLegacyRedirect";
import { MATERIAL_CONTROL_HUB } from "./materialControlHub";

/** Old Material Control bookmark / Help URL → hub `?tab=` (keeps query + hash). */
export function MaterialControlLegacyRedirect({ from }: { from: string }) {
  return (
    <HubLegacyRedirect
      hubs={[MATERIAL_CONTROL_HUB]}
      from={from}
      fallback="/app/inventory/material-control"
    />
  );
}
