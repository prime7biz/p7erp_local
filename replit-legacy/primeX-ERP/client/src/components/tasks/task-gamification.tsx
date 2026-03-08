import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Star, Target, Award, Zap, Activity, TrendingUp, CheckCircle, Gift } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import confetti from 'canvas-confetti';

// Gamification point values
export const POINTS = {
  TASK_COMPLETED: 10,
  STREAK_BONUS: 5,
  EARLY_COMPLETION: 15,
  PRIORITY_HIGH: 15,
  PRIORITY_MEDIUM: 10,
  PRIORITY_LOW: 5
};

// Achievement types
export enum AchievementType {
  TASK_COMPLETED = 'TASK_COMPLETED',
  STREAK = 'STREAK',
  EARLY_COMPLETION = 'EARLY_COMPLETION',
  PRIORITY_COMPLETED = 'PRIORITY_COMPLETED',
  LEVEL_UP = 'LEVEL_UP'
}

// Interfaces
export interface GamificationStats {
  points: number;
  level: number;
  streak: number;
  tasksCompleted: number;
  achievements: Achievement[];
  lastCompletedDate?: string;
}

export interface Achievement {
  id: string;
  type: AchievementType;
  title: string;
  description: string;
  icon: React.ReactNode;
  pointsAwarded: number;
  dateAwarded: string;
}

interface TaskGamificationProps {
  stats: GamificationStats;
  onStatsChange: (stats: GamificationStats) => void;
}

// Helper to create achievement objects
const createAchievement = (
  type: AchievementType, 
  title: string, 
  description: string, 
  pointsAwarded: number,
  icon: React.ReactNode
): Achievement => {
  return {
    id: `${type}_${Date.now()}`,
    type,
    title,
    description,
    icon,
    pointsAwarded,
    dateAwarded: new Date().toISOString()
  };
};

// Calculate level based on points
export const calculateLevel = (points: number): number => {
  return Math.floor(Math.sqrt(points / 100)) + 1;
};

// Progress to next level
export const pointsToNextLevel = (currentPoints: number): { current: number, total: number } => {
  const currentLevel = calculateLevel(currentPoints);
  const nextLevelPoints = Math.pow(currentLevel, 2) * 100;
  const prevLevelPoints = Math.pow(currentLevel - 1, 2) * 100;
  
  return {
    current: currentPoints - prevLevelPoints,
    total: nextLevelPoints - prevLevelPoints
  };
};

