import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  FileText,
  Package,
  PlusCircle,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { TenantType } from "@/api/client";

export type CreateAction = {
  label: string;
  href: string;
  icon: LucideIcon;
};

/** Role-aware "New" menu actions for the top bar. */
export function getCreateActions(opts: {
  tenantType: TenantType;
  roleName: string;
}): CreateAction[] {
  const role = (opts.roleName || "").toLowerCase();
  const isFinance = role.includes("finance") || role === "accountant";
  const isHr = role.includes("hr") || role === "payroll";
  const isElevated = ["admin", "owner", "manager"].includes(role);
  const merchTenant =
    opts.tenantType === "manufacturer" ||
    opts.tenantType === "buying_house" ||
    opts.tenantType === "both";

  const actions: CreateAction[] = [];

  if (merchTenant && (isElevated || (!isFinance && !isHr))) {
    actions.push(
      { label: "New inquiry", href: "/app/inquiries/new", icon: PlusCircle },
      { label: "New quotation", href: "/app/quotations/new", icon: ShoppingCart },
      { label: "New order", href: "/app/orders/new", icon: ClipboardList },
      { label: "New customer", href: "/app/customers/new", icon: Users },
      { label: "Items", href: "/app/inventory/items", icon: Package },
    );
  }

  if (isElevated || isFinance) {
    actions.push({ label: "Vouchers", href: "/app/accounts/vouchers", icon: FileText });
  }

  if (actions.length === 0) {
    actions.push({ label: "New inquiry", href: "/app/inquiries/new", icon: PlusCircle });
  }

  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });
}
