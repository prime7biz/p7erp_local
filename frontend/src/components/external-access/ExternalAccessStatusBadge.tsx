import { Badge } from "@/components/ui/badge";

export function ExternalAccessStatusBadge({
  variant,
  children,
}: {
  variant: "active" | "inactive" | "locked" | "invited";
  children: React.ReactNode;
}) {
  const v =
    variant === "active"
      ? "success"
      : variant === "inactive"
        ? "secondary"
        : variant === "locked"
          ? "danger"
          : "info";
  return <Badge variant={v}>{children}</Badge>;
}