export const TaskGamification: React.FC<TaskGamificationProps> = ({ stats, onStatsChange }) => {
  const [showAnimation, setShowAnimation] = useState(false);
  const [lastAchievement, setLastAchievement] = useState<Achievement | null>(null);
  const { toast } = useToast();
  
  // Display level progress
  const levelProgress = pointsToNextLevel(stats.points);
  const progressPercentage = (levelProgress.current / levelProgress.total) * 100;
  
  // Trigger celebration animation
  const celebrateAchievement = (achievement: Achievement) => {
    setLastAchievement(achievement);
    setShowAnimation(true);
    
    // Trigger confetti effect
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    
    toast({
      title: '🎉 ' + achievement.title,
      description: achievement.description,
      variant: 'default',
    });
    
    // Hide animation after delay
    setTimeout(() => {
      setShowAnimation(false);
    }, 3000);
  };
  
  // Component-specific method to handle task completion
  const handleTaskCompletion = (
    taskTitle: string, 
    priority: string, 
    dueDate?: string
  ) => {
    // Use the exported awardTaskCompletion function, but with our component state
    const updatedStats = awardTaskCompletion(taskTitle, priority, dueDate, stats);
    
    // Show celebration for the most significant recent achievement
    const recentAchievements = updatedStats.achievements.slice(-3);
    if (recentAchievements.length > 0) {
      const significantAchievement = recentAchievements.reduce((prev, current) => 
        (current.pointsAwarded > prev.pointsAwarded) ? current : prev
      );
      
      celebrateAchievement(significantAchievement);
    }
    
    // Update stats through the prop
    onStatsChange(updatedStats);
  };
  
  return (
    <div className="gamification-container">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <div className="font-medium">Level {stats.level}</div>
          <div className="text-sm text-gray-500">
            {levelProgress.current} / {levelProgress.total} XP to Level {stats.level + 1}
          </div>
        </div>
        <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-orange-500 to-orange-600"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
      </div>
      
      {/* Stats Display */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-orange-50 p-3 rounded-lg text-center">
          <Trophy className="h-6 w-6 mx-auto mb-1 text-orange-500" />
          <div className="text-xl font-bold">{stats.points}</div>
          <div className="text-xs text-gray-600">Points</div>
        </div>
        
        <div className="bg-blue-50 p-3 rounded-lg text-center">
          <Activity className="h-6 w-6 mx-auto mb-1 text-blue-500" />
          <div className="text-xl font-bold">{stats.streak}</div>
          <div className="text-xs text-gray-600">Day Streak</div>
        </div>
        
        <div className="bg-green-50 p-3 rounded-lg text-center">
          <CheckCircle className="h-6 w-6 mx-auto mb-1 text-green-500" />
          <div className="text-xl font-bold">{stats.tasksCompleted}</div>
          <div className="text-xs text-gray-600">Completed</div>
        </div>
      </div>
      
      {/* Animation Overlay */}
      <AnimatePresence>
        {showAnimation && lastAchievement && (
          <motion.div 
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <motion.div 
              className="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-xl flex flex-col items-center"
              initial={{ y: 50 }}
              animate={{ y: 0 }}
              transition={{ type: "spring", damping: 12 }}
            >
              <motion.div 
                className="text-5xl mb-4"
                animate={{ rotate: [0, 10, -10, 10, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: 1 }}
              >
                {lastAchievement.icon}
              </motion.div>
              <h2 className="text-2xl font-bold text-center mb-2">{lastAchievement.title}</h2>
              <p className="text-gray-600 text-center mb-3">{lastAchievement.description}</p>
              <motion.div 
                className="text-orange-600 font-bold text-xl"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.5, repeat: 1 }}
              >
                +{lastAchievement.pointsAwarded} points
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Recent Achievements */}
      {stats.achievements.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Recent Achievements</h3>
          <div className="space-y-3">
            {stats.achievements.slice(-3).reverse().map((achievement) => (
              <div key={achievement.id} className="flex items-center bg-gray-50 p-3 rounded-lg">
                <div className="mr-3">
                  {achievement.icon}
                </div>
                <div>
                  <div className="font-medium">{achievement.title}</div>
                  <div className="text-sm text-gray-600">{achievement.description}</div>
                </div>
                <div className="ml-auto text-orange-600 font-medium">+{achievement.pointsAwarded}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Default initial stats
export const initialGamificationStats: GamificationStats = {
  points: 0,
  level: 1,
  streak: 0,
  tasksCompleted: 0,
  achievements: [],
  lastCompletedDate: undefined
};

// Standalone function for awarding task completion - used in context
export const awardTaskCompletion = (
  taskTitle: string, 
  priority: string, 
  dueDate?: string,
  existingStats?: GamificationStats
): GamificationStats => {
  // Use provided stats or initial stats
  const currentStats = existingStats || initialGamificationStats;
  
  // Calculate base points
  let pointsAwarded = POINTS.TASK_COMPLETED;
  const achievements: Achievement[] = [];
  
  // Add priority bonus
  if (priority === 'high' || priority === 'urgent') {
    pointsAwarded += POINTS.PRIORITY_HIGH;
    achievements.push(createAchievement(
      AchievementType.PRIORITY_COMPLETED,
      'High Priority Clear!',
      `Completed high priority task: ${taskTitle}`,
      POINTS.PRIORITY_HIGH,
      <Zap className="h-6 w-6 text-yellow-500" />
    ));
  } else if (priority === 'medium') {
    pointsAwarded += POINTS.PRIORITY_MEDIUM;
  } else {
    pointsAwarded += POINTS.PRIORITY_LOW;
  }
  
  // Check for early completion bonus
  if (dueDate) {
    const now = new Date();
    const due = new Date(dueDate);
    if (now < due) {
      pointsAwarded += POINTS.EARLY_COMPLETION;
      achievements.push(createAchievement(
        AchievementType.EARLY_COMPLETION,
        'Ahead of Schedule!',
        `Completed task before deadline: ${taskTitle}`,
        POINTS.EARLY_COMPLETION,
        <Target className="h-6 w-6 text-green-500" />
      ));
    }
  }
  
  // Check streak (completed task on consecutive days)
  let streak = currentStats.streak;
  const today = new Date().toDateString();
  const lastCompletedDate = currentStats.lastCompletedDate 
    ? new Date(currentStats.lastCompletedDate).toDateString() 
    : null;
  
  // If last completed date was yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (lastCompletedDate === yesterday.toDateString()) {
    streak += 1;
    pointsAwarded += POINTS.STREAK_BONUS;
    
    // Award streak achievements
    if (streak % 5 === 0) { // Every 5-day streak
      achievements.push(createAchievement(
        AchievementType.STREAK,
        `${streak}-Day Streak!`,
        `You've completed tasks for ${streak} days in a row`,
        POINTS.STREAK_BONUS * 2,
        <Activity className="h-6 w-6 text-blue-500" />
      ));
      pointsAwarded += POINTS.STREAK_BONUS * 2;
    }
  } else if (lastCompletedDate !== today) {
    // Reset streak if we missed a day (but don't reset if already completed task today)
    streak = 1;
  }
  
  // Add task completion achievement
  achievements.push(createAchievement(
    AchievementType.TASK_COMPLETED,
    'Task Champion',
    `Completed task: ${taskTitle}`,
    POINTS.TASK_COMPLETED,
    <CheckCircle className="h-6 w-6 text-green-500" />
  ));
  
  // Calculate new stats
  const tasksCompleted = currentStats.tasksCompleted + 1;
  const totalPoints = currentStats.points + pointsAwarded;
  const newLevel = calculateLevel(totalPoints);
  
  // Check for level up
  if (newLevel > currentStats.level) {
    achievements.push(createAchievement(
      AchievementType.LEVEL_UP,
      'Level Up!',
      `You've reached level ${newLevel}`,
      newLevel * 10,
      <Award className="h-6 w-6 text-purple-500" />
    ));
    pointsAwarded += newLevel * 10;
  }
  
  // Combine with existing achievements
  const allAchievements = [...currentStats.achievements, ...achievements];
  
  // Return updated stats
  return {
    points: currentStats.points + pointsAwarded,
    level: newLevel,
    streak,
    tasksCompleted,
    achievements: allAchievements,
    lastCompletedDate: new Date().toISOString()
  };
};