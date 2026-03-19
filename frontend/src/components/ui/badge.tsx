import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-primary text-brand-primary-foreground",
        secondary: "border-border bg-status-neutral-subtle text-status-neutral-foreground",
        accent: "border-brand-primary/30 bg-brand-primary/10 text-brand-primary",
        success: "border-status-success/25 bg-status-success-subtle text-status-success-foreground",
        warning: "border-status-warning/25 bg-status-warning-subtle text-status-warning-foreground",
        danger: "border-status-danger/25 bg-status-danger-subtle text-status-danger-foreground",
        info: "border-status-info/25 bg-status-info-subtle text-status-info-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// CVA variant helper is intentionally exported for composition (e.g. table cells).
// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants };
