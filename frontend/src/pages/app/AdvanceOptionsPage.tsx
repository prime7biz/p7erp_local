import { Link } from "react-router-dom";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import {
  CalendarClock,
  Coins,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Link2,
  ListTree,
  Receipt,
  Settings2,
} from "lucide-react";

const HUB = "/app/finance/setup";

const CARDS: Array<{
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}> = [
  {
    title: "Chart of Accounts & CoA settings",
    description:
      "Account numbering, posting rules, and CoA configuration. Import/export CSV and manage inventory clearing defaults on the same page.",
    href: `${HUB}?tab=chart-of-accounts`,
    icon: <ListTree className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Account Groups (Advanced)",
    description:
      "Hierarchy, reporting codes, default normal balance, summary groups, and advance design view.",
    href: `${HUB}?tab=account-groups`,
    icon: <FolderTree className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Cost centres",
    description: "Department or project cost tracking and dashboards.",
    href: `${HUB}?tab=cost-centers`,
    icon: <Landmark className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Multi-currency & FX",
    description: "Exchange rates, revaluation preview, and link to FX receipts workflow.",
    href: `${HUB}?tab=currency`,
    icon: <Coins className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Accounting periods",
    description: "Open and close fiscal periods; control which dates can be posted.",
    href: `${HUB}?tab=accounting-periods`,
    icon: <CalendarClock className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Outstanding bills & bill references",
    description: "AP/AR bills, aging, allocation, and auto-create from vouchers.",
    href: "/app/finance/vouchers-payables?tab=outstanding-bills",
    icon: <Receipt className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Vouchers & voucher types",
    description: "Create vouchers; configure voucher types from Finance Setup.",
    href: "/app/finance/vouchers-payables?tab=vouchers",
    icon: <FileSpreadsheet className="h-7 w-7 text-brand-primary" />,
  },
  {
    title: "Purchase & AP workflow",
    description: "PO, GRN, and payable bill creation from operational documents.",
    href: "/app/finance/vouchers-payables?tab=purchase-ap",
    icon: <Link2 className="h-7 w-7 text-brand-primary" />,
  },
];

export function AdvanceOptionsPage() {
  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Advance Options"
        description="Shortcuts into finance masters, periods, currency, bills, and transactions."
      />

      <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
        {CARDS.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="group flex gap-4 rounded-xl border border-border bg-surface-raised p-4 transition hover:border-brand-primary/40 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-subtle transition group-hover:bg-brand-primary/10">
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-text-primary">{item.title}</h2>
              <p className="mt-1 text-xs text-text-muted">{item.description}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-primary">
                <Settings2 className="h-3 w-3" />
                Open
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
