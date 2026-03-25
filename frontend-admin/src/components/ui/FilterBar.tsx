import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3 mb-4", className)}>{children}</div>
  );
}
