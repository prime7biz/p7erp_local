import { usePermissions } from "@/hooks/usePermissions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PermissionGateProps {
  module: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showDisabled?: boolean;
}

export function PermissionGate({
  module,
  action,
  children,
  fallback = null,
  showDisabled = false,
}: PermissionGateProps) {
  const { hasPermission } = usePermissions();
  const allowed = hasPermission(module, action);

  if (allowed) return <>{children}</>;

  if (showDisabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="pointer-events-none opacity-50 cursor-not-allowed inline-flex">
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Insufficient permission</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <>{fallback}</>;
}
