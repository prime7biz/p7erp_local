import type { ReactNode } from "react";
import type { AdminCapability } from "@/auth/permissions";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { AccessDenied } from "@/components/AccessDenied";

type Props = {
  capability: AdminCapability;
  children: ReactNode;
  fallback?: ReactNode;
};

export function RequireCapability({ capability, children, fallback }: Props) {
  const { can } = useAdminAuth();
  if (!can(capability)) return fallback ?? <AccessDenied />;
  return <>{children}</>;
}
