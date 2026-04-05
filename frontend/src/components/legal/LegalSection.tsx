import type { ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  children: ReactNode;
};

export function LegalSection({ id, title, children }: Props) {
  return (
    <section
      id={id}
      className="scroll-mt-24 print:page-break-inside-avoid border-b border-border/80 pb-8 last:border-b-0 last:pb-0"
    >
      <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-4">{title}</h2>
      <div className="space-y-4 text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}
