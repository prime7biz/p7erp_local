import type { ExternalPrincipalType } from "@/types/externalAccess";

export const EXT_PORTAL_LABEL: Record<ExternalPrincipalType, string> = {
  customer: "Customer portal",
  financier: "Financier confidence center",
};

export function portalHomePath(type: ExternalPrincipalType): string {
  return type === "customer" ? "/portal/customer" : "/portal/financier";
}
