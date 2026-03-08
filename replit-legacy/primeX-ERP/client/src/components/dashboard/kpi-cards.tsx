import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedCard, AnimatedContainer, AnimatedCounter, useStaggeredChildren } from "@/lib/animation-utils";
import { motion } from "framer-motion";

interface KPIData {
  id: string;
  title: string;
  value: string | number;
  change: number;
  changeLabel: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
}

export const KPICards = () => {
  const { data: kpiData, isLoading } = useQuery<KPIData[]>({
    queryKey: ["/api/dashboard/kpi"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get staggered animation delays for the KPI cards
  const cardDelays = useStaggeredChildren(4, 0.1);

  // Helper function to determine color class based on change value
  const getChangeColorClass = (change: number) => {
    return change >= 0 ? "text-status-success" : "text-status-error";
  };

  // Helper function to determine icon based on change value
  const getChangeIcon = (change: number) => {
    return change >= 0 ? "arrow_upward" : "arrow_downward";
  };

  // Animation variants for the icon pulse
  const iconPulse = {
    initial: { scale: 1 },
    pulse: { 
      scale: [1, 1.1, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        repeatType: "mirror" // Use valid framer-motion repeatType
      }
    }
  };

  // Animation for the change indicator
  const changeVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, delay: 0.2 }
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
      {isLoading
        ? // Loading skeleton
          Array(4)
            .fill(0)
            .map((_, i) => (
              <AnimatedCard 
                key={i} 
                delay={i * 0.05} 
                variant="slide-up" 
                className="w-full"
              >
                <Card className="bg-neutral-lightest rounded-lg shadow-sm w-full">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start justify-between mb-3 sm:mb-4">
                      <div>
                        <div className="h-4 bg-neutral-light rounded w-24 mb-2 animate-pulse"></div>
                        <div className="h-6 sm:h-8 bg-neutral-light rounded w-16 animate-pulse"></div>
                      </div>
                      <div className="h-8 w-8 sm:h-10 sm:w-10 bg-neutral-light rounded-full animate-pulse"></div>
                    </div>
                    <div className="flex items-center">
                      <div className="h-4 bg-neutral-light rounded w-12 animate-pulse"></div>
                      <div className="h-4 bg-neutral-light rounded w-24 ml-2 animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedCard>
            ))
        : !kpiData || kpiData.length === 0 
        ? // Empty state
          <AnimatedContainer variant="scale" className="col-span-full">
            <div className="text-center py-4 sm:py-6">
              <span className="material-icons text-3xl sm:text-4xl text-neutral-dark mb-2">insights</span>
              <h3 className="font-medium text-neutral-darkest mb-1">No KPI data available</h3>
              <p className="text-sm text-neutral-dark">KPI metrics will appear here when available.</p>
            </div>
          </AnimatedContainer>
        : // Actual KPI cards
          kpiData.map((kpi, index) => (
            <AnimatedCard 
              key={kpi.id} 
              delay={cardDelays[index % cardDelays.length]} 
              variant="slide-up" 
              className="w-full"
            >
              <Card className="bg-neutral-lightest rounded-lg shadow-sm hover:shadow-md transition-shadow w-full">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div>
                      <p className="text-neutral-dark text-xs sm:text-sm font-medium">{kpi.title}</p>
                      <h3 className="font-heading font-semibold text-xl sm:text-2xl text-neutral-darkest">
                        {typeof kpi.value === 'number' 
                          ? <AnimatedCounter value={kpi.value as number} duration={1.2} /> 
                          : kpi.value
                        }
                      </h3>
                    </div>
                    <motion.div 
                      initial={{ scale: 1 }}
                      animate={{ 
                        scale: [1, 1.1, 1],
                        transition: {
                          duration: 1.5,
                          repeat: Infinity,
                          repeatType: "mirror"
                        }
                      }}
                      className={`${kpi.iconBgColor} rounded-full p-1.5 sm:p-2`}
                    >
                      <span className={`material-icons text-sm sm:text-base ${kpi.iconColor}`}>{kpi.icon}</span>
                    </motion.div>
                  </div>
                  <motion.div 
                    initial="initial"
                    animate="animate"
                    variants={changeVariants}
                    className="flex flex-wrap items-center"
                  >
                    <span className={`flex items-center ${getChangeColorClass(kpi.change)} text-xs sm:text-sm font-medium`}>
                      <span className="material-icons text-xs sm:text-sm mr-0.5 sm:mr-1">{getChangeIcon(kpi.change)}</span>
                      {Math.abs(kpi.change)}%
                    </span>
                    <span className="text-neutral-dark text-xs sm:text-sm ml-1.5 sm:ml-2">{kpi.changeLabel}</span>
                  </motion.div>
                </CardContent>
              </Card>
            </AnimatedCard>
          ))}
    </div>
  );
};
