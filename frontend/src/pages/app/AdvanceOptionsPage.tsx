import { Link } from "react-router-dom";
import {
  CalendarClock,
  Coins,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Link2,
  ListTree,
  Receipt,
} from "lucide-react";

const PREFIX = "/app";

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
    href: `${PREFIX}/accounts`,
    icon: <ListTree className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Account Groups (Advanced)",
    description:
      "Hierarchy, reporting codes, default normal balance, summary groups, and advance design view.",
    href: `${PREFIX}/accounts/groups`,
    icon: <FolderTree className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Cost centers",
    description: "Department or project cost tracking and dashboards.",
    href: `${PREFIX}/accounts/cost-centers`,
    icon: <Landmark className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Multi-currency & FX",
    description: "Exchange rates, revaluation preview, and link to FX receipts workflow.",
    href: `${PREFIX}/accounts/currency`,
    icon: <Coins className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Accounting periods",
    description: "Open and close fiscal periods; control which dates can be posted.",
    href: `${PREFIX}/accounts/accounting-periods`,
    icon: <CalendarClock className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Outstanding bills & bill references",
    description: "AP/AR bills, aging, allocation, and auto-create from vouchers.",
    href: `${PREFIX}/accounts/outstanding-bills`,
    icon: <Receipt className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Vouchers & voucher types",
    description: "Create vouchers; voucher type lists are driven from posted data and day book filters.",
    href: `${PREFIX}/vouchers`,
    icon: <FileSpreadsheet className="h-8 w-8 text-brand-primary" />,
  },
  {
    title: "Purchase & AP workflow",
    description: "PO, GRN, and payable bill creation from operational documents.",
    href: `${PREFIX}/accounts/purchase-workflow`,
    icon: <Link2 className="h-8 w-8 text-brand-primary" />,
  },
];

export function AdvanceOptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Finance — Advance Options</h1>
        <p className="mt-1 text-sm text-text-muted">
          Central hub for finance configuration: masters, periods, currency, bills, and links into transactions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {CARDS.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex gap-4 rounded-xl border border-border bg-surface-raised p-5 shadow-sm transition hover:border-border-strong hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-subtle">{item.icon}</div>
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-text-primary">{item.title}</h2>
              <p className="mt-1 text-sm text-text-muted">{item.description}</p>
              <span className="mt-2 inline-block text-sm font-medium text-brand-primary">Open →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
