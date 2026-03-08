import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type AnimationVariant = 
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'scale'
  | 'bounce'
  | 'flip'
  | 'rotate'
  | 'pulse';

interface AnimatedContainerProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  variant?: AnimationVariant;
  className?: string;
  isVisible?: boolean;
  onAnimationComplete?: () => void;
}

// Animation variants for different transition types
const variants = {
  'fade': {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  },
  'slide-up': {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  },
  'slide-down': {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 }
  },
  'slide-left': {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 }
  },
  'slide-right': {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 }
  },
  'scale': {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  },
  'bounce': {
    hidden: { opacity: 0, y: 50 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 10
      }
    }
  },
  'flip': {
    hidden: { opacity: 0, rotateY: 90 },
    visible: { opacity: 1, rotateY: 0 }
  },
  'rotate': {
    hidden: { opacity: 0, rotate: -5 },
    visible: { opacity: 1, rotate: 0 }
  },
  'pulse': {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { 
      opacity: 1, 
      scale: [1, 1.05, 1],
      transition: {
        duration: 0.5,
        times: [0, 0.5, 1]
      }
    }
  }
};

export const AnimatedContainer: React.FC<AnimatedContainerProps> = ({ 
  children, 
  delay = 0, 
  duration = 0.5,
  variant = 'fade',
  className = '',
  isVisible = true,
  onAnimationComplete
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={className}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={variants[variant]}
          transition={{ duration, delay }}
          onAnimationComplete={onAnimationComplete}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const useStaggeredChildren = (count: number, baseDelay = 0.1) => {
  const delays = Array(count).fill(0).map((_, i) => baseDelay * i);
  return delays;
};

// For staggered list item animations
export const AnimatedListItem: React.FC<AnimatedContainerProps & { index: number, staggerDelay?: number }> = ({
  children,
  delay = 0,
  duration = 0.4,
  variant = 'slide-up',
  className = '',
  index,
  staggerDelay = 0.05,
  isVisible = true,
  onAnimationComplete
}) => {
  const totalDelay = delay + (index * staggerDelay);
  
  return (
    <AnimatedContainer
      delay={totalDelay}
      duration={duration}
      variant={variant}
      className={className}
      isVisible={isVisible}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </AnimatedContainer>
  );
};

// Animation for when data loads
export const AnimatedDataContainer: React.FC<AnimatedContainerProps & { data: any, loadingClassName?: string }> = ({
  children,
  data,
  delay = 0,
  duration = 0.5,
  variant = 'scale',
  className = '',
  loadingClassName = 'min-h-[100px] flex items-center justify-center',
  isVisible = true,
  onAnimationComplete
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  
  useEffect(() => {
    if (data) {
      setIsLoaded(true);
    }
  }, [data]);
  
  if (!data) {
    return (
      <div className={loadingClassName}>
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  return (
    <AnimatedContainer
      delay={delay}
      duration={duration}
      variant={variant}
      className={className}
      isVisible={isVisible && isLoaded}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </AnimatedContainer>
  );
};

// For card transitions
export const AnimatedCard: React.FC<AnimatedContainerProps> = ({
  children,
  delay = 0.1,
  duration = 0.4,
  variant = 'scale',
  className = '',
  isVisible = true,
  onAnimationComplete
}) => {
  return (
    <AnimatedContainer
      delay={delay}
      duration={duration}
      variant={variant}
      className={className}
      isVisible={isVisible}
      onAnimationComplete={onAnimationComplete}
    >
      {children}
    </AnimatedContainer>
  );
};

// For counter animations (numbers changing)
export const AnimatedCounter: React.FC<{ value: number, duration?: number, className?: string }> = ({ 
  value, 
  duration = 1, 
  className = '' 
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    const startValue = displayValue;
    
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      
      setDisplayValue(Math.floor(startValue + progress * (value - startValue)));
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };
    
    window.requestAnimationFrame(step);
  }, [value, duration]);
  
  return <span className={className}>{displayValue}</span>;
};

// Dashboard specific animations
export const dashboardAnimations = {
  kpiCard: {
    variant: 'slide-up' as AnimationVariant,
    duration: 0.4
  },
  chart: {
    variant: 'fade' as AnimationVariant,
    duration: 0.6
  },
  dataTable: {
    variant: 'fade' as AnimationVariant,
    duration: 0.5
  },
  aiInsight: {
    variant: 'slide-left' as AnimationVariant,
    duration: 0.5
  },
  aiRecommendation: {
    variant: 'scale' as AnimationVariant,
    duration: 0.5
  },
  statusCard: {
    variant: 'slide-up' as AnimationVariant,
    duration: 0.4
  }
};