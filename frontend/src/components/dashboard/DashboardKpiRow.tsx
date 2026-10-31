import { memo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckSquare,
  DollarSign,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { DashboardKpi } from "@/api/client";
import { Card } from "@/components/ui/card";

const bdt = new Intl.NumberFormat("en-BD");

type KpiCardDef = {
  id: string;
  label: string;
  icon: typeof ShoppingCart;
  borderColor: string;
  href: string;
  format: (v: number) => string;
  sparkTone: string;
};

const KPI_DEFS: KpiCardDef[] = [
  {
    id: "active-orders",
    label: "Active Orders",
    icon: ShoppingCart,
    borderColor: "border-l-status-info",
    href: "/app/orders",
    format: (v) => bdt.format(v),
    sparkTone: "var(--color-status-info)",
  },
  {
    id: "monthly-revenue",
    label: "Quoted this month",
    icon: DollarSign,
    borderColor: "border-l-status-success",
    href: "/app/reports",
    format: (v) => (v > 0 ? `৳${bdt.format(v)}` : "—"),
    sparkTone: "var(--color-status-success)",
  },
  {
    id: "pending-approvals",
    label: "Pending Approvals",
    icon: CheckSquare,
    borderColor: "border-l-status-warning",
    href: "/app/approvals",
    format: (v) => bdt.format(v),
    sparkTone: "var(--color-status-warning)",
  },
  {
    id: "inventory-items",
    label: "Inventory Items",
    icon: Package,
    borderColor: "border-l-accent-secondary",
    href: "/app/inventory",
    format: (v) => bdt.format(v),
    sparkTone: "var(--color-accent-secondary)",
  },
  {
    id: "total-customers",
    label: "Total Customers",
    icon: Users,
    borderColor: "border-l-brand-primary",
    href: "/app/customers",
    format: (v) => bdt.format(v),
    sparkTone: "var(--color-brand-primary)",
  },
];

type DashboardKpiCardProps = {
  card: KpiCardDef;
  value: number;
  subtitle?: string;
};

function DashboardKpiCard({ card, value, subtitle }: DashboardKpiCardProps) {
  const Icon = card.icon;
  return (
    <Card variant="elevated" className={`flex flex-col overflow-hidden border-l-4 ${card.borderColor}`}>
      <div className="flex-1 p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="rounded-lg bg-surface-subtle p-2">
            <Icon className="h-5 w-5 text-text-secondary" aria-hidden />
          </div>
          <p className="text-xs font-medium text-text-muted">{card.label}</p>
        </div>
        <p className="text-3xl font-bold tracking-tight text-text-primary tabular-nums">
          {card.format(value)}
        </p>
        {subtitle ? <p className="mt-1 text-[11px] text-text-muted">{subtitle}</p> : null}
      </div>
      <div className="rounded-b-2xl border-t border-border-subtle bg-surface-subtle/50 px-5 py-2.5">
        <Link
          to={card.href}
          className="flex items-center gap-1 text-xs font-medium text-accent-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          aria-label={`View details for ${card.label}`}
        >
          View details <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

const MemoizedDashboardKpiCard = memo(DashboardKpiCard);

type DashboardKpiRowProps = {
  kpis: DashboardKpi[];
  maxCards?: 4 | 5;
};

function kpiValue(kpis: DashboardKpi[], id: string): number {
  return kpis.find((k) => k.id === id)?.value ?? 0;
}

function kpiSubtitle(kpis: DashboardKpi[], id: string): string | undefined {
  return kpis.find((k) => k.id === id)?.subtitle;
}

function DashboardKpiRowInner({ kpis, maxCards = 5 }: DashboardKpiRowProps) {
  const cards = KPI_DEFS.slice(0, maxCards);

  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-text-primary">Key Metrics</h2>
      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
          maxCards >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"
        }`}
      >
        {cards.map((card) => (
          <MemoizedDashboardKpiCard
            key={card.id}
            card={card}
            value={kpiValue(kpis, card.id)}
            subtitle={kpiSubtitle(kpis, card.id)}
          />
        ))}
      </div>
    </section>
  );
}

export const DashboardKpiRow = memo(DashboardKpiRowInner);
