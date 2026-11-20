import type { ReactNode } from "react";
import { listPageTableCardClass } from "@/components/app/listPageLayout";

export type ScrollTableMaxHeight = "main" | "panel" | "secondary" | string;

const HEIGHT: Record<"main" | "panel" | "secondary", string> = {
  /** Table is the main page block */
  main: "max-h-[calc(100dvh-18rem)]",
  /** Other panels sit above/below */
  panel: "max-h-[28rem]",
  /** Nested / secondary table */
  secondary: "max-h-[24rem]",
};

/**
 * Scrollable table card with sticky header region and optional footer count.
 */
export function ScrollTableCard({
  children,
  footer,
  maxHeight = "main",
  toolbar,
  className = "",
}: {
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: ScrollTableMaxHeight;
  toolbar?: ReactNode;
  className?: string;
}) {
  const heightClass = HEIGHT[maxHeight as "main" | "panel" | "secondary"] ?? maxHeight;
  return (
    <div className={`${listPageTableCardClass} ${className}`.trim()}>
      {toolbar ? <div className="border-b border-border px-3 py-2">{toolbar}</div> : null}
      <div className={`${heightClass} overflow-auto print:max-h-none print:overflow-visible`}>{children}</div>
      {footer != null ? (
        <div className="border-t border-border px-4 py-2 text-xs text-text-muted">{footer}</div>
      ) : null}
    </div>
  );
}
