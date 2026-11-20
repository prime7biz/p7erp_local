import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  Factory,
  FileText,
  Package,
  PlusCircle,
  Scissors,
  Ship,
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
  /** When authority classes are ON, only modules in this list are offered. */
  moduleGrants?: string[] | null;
  authorityClassesEnabled?: boolean;
}): CreateAction[] {
  const { isElevated, isFinance, isHr } = resolveRole(opts.roleName);
  const merchTenant =
    opts.tenantType === "manufacturer" ||
    opts.tenantType === "buying_house" ||
    opts.tenantType === "both";
  const operations = isElevated || (!isFinance && !isHr);
  const authorityOn = opts.authorityClassesEnabled === true;
  const grants = new Set((opts.moduleGrants || []).map((m) => m.trim().toLowerCase()));
  const hasModule = (code: string) => !authorityOn || grants.has(code) || grants.has("super");

  const actions: CreateAction[] = [];

  if (merchTenant && operations && hasModule("merch")) {
    actions.push(
      { label: "New inquiry", href: "/app/inquiries/new", icon: PlusCircle, keywords: "rfq enquiry" },
      { label: "New quotation", href: "/app/quotations/new", icon: ShoppingCart, keywords: "quote costing" },
      { label: "New order", href: "/app/orders/new", icon: ClipboardList, keywords: "sales order" },
      { label: "New customer", href: "/app/customers/new", icon: Users, keywords: "buyer client" },
      // Commercial APIs mount under merch.access — keep New shortcuts on the merch grant.
      {
        label: "New proforma",
        href: "/app/commercial/proforma-invoices/new",
        icon: FileText,
        keywords: "pi proforma invoice commercial",
      },
      {
        label: "New export case",
        href: "/app/commercial/export-cases/new",
        icon: Ship,
        keywords: "export shipment commercial case",
      },
    );
  }

  if (operations && hasModule("inventory")) {
    actions.push(
      { label: "New PO", href: "/app/inventory/purchase-orders", icon: Package, keywords: "purchase order supplier" },
      { label: "New challan", href: "/app/inventory/delivery-challans/new", icon: Truck, keywords: "delivery dispatch" },
      {
        label: "New gate pass",
        href: "/app/inventory/enhanced-gate-passes/new",
        icon: Truck,
        keywords: "security yard release",
      },
      { label: "Items", href: "/app/inventory/items", icon: Package, keywords: "inventory material" },
    );
  }

  if (operations && hasModule("production")) {
    actions.push(
      {
        label: "Cutting pipeline",
        href: "/app/production/cutting",
        icon: Scissors,
        keywords: "cut ticket bundles barcode",
      },
      {
        label: "Hourly production",
        href: "/app/production/hourly",
        icon: Factory,
        keywords: "sewing line output",
      },
    );
  }

  if ((isElevated || isFinance) && hasModule("finance")) {
    actions.push(
      { label: "New voucher", href: "/app/accounts/vouchers", icon: FileText, keywords: "payment receipt journal" },
      { label: "New payment voucher", href: "/app/accounts/vouchers?new=PAYMENT", icon: FileText, keywords: "f5 pay supplier", paletteOnly: true },
      { label: "New receipt voucher", href: "/app/accounts/vouchers?new=RECEIPT", icon: FileText, keywords: "f6 collect customer", paletteOnly: true },
      { label: "New journal voucher", href: "/app/accounts/vouchers?new=JOURNAL", icon: FileText, keywords: "f7 jv adjustment", paletteOnly: true },
      { label: "New contra voucher", href: "/app/accounts/vouchers?new=CONTRA", icon: FileText, keywords: "f4 cash bank transfer", paletteOnly: true },
    );
  }

  if ((isElevated || isHr) && hasModule("hr")) {
    actions.push({
      label: "New employee",
      href: "/app/hr/employees/new",
      icon: Users,
      keywords: "staff hire onboarding worker",
    });
  }

  if (operations && hasModule("trade")) {
    actions.push({
      label: "Trade cases",
      href: "/app/trade/cases",
      icon: Ship,
      keywords: "trade case logistics shipment",
    });
  }

  if ((isElevated || isFinance) && hasModule("facility")) {
    actions.push({
      label: "New facility",
      href: "/app/finance/facilities/new",
      icon: Building2,
      keywords: "loan bank facility finance",
    });
  }

  // Legacy empty-menu fallback. When authority classes are ON, never invent a merch
  // shortcut the user was not granted (empty grants → empty menu is correct).
  if (actions.length === 0 && (!authorityOn || hasModule("merch"))) {
    actions.push({ label: "New inquiry", href: "/app/inquiries/new", icon: PlusCircle });
  }

  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.href)) return false;
    seen.add(a.href);
    return true;
  });
}
