import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import confetti from 'canvas-confetti';
import { CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

// Success Animation Component
export const SuccessAnimation = ({ className }: { className?: string }) => {
  return (
    <div className={cn("fixed inset-0 flex items-center justify-center z-50 pointer-events-none", className)}>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        <motion.div 
          initial={{ scale: 1 }}
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 10, -10, 0]
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="bg-green-100 text-green-600 rounded-full p-6"
        >
          <CheckCircle2 size={60} strokeWidth={1.5} />
        </motion.div>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.2, 1],
            opacity: [0, 1, 0.8, 0] 
          }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0 border-4 border-green-400 rounded-full"
        />
      </motion.div>
    </div>
  );
};

// Error Animation Component
export const ErrorAnimation = ({ className }: { className?: string }) => {
  return (
    <div className={cn("fixed inset-0 flex items-center justify-center z-50 pointer-events-none", className)}>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        <motion.div 
          initial={{ rotate: 0 }}
          animate={{ 
            rotate: [0, -5, 5, -5, 5, 0],
          }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="bg-red-100 text-red-600 rounded-full p-6"
        >
          <AlertCircle size={60} strokeWidth={1.5} />
        </motion.div>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.2, 1],
            opacity: [0, 1, 0.8, 0] 
          }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0 border-4 border-red-400 rounded-full"
        />
      </motion.div>
    </div>
  );
};

// Sparkle Effect Component
export const SparkleEffect = ({ 
  children,
  trigger = false,
  onComplete,
  className
}: { 
  children: React.ReactNode, 
  trigger?: boolean,
  onComplete?: () => void,
  className?: string
}) => {
  const [sparkles, setSparkles] = useState<{ id: number, x: number, y: number, size: number, color: string }[]>([]);

  useEffect(() => {
    if (trigger) {
      const newSparkles = Array.from({ length: 12 }).map((_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 8 + 4,
        color: ['#FFD700', '#FFA500', '#FF4500', '#9370DB'][Math.floor(Math.random() * 4)]
      }));
      
      setSparkles(newSparkles);
      
      const timer = setTimeout(() => {
        setSparkles([]);
        if (onComplete) onComplete();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [trigger, onComplete]);

  return (
    <div className={cn("relative", className)}>
      {children}
      {sparkles.map(sparkle => (
        <motion.div
          key={sparkle.id}
          initial={{ 
            left: `50%`, 
            top: `50%`, 
            scale: 0, 
            opacity: 0 
          }}
          animate={{ 
            left: `${sparkle.x}%`, 
            top: `${sparkle.y}%`, 
            scale: 1, 
            opacity: [0, 1, 0] 
          }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute pointer-events-none"
          style={{ width: sparkle.size, height: sparkle.size }}
        >
          <Sparkles 
            style={{ color: sparkle.color }}
            size={sparkle.size} 
            className="absolute" 
          />
        </motion.div>
      ))}
    </div>
  );
};

// Ripple Button Effect Component
export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md font-medium transition-colors relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  ripple?: boolean;
  rippleColor?: string;
}

export const RippleButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ripple = true, rippleColor, children, ...props }, ref) => {
    const [ripples, setRipples] = useState<{ id: number, x: number, y: number }[]>([]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ripple) return;
      
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const newRipple = { id: Date.now(), x, y };
      setRipples(prev => [...prev, newRipple]);
      
      setTimeout(() => {
        setRipples(prev => prev.filter(r => r.id !== newRipple.id));
      }, 800);
      
      if (props.onClick) props.onClick(e);
    };

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        onClick={handleClick}
        {...props}
      >
        {children}
        {ripples.map(ripple => (
          <motion.span
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={cn(
              "absolute rounded-full pointer-events-none",
              variant === "default" ? "bg-white/20" : "bg-primary/10"
            )}
            style={{
              left: ripple.x,
              top: ripple.y,
              width: 20,
              height: 20,
              backgroundColor: rippleColor || undefined,
              transformOrigin: "center",
            }}
          />
        ))}
      </button>
    );
  }
);
RippleButton.displayName = "RippleButton";

// Confetti Celebration Effect
export const triggerConfetti = (options?: {
  particleCount?: number,
  spread?: number,
  startVelocity?: number,
  gravity?: number,
  origin?: { x: number, y: number }
}) => {
  confetti({
    particleCount: options?.particleCount || 100,
    spread: options?.spread || 70,
    startVelocity: options?.startVelocity || 30,
    gravity: options?.gravity || 1,
    origin: options?.origin || { x: 0.5, y: 0.5 },
    colors: ['#26ccff', '#a25afd', '#ff5e7e', '#88ff5a', '#fcff42', '#ffa62d', '#ff36ff'],
    zIndex: 1000,
  });
};

// Pulse Effect Component
export const PulseEffect = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  return (
    <div className={cn("relative", className)}>
      {children}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ 
          scale: [0.8, 1.1, 0.9],
          opacity: [0, 0.5, 0] 
        }}
        transition={{ 
          repeat: Infinity,
          repeatType: "loop",
          duration: 2,
          ease: "easeInOut"
        }}
        className="absolute inset-0 bg-primary/20 rounded-md pointer-events-none"
      />
    </div>
  );
};

// Pop-In Animation Component
export const PopIn = ({ 
  children, 
  show, 
  delay = 0,
  className 
}: { 
  children: React.ReactNode, 
  show: boolean,
  delay?: number,
  className?: string 
}) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ 
            type: "spring", 
            damping: 12,
            stiffness: 200,
            delay
          }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Staggered List Animation Component
export const StaggeredList = ({ 
  children, 
  staggerDelay = 0.05,
  className
}: { 
  children: React.ReactNode[], 
  staggerDelay?: number,
  className?: string
}) => {
  return (
    <div className={className}>
      {React.Children.map(children, (child, i) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            delay: i * staggerDelay,
            duration: 0.3,
            ease: "easeOut"
          }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
};

// Hover Card Effect
export const HoverCardEffect = ({ 
  children,
  className
}: { 
  children: React.ReactNode,
  className?: string
}) => {
  return (
    <motion.div
      whileHover={{ 
        scale: 1.02,
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
      }}
      transition={{ duration: 0.2 }}
      className={cn("transition-all duration-200", className)}
    >
      {children}
    </motion.div>
  );
};

// Toast Animation Manager
export const useToastAnimations = () => {
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  const showSuccessAnimation = () => {
    setSuccessVisible(true);
    setTimeout(() => setSuccessVisible(false), 1200);
  };

  const showErrorAnimation = () => {
    setErrorVisible(true);
    setTimeout(() => setErrorVisible(false), 1200);
  };

  const ToastAnimations = () => (
    <>
      <AnimatePresence>
        {successVisible && <SuccessAnimation />}
      </AnimatePresence>
      <AnimatePresence>
        {errorVisible && <ErrorAnimation />}
      </AnimatePresence>
    </>
  );

  return {
    showSuccessAnimation,
    showErrorAnimation,
    ToastAnimations
  };
};