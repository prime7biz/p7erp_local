import { Link } from "react-router-dom";
import { ALL_TRUST_LEGAL_LINKS } from "@/data/legal/resourceLinks";

type Props = {
  /** Pages to exclude from the grid (e.g. current page path) */
  excludePaths?: string[];
  title?: string;
};

export function LegalCrossLinks({ excludePaths = [], title = "Related resources" }: Props) {
  const links = ALL_TRUST_LEGAL_LINKS.filter((l) => !excludePaths.includes(l.to));
  if (links.length === 0) return null;

  return (
    <section className="no-print mt-12 pt-8 border-t border-border print-avoid-break" aria-label={title}>
      <h2 className="text-lg font-semibold text-text-primary mb-4">{title}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-sm text-brand-primary hover:underline font-medium">
              {l.label}
            </Link>
            <span className="text-text-muted text-sm"> — {l.description}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-text-muted">
        <Link to="/support" className="text-brand-primary hover:underline font-medium">
          Support
        </Link>{" "}
        ·{" "}
        <Link to="/contact" className="text-brand-primary hover:underline font-medium">
          Contact
        </Link>
      </p>
    </section>
  );
}
