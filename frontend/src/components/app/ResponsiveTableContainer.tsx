import type { ReactNode } from "react";

interface ResponsiveTableContainerProps {
  children: ReactNode;
  /** Max height for vertical scroll (Tailwind arbitrary value or class). */
  maxHeightClass?: string;
  className?: string;
}

/**
 * Wraps wide data tables: horizontal scroll on narrow viewports, capped vertical height
 * with sticky header support via thead.sticky in child tables.
 */
export function ResponsiveTableContainer({
  children,
  maxHeightClass = "max-h-[70vh]",
  className = "",
}: ResponsiveTableContainerProps) {
  return (
    <div className={`overflow-x-auto touch-pan-x [scrollbar-gutter:stable] ${className}`}>
      <div className={`overflow-y-auto ${maxHeightClass}`}>{children}</div>
    </div>
  );
}
