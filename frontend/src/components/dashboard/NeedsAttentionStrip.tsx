import { memo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  CheckSquare,
  ClipboardList,
  FileWarning,
  ShieldAlert,
} from "lucide-react";
import type { DashboardAttentionSummary } from "@/api/client";

const bdt = new Intl.NumberFormat("en-BD");

type AttentionKey =
  | "pending_approvals"
  | "tna_overdue"
  | "critical_alerts"
  | "promise_blocked"
  | "commercial_pending"
  | "post_dated_due_today";

const CARDS: {
  key: AttentionKey;
  label: string;
  icon: typeof CheckSquare;
  warnWhenPositive: boolean;
  dangerWhenPositive?: boolean;
}[] = [
  { key: "pending_approvals", label: "Pending approvals", icon: CheckSquare, warnWhenPositive: true },
  { key: "tna_overdue", label: "TNA overdue", icon: ClipboardList, warnWhenPositive: true },
  {
    key: "critical_alerts",
    label: "Critical alerts",
    icon: AlertTriangle,
    warnWhenPositive: true,
    dangerWhenPositive: true,
  },
  {
    key: "promise_blocked",
    label: "Promise blocked",
    icon: ShieldAlert,
    warnWhenPositive: true,
    dangerWhenPositive: true,
  },
  { key: "commercial_pending", label: "Commercial pending", icon: FileWarning, warnWhenPositive: true },
  { key: "post_dated_due_today", label: "Post-dated due", icon: FileWarning, warnWhenPositive: true },
];

const DEFAULT_LINKS: Record<AttentionKey, string> = {
  pending_approvals: "/app/approvals",
  tna_overdue: "/app/followup",
  critical_alerts: "/app/merchandising/alerts",
  promise_blocked: "/app/orders",
  commercial_pending: "/app/orders",
  post_dated_due_today: "/app/finance/registers/post-dated",
};

type NeedsAttentionCardProps = {
  label: string;
  value: number;
  href: string;
  icon: typeof CheckSquare;
  isHot: boolean;
  isDanger: boolean;
};

function NeedsAttentionCard({ label, value, href, icon: Icon, isHot, isDanger }: NeedsAttentionCardProps) {
  return (
    <Link
      to={href}
      aria-label={`${label}: ${value}`}
      className={`rounded-xl border p-3 shadow-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
        isDanger
          ? "border-status-danger/30 bg-status-danger-subtle"
          : isHot
            ? "border-status-warning/30 bg-status-warning-subtle"
            : "border-border bg-surface-raised"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${
            isDanger
              ? "text-status-danger-foreground"
              : isHot
                ? "text-status-warning-foreground"
                : "text-text-muted"
          }`}
          aria-hidden
        />
        <ArrowRight className="h-3.5 w-3.5 text-text-muted" aria-hidden />
      </div>
      <p
        className={`mt-2 text-2xl font-bold ${
          isDanger
            ? "text-status-danger-foreground"
            : isHot
              ? "text-status-warning-foreground"
              : "text-text-primary"
        }`}
      >
        {bdt.format(value)}
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
    </Link>
  );
}

const MemoizedNeedsAttentionCard = memo(NeedsAttentionCard);

type NeedsAttentionStripProps = {
  summary: DashboardAttentionSummary | null;
};

function NeedsAttentionStripInner({ summary }: NeedsAttentionStripProps) {
  if (!summary) return null;

  const total =
    summary.pending_approvals +
    summary.tna_overdue +
    summary.critical_alerts +
    summary.promise_blocked +
    summary.commercial_pending +
    (summary.post_dated_due_today ?? 0);

  if (total === 0) {
    return (
      <section aria-live="polite">
        <h2 className="mb-3 text-xs font-semibold text-text-muted">Needs attention</h2>
        <div className="flex items-center gap-2 rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          <CheckCircle className="h-4 w-4" aria-hidden /> All systems clear — no items need attention.
        </div>
      </section>
    );
  }

  return (
    <section aria-live="polite">
      <h2 className="mb-3 text-xs font-semibold text-text-muted">Needs attention</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CARDS.map((card) => {
          const value = summary[card.key] ?? 0;
          const href = summary.links?.[card.key] || DEFAULT_LINKS[card.key];
          const isHot = value > 0 && card.warnWhenPositive;
          const isDanger = value > 0 && Boolean(card.dangerWhenPositive);
          return (
            <MemoizedNeedsAttentionCard
              key={card.key}
              label={card.label}
              value={value}
              href={href}
              icon={card.icon}
              isHot={isHot}
              isDanger={isDanger}
            />
          );
        })}
      </div>
    </section>
  );
}

export const NeedsAttentionStrip = memo(NeedsAttentionStripInner);
