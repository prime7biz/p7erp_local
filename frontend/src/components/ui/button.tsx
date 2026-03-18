import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90",
        outline: "border border-border bg-surface-raised text-text-secondary hover:bg-surface-subtle",
        ghost: "text-brand-primary hover:bg-brand-primary/10",
        cta: "bg-brand-primary text-brand-primary-foreground hover:bg-brand-primary/90",
        danger: "bg-status-danger text-white hover:bg-status-danger/90",
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

export { Button, buttonVariants };
