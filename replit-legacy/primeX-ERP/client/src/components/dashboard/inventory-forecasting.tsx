import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatedContainer, AnimatedListItem, AnimatedCard } from "@/lib/animation-utils";
import { motion } from "framer-motion";

interface InventoryItem {
  id: number;
  name: string;
  current: number;
  forecast: number;
  units: string;
  leadTime: number;
  status: 'warning' | 'normal' | 'surplus';
  orderAmount: number;
}

export const InventoryForecasting = () => {
  const [timeRange, setTimeRange] = useState('30');
  const [category, setCategory] = useState('all');
  const [isLoaded, setIsLoaded] = useState(false);

  // Animation for the header icon
  const iconVariants = {
    initial: { scale: 0.8, rotate: -10 },
    animate: { 
      scale: 1,
      rotate: 0,
      transition: { 
        type: "spring",
        stiffness: 260,
        damping: 20
      }
    }
  };

  // Simulate data loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 300);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Sample inventory items data
  const inventoryItems: InventoryItem[] = [
    {
      id: 1,
      name: "Cotton Fabric - Navy Blue",
      current: 420,
      forecast: 620,
      units: "units",
      leadTime: 14,
      status: 'warning',
      orderAmount: 800
    },
    {
      id: 2,
      name: "Denim Fabric - Dark Wash",
      current: 150,
      forecast: 280,
      units: "units",
      leadTime: 21,
      status: 'warning',
      orderAmount: 400
    },
    {
      id: 3,
      name: "Polyester Blend - Black",
      current: 680,
      forecast: 520,
      units: "units",
      leadTime: 14,
      status: 'surplus',
      orderAmount: 600
    }
  ];

  const getStatusIndicator = (status: string) => {
    switch(status) {
      case 'warning':
        return 'bg-red-500';
      case 'normal':
        return 'bg-green-500';
      case 'surplus':
        return 'bg-amber-500';
      default:
        return 'bg-gray-300';
    }
  };

  const buttonVariants = {
    initial: { scale: 1 },
    hover: { 
      scale: 1.05,
      transition: {
        duration: 0.2
      }
    },
    tap: { 
      scale: 0.95
    }
  };

  return (
    <Card className="bg-white rounded-xl shadow-sm mb-6 overflow-hidden border border-gray-200">
      <AnimatedContainer
        variant="slide-down"
        duration={0.4}
        isVisible={true}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center">
            <motion.div 
              initial="initial"
              animate="animate"
              variants={iconVariants}
              className="bg-primary-50 rounded-full p-2 mr-3"
            >
              <span className="material-icons text-primary">inventory</span>
            </motion.div>
            <div>
              <h2 className="font-heading font-semibold text-gray-900">Predictive Inventory Forecasting</h2>
              <p className="text-gray-500 text-xs">AI-driven demand predictions</p>
            </div>
          </div>
          
          <AnimatedContainer
            variant="fade"
            delay={0.3}
            duration={0.5}
            className="flex gap-2"
          >
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[140px] h-9 text-sm bg-white">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="fabric">Fabrics</SelectItem>
                <SelectItem value="accessories">Accessories</SelectItem>
                <SelectItem value="packaging">Packaging</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[100px] h-9 text-sm bg-white">
                <SelectValue placeholder="30 Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="14">14 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
                <SelectItem value="60">60 Days</SelectItem>
                <SelectItem value="90">90 Days</SelectItem>
              </SelectContent>
            </Select>
          </AnimatedContainer>
        </div>
      </AnimatedContainer>
      
      <CardContent className="p-4">
        <div className="space-y-3">
          {inventoryItems.map((item, index) => (
            <AnimatedListItem 
              key={item.id} 
              variant="slide-right" 
              index={index} 
              delay={0.2}
              isVisible={isLoaded}
            >
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center">
                  <div className="relative pl-4 py-3 pr-3 flex-1">
                    {/* Left border status indicator */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${getStatusIndicator(item.status)}`}></div>
                    
                    <div className="flex flex-col">
                      <h3 className="font-medium text-gray-900 mb-1">{item.name}</h3>
                      <div className="text-sm text-gray-600">
                        Current: <span className="font-medium">{item.current} {item.units}</span> | 
                        Forecasted demand: <span className="font-medium">{item.forecast} {item.units}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white p-3 flex flex-col sm:items-end border-t sm:border-t-0 sm:border-l border-gray-200">
                    <div className="text-gray-900 font-medium">
                      Order {item.orderAmount} units
                    </div>
                    <div className="text-sm text-gray-500">
                      Lead time: {item.leadTime} days
                    </div>
                    <motion.button 
                      className="mt-2 flex items-center justify-center bg-primary text-white py-1 px-3 rounded text-sm"
                      variants={buttonVariants}
                      initial="initial"
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <span className="material-icons text-sm mr-1">shopping_cart</span>
                      Order
                    </motion.button>
                  </div>
                </div>
              </div>
            </AnimatedListItem>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};