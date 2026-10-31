import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-2xl border text-text-primary card-lift supports-[backdrop-filter]:backdrop-blur-sm",
  {
    variants: {
      variant: {
        default:
          "border-white/20 bg-white/80 shadow-sm dark:border-border dark:bg-surface-raised/90",
        elevated:
          "border-white/20 bg-white/85 shadow-md dark:border-border dark:bg-surface-elevated/95",
        interactive:
          "border-white/20 bg-white/80 shadow-sm cursor-pointer transition-colors hover:border-brand-primary/30 hover:bg-brand-subtle dark:border-border dark:bg-surface-raised/90",
        warning: "border-status-warning/30 bg-status-warning-subtle",
        danger: "border-status-danger/20 bg-status-danger-subtle",
        flat: "border-border-subtle bg-surface-base shadow-none backdrop-blur-none",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pb-3", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 className={cn("text-xl font-semibold tracking-tight", className)} {...props} ref={ref} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-3", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

// CVA variant helper is intentionally exported for composition.
// eslint-disable-next-line react-refresh/only-export-components
export { Card, CardHeader, CardTitle, CardContent, cardVariants };
