import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

type Props = {
  to: string;
  title: string;
  description: string;
};

export function LegalResourceLinkCard({ to, title, description }: Props) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border border-border bg-surface-raised p-5 shadow-sm transition-all hover:border-brand-primary/30 hover:shadow-md print:break-inside-avoid"
    >
      <span className="text-base font-semibold text-text-primary group-hover:text-brand-primary transition-colors">
        {title}
      </span>
      <p className="mt-1.5 text-sm text-text-secondary leading-relaxed flex-1">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-primary">
        Open
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
