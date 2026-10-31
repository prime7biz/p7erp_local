import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn-press inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised",
  {
    variants: {
      variant: {
        // primary and cta are aliases of default (backward compatibility)
        default:
          "bg-brand-primary text-brand-primary-foreground hover:bg-brand-hover active:bg-brand-pressed",
        primary:
          "bg-brand-primary text-brand-primary-foreground hover:bg-brand-hover active:bg-brand-pressed",
        cta: "bg-brand-primary text-brand-primary-foreground hover:bg-brand-hover active:bg-brand-pressed",
        secondary:
          "bg-surface-subtle text-text-primary border border-border hover:bg-state-hover active:bg-state-pressed",
        outline:
          "border border-border bg-surface-raised text-text-secondary hover:bg-state-hover active:bg-state-pressed",
        ghost: "text-brand-primary hover:bg-brand-subtle active:bg-state-pressed",
        subtle:
          "text-text-secondary hover:text-text-primary hover:bg-state-hover active:bg-state-pressed",
        danger:
          "bg-status-danger text-status-danger-foreground hover:bg-status-danger-hover active:bg-status-danger-pressed",
        link: "text-brand-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = "Button";

// CVA variant helper is intentionally exported for composition.
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
