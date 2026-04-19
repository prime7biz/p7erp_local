import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

type Props = {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: LucideIcon;
  /** Tailwind gradient + border e.g. from-violet-500/20 to-fuchsia-500/10 border-violet-300/40 */
  shellClass: string;
  iconWrapClass: string;
  href?: string;
  delay?: number;
};

export function FinancierGradientMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  shellClass,
  iconWrapClass,
  href,
  delay = 0,
}: Props) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ scale: 1.01 }}
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${shellClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-text-primary">{value}</p>
          {subtitle ? <p className="mt-1 text-xs leading-snug text-text-muted">{subtitle}</p> : null}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </motion.div>
  );
  if (href) {
    return (
      <Link to={href} className="block outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-primary">
        {inner}
      </Link>
    );
  }
  return inner;
}
