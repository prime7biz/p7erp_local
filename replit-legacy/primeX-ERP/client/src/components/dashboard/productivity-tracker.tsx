import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedCard, AnimatedContainer, AnimatedListItem, useStaggeredChildren } from "@/lib/animation-utils";
import { motion } from "framer-motion";

interface ProductivityFactor {
  name: string;
  days: number;
  isPositive: boolean;
}

export const ProductivityTracker = () => {
  const [activeTab, setActiveTab] = useState('mood');
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Animation for tab switching
  const tabContentVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        when: "beforeChildren",
        staggerChildren: 0.1
      }
    },
    exit: { 
      opacity: 0,
      y: -20,
      transition: { duration: 0.2 }
    }
  };
  
  // For staggered stats cards
  const cardDelays = useStaggeredChildren(4, 0.1);
  
  // Animate header icon
  const iconVariants = {
    initial: { rotate: 0 },
    animate: { 
      rotate: [0, 15, -15, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        repeatDelay: 5
      }
    }
  };
  
  // Animated bar chart
  const barVariants = {
    hidden: { scaleY: 0, originY: 1 },
    visible: (custom: number) => ({ 
      scaleY: 1, 
      transition: { 
        duration: 0.5,
        delay: custom * 0.05,
        type: "spring",
        stiffness: 200,
        damping: 10
      } 
    })
  };
  
  // Sample data for mood statistics
  const moodData = {
    average: 7.0,
    productivity: 7.3,
    bestDay: {
      day: 'Wed',
      percentage: 28
    },
    topFactor: 'Deadlines',
    factors: {
      negative: [
        { name: 'Deadline pressure', days: 3, isPositive: false }
      ],
      positive: [
        { name: 'Team collaboration', days: 3, isPositive: true }
      ]
    }
  };
  
  // Simulate data loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 300);
    
    return () => clearTimeout(timer);
  }, []);

  const renderFactorItem = (factor: ProductivityFactor, index: number) => (
    <AnimatedListItem
      key={factor.name}
      index={index}
      variant="slide-right"
      className="flex justify-between items-center mb-2 last:mb-0"
      isVisible={isLoaded}
    >
      <div className="text-sm">{factor.name}</div>
      <motion.div 
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.4 + (index * 0.1) }}
        className={`flex items-center justify-center text-xs font-medium px-2 py-1 rounded-full ${
          factor.isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
        }`}
      >
        {factor.days} days
      </motion.div>
    </AnimatedListItem>
  );

  return (
    <Card className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden border border-gray-200">
      <AnimatedContainer variant="slide-down" duration={0.4}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center">
            <motion.div 
              initial="initial"
              animate="animate"
              variants={iconVariants}
              className="bg-primary-50 rounded-full p-2 mr-3"
            >
              <span className="material-icons text-primary">sentiment_satisfied</span>
            </motion.div>
            <h2 className="font-heading font-semibold text-gray-900">AI Mood & Productivity Tracker</h2>
          </div>
        </div>
      </AnimatedContainer>
      
      <Tabs defaultValue="mood" className="w-full" onValueChange={setActiveTab}>
        <AnimatedContainer variant="fade" delay={0.3} duration={0.5}>
          <div className="px-4 pt-3 border-b border-gray-200">
            <TabsList className="flex w-full bg-transparent p-0 mb-2">
              <TabsTrigger
                value="mood"
                className={`flex-1 rounded-t-lg border-b-2 pb-2 transition-colors ${
                  activeTab === 'mood' 
                    ? 'border-orange-500 text-orange-500 font-medium' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="material-icons mr-1 text-lg">mood</span>
                Mood
              </TabsTrigger>
              <TabsTrigger
                value="productivity"
                className={`flex-1 rounded-t-lg border-b-2 pb-2 transition-colors ${
                  activeTab === 'productivity' 
                    ? 'border-blue-500 text-blue-500 font-medium' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="material-icons mr-1 text-lg">bolt</span>
                Productivity
              </TabsTrigger>
            </TabsList>
          </div>
        </AnimatedContainer>
        
        <CardContent className="p-4">
          <TabsContent value="mood" className="mt-0">
            <motion.div
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[
                {
                  bg: "bg-amber-50",
                  icon: "😊",
                  iconColor: "text-amber-500",
                  label: "Average Mood",
                  value: `${moodData.average.toFixed(1)}/10`,
                  valueColor: "text-gray-900"
                },
                {
                  bg: "bg-blue-50",
                  icon: "⚡",
                  iconColor: "text-blue-500",
                  label: "Productivity",
                  value: `${moodData.productivity.toFixed(1)}/10`,
                  valueColor: "text-gray-900"
                },
                {
                  bg: "bg-green-50",
                  icon: "🏆",
                  iconColor: "text-green-500",
                  label: "Best Day",
                  value: moodData.bestDay.day,
                  valueColor: "text-green-600",
                  extra: `(+${moodData.bestDay.percentage}%)`
                },
                {
                  bg: "bg-amber-50",
                  icon: "🔍",
                  iconColor: "text-amber-500",
                  label: "Top Factor",
                  value: moodData.topFactor,
                  valueColor: "text-amber-600"
                }
              ].map((card, index) => (
                <motion.div
                  key={index}
                  className={`${card.bg} p-3 rounded-lg text-center`}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { 
                      opacity: 1, 
                      y: 0,
                      transition: { duration: 0.4, delay: cardDelays[index] }
                    }
                  }}
                >
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 300, 
                      damping: 15,
                      delay: cardDelays[index] + 0.2
                    }}
                    className={`text-2xl ${card.iconColor} mb-1`}
                  >
                    {card.icon}
                  </motion.div>
                  <div className="text-xs font-medium text-gray-600">{card.label}</div>
                  <div className={`text-lg font-semibold ${card.valueColor}`}>{card.value}</div>
                  {card.extra && <div className="text-xs text-green-600">{card.extra}</div>}
                </motion.div>
              ))}
            </motion.div>
            
            <AnimatedContainer delay={0.3} variant="fade" isVisible={isLoaded}>
              <h3 className="font-medium text-gray-900 mt-4 mb-2">Mood Influencing Factors</h3>
            </AnimatedContainer>
            
            <motion.div 
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <AnimatedCard delay={0.4} variant="slide-up" isVisible={isLoaded}>
                <div className="bg-red-50 p-3 rounded-lg">
                  <h4 className="text-red-700 font-medium mb-2 text-sm">Negative Factors</h4>
                  {moodData.factors.negative.map((factor, idx) => renderFactorItem(factor, idx))}
                </div>
              </AnimatedCard>
              
              <AnimatedCard delay={0.5} variant="slide-up" isVisible={isLoaded}>
                <div className="bg-green-50 p-3 rounded-lg">
                  <h4 className="text-green-700 font-medium mb-2 text-sm">Positive Factors</h4>
                  {moodData.factors.positive.map((factor, idx) => renderFactorItem(factor, idx))}
                </div>
              </AnimatedCard>
            </motion.div>
          </TabsContent>
          
          <TabsContent value="productivity" className="mt-0">
            <motion.div
              variants={tabContentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="grid grid-cols-2 gap-3 mb-4"
            >
              <AnimatedCard variant="slide-right" delay={0.1} isVisible={isLoaded}>
                <div className="border border-gray-200 p-3 rounded-lg">
                  <div className="flex items-center mb-1">
                    <span className="material-icons text-blue-500 mr-1">trending_up</span>
                    <h4 className="font-medium text-gray-900">Productive Hours</h4>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-2xl font-semibold text-gray-900">6.4</div>
                    <div className="text-sm text-green-600">+12% vs. last week</div>
                  </div>
                  <div className="text-xs text-gray-500">Average daily productive hours</div>
                </div>
              </AnimatedCard>
              
              <AnimatedCard variant="slide-left" delay={0.2} isVisible={isLoaded}>
                <div className="border border-gray-200 p-3 rounded-lg">
                  <div className="flex items-center mb-1">
                    <span className="material-icons text-blue-500 mr-1">timer</span>
                    <h4 className="font-medium text-gray-900">Focused Work</h4>
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="text-2xl font-semibold text-gray-900">3.2</div>
                    <div className="text-sm text-red-600">-8% vs. last week</div>
                  </div>
                  <div className="text-xs text-gray-500">Hours of deep work</div>
                </div>
              </AnimatedCard>
            </motion.div>
            
            <AnimatedContainer delay={0.3} variant="fade" isVisible={isLoaded}>
              <h3 className="font-medium text-gray-900 mb-2">Productivity by Weekday</h3>
            </AnimatedContainer>
            
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => {
                // Calculate a fake score for demonstration purposes
                const score = day === 'Wed' ? 92 : [75, 68, 92, 81, 65, 42, 38][index];
                const height = Math.max(20, Math.min(80, score / 1.5));
                
                return (
                  <div key={day} className="flex flex-col items-center">
                    <div className="flex-1 w-full flex items-end justify-center mb-1 h-[80px]">
                      <motion.div 
                        variants={barVariants}
                        initial="hidden"
                        animate="visible"
                        custom={index}
                        className={`w-full rounded-t-sm ${day === 'Wed' ? 'bg-green-500' : 'bg-blue-400'}`}
                        style={{ height: `${height}px` }}
                      />
                    </div>
                    <div className="text-xs font-medium text-gray-600">{day}</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
};