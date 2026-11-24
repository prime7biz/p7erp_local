import { useCallback } from "react";
import { ModuleHubPage } from "@/components/app/hubs/ModuleHubPage";
import { isMenuPermissionAllowed } from "@/components/shell/sidebarNavUtils";
import { useAuth } from "@/context/AuthContext";
import { MATERIAL_CONTROL_HUB } from "./materialControlHub";

export function MaterialControlHubPage() {
  const { me, hasPermission } = useAuth();
  const featureFlags = me?.feature_flags ?? null;
  const canAccess = useCallback(
    (key: string) => isMenuPermissionAllowed(key, featureFlags, hasPermission),
    [featureFlags, hasPermission],
  );
  return (
    <ModuleHubPage hub={MATERIAL_CONTROL_HUB} featureFlags={featureFlags} canAccess={canAccess} />
  );
}
