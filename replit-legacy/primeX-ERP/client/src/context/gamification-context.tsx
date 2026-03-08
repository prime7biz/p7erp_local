import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  GamificationStats, 
  initialGamificationStats,
  AchievementType,
  awardTaskCompletion
} from '@/components/tasks/task-gamification';

interface GamificationContextType {
  stats: GamificationStats;
  updateStats: (updatedStats: GamificationStats) => void;
  resetStats: () => void;
  updateTaskCompletion: (taskTitle: string, priority: string, dueDate?: string) => void;
}

const GamificationContext = createContext<GamificationContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'primex_gamification_stats';

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<GamificationStats>(initialGamificationStats);
  
  // Load stats from localStorage on initial render
  useEffect(() => {
    const savedStats = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedStats) {
      try {
        setStats(JSON.parse(savedStats));
      } catch (err) {
        console.error('Error parsing gamification stats:', err);
        // If there's an error parsing, use initial stats
        setStats(initialGamificationStats);
      }
    }
  }, []);
  
  // Save stats to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stats));
  }, [stats]);
  
  // Update stats with new values
  const updateStats = (updatedStats: GamificationStats) => {
    setStats(updatedStats);
  };
  
  // Reset stats to initial values
  const resetStats = () => {
    setStats(initialGamificationStats);
  };
  
  // Helper function to calculate points for completing a task
  const updateTaskCompletion = (taskTitle: string, priority: string, dueDate?: string) => {
    // Use the shared awardTaskCompletion function to calculate the new stats
    const updatedStats = awardTaskCompletion(taskTitle, priority, dueDate, stats);
    
    // Update the state with the new stats
    setStats(updatedStats);
  };
  
  return (
    <GamificationContext.Provider
      value={{
        stats,
        updateStats,
        resetStats,
        updateTaskCompletion
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const context = useContext(GamificationContext);
  if (context === undefined) {
    throw new Error('useGamification must be used within a GamificationProvider');
  }
  return context;
}