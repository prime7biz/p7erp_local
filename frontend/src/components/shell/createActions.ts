import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  FileText,
  Package,
  PlusCircle,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import type { TenantType } from "@/api/client";
import { resolveRole } from "@/lib/roles";

export type CreateAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Extra words the command palette matches on. */
  keywords?: string;
  /** Shown only in the Ctrl+K palette, not in the New menu or mobile + button. */
  paletteOnly?: boolean;
};

/** Role-aware create actions shared by the top-bar New menu, Ctrl+K palette and mobile + button. */
export function getCreateActions(opts: {
  tenantType: TenantType;
  roleName: string;
}): CreateAction[] {
  const { isElevated, isFinance, isHr } = resolveRole(opts.roleName);
  const merchTenant =
    opts.tenantType === "manufacturer" ||
    opts.tenantType === "buying_house" ||
    opts.tenantType === "both";
  const operations = isElevated || (!isFinance && !isHr);

  const actions: CreateAction[] = [];

  if (merchTenant && operations) {
    actions.push(
      { label: "New inquiry", href: "/app/inquiries/new", icon: PlusCircle, keywords: "rfq enquiry" },
      { label: "New quotation", href: "/app/quotations/new", icon: ShoppingCart, keywords: "quote costing" },
      { label: "New order", href: "/app/orders/new", icon: ClipboardList, keywords: "sales order" },
      { label: "New customer", href: "/app/customers/new", icon: Users, keywords: "buyer client" },
    );
  }

  if (operations) {
    actions.push(
      { label: "New PO", href: "/app/inventory/purchase-orders", icon: Package, keywords: "purchase order supplier" },
      { label: "New challan", href: "/app/inventory/delivery-challans/new", icon: Truck, keywords: "delivery dispatch" },
      { label: "Items", href: "/app/inventory/items", icon: Package, keywords: "inventory material" },
    );
  }

  if (isElevated || isFinance) {
    actions.push(
      { label: "New voucher", href: "/app/accounts/vouchers", icon: FileText, keywords: "payment receipt journal" },
      { label: "New payment voucher", href: "/app/accounts/vouchers?new=PAYMENT", icon: FileText, keywords: "f5 pay supplier", paletteOnly: true },
      { label: "New receipt voucher", href: "/app/accounts/vouchers?new=RECEIPT", icon: FileText, keywords: "f6 collect customer", paletteOnly: true },
      { label: "New journal voucher", href: "/app/accounts/vouchers?new=JOURNAL", icon: FileText, keywords: "f7 jv adjustment", paletteOnly: true },
      { label: "New contra voucher", href: "/app/accounts/vouchers?new=CONTRA", icon: FileText, keywords: "f4 cash bank transfer", paletteOnly: true },
    );
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
