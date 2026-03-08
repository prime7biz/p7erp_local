import { db, pool, executeQuery } from '../db';
import { 
  achievementBadges, 
  userAchievements, 
  userPerformanceMetrics, 
  achievementActivityLogs,
  AchievementBadge,
  UserAchievement,
  UserPerformanceMetric,
  AchievementActivityLog,
  insertAchievementBadgeSchema,
  insertUserAchievementSchema,
  insertUserPerformanceMetricSchema,
  insertAchievementActivityLogSchema
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Achievement Service
 * Handles all achievement badge operations including tracking user progress,
 * awarding achievements, and calculating performance metrics
 */
export class AchievementService {
  
  /**
   * Get all achievement badges for a tenant
   */
  async getAllAchievementBadges(tenantId: number): Promise<AchievementBadge[]> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          'SELECT * FROM achievement_badges WHERE tenant_id = $1 AND is_active = true ORDER BY name ASC',
          [tenantId]
        );
        return result.rows;
      });
    } catch (error) {
      console.error('Error getting achievement badges:', error);
      throw new Error('Failed to fetch achievement badges');
    }
  }

  /**
   * Get a specific achievement badge by ID
   */
  async getAchievementBadgeById(badgeId: number, tenantId: number): Promise<AchievementBadge | null> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          'SELECT * FROM achievement_badges WHERE id = $1 AND tenant_id = $2',
          [badgeId, tenantId]
        );
        return result.rows[0] || null;
      });
    } catch (error) {
      console.error('Error getting achievement badge:', error);
      throw new Error('Failed to fetch achievement badge');
    }
  }

  /**
   * Create a new achievement badge
   */
  async createAchievementBadge(badgeData: z.infer<typeof insertAchievementBadgeSchema>): Promise<AchievementBadge> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          `INSERT INTO achievement_badges 
           (name, description, icon, category, max_level, thresholds, color_class, tenant_id, is_active) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
           RETURNING *`,
          [
            badgeData.name,
            badgeData.description,
            badgeData.icon,
            badgeData.category,
            badgeData.maxLevel,
            badgeData.thresholds,
            badgeData.colorClass,
            badgeData.tenantId,
            badgeData.isActive
          ]
        );
        return result.rows[0];
      });
    } catch (error) {
      console.error('Error creating achievement badge:', error);
      throw new Error('Failed to create achievement badge');
    }
  }
  
  /**
   * Update an existing achievement badge
   */
  async updateAchievementBadge(
    badgeId: number, 
    badgeData: Partial<z.infer<typeof insertAchievementBadgeSchema>>
  ): Promise<AchievementBadge | null> {
    try {
      return await executeQuery(async () => {
        // Build dynamic update query based on provided fields
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;
        
        // Add each provided field to the update query
        if (badgeData.name !== undefined) {
          updateFields.push(`name = $${paramIndex}`);
          values.push(badgeData.name);
          paramIndex++;
        }
        
        if (badgeData.description !== undefined) {
          updateFields.push(`description = $${paramIndex}`);
          values.push(badgeData.description);
          paramIndex++;
        }
        
        if (badgeData.icon !== undefined) {
          updateFields.push(`icon = $${paramIndex}`);
          values.push(badgeData.icon);
          paramIndex++;
        }
        
        if (badgeData.category !== undefined) {
          updateFields.push(`category = $${paramIndex}`);
          values.push(badgeData.category);
          paramIndex++;
        }
        
        if (badgeData.maxLevel !== undefined) {
          updateFields.push(`max_level = $${paramIndex}`);
          values.push(badgeData.maxLevel);
          paramIndex++;
        }
        
        if (badgeData.thresholds !== undefined) {
          updateFields.push(`thresholds = $${paramIndex}`);
          values.push(badgeData.thresholds);
          paramIndex++;
        }
        
        if (badgeData.colorClass !== undefined) {
          updateFields.push(`color_class = $${paramIndex}`);
          values.push(badgeData.colorClass);
          paramIndex++;
        }
        
        if (badgeData.isActive !== undefined) {
          updateFields.push(`is_active = $${paramIndex}`);
          values.push(badgeData.isActive);
          paramIndex++;
        }
        
        updateFields.push(`updated_at = NOW()`);
        
        // Add badge ID and tenant ID to values array
        values.push(badgeId);
        values.push(badgeData.tenantId);
        
        // If no fields to update, return null
        if (updateFields.length === 1) { // Only updated_at
          return null;
        }
        
        const result = await pool.query(
          `UPDATE achievement_badges 
           SET ${updateFields.join(', ')} 
           WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
           RETURNING *`,
          values
        );
        
        return result.rows[0] || null;
      });
    } catch (error) {
      console.error('Error updating achievement badge:', error);
      throw new Error('Failed to update achievement badge');
    }
  }
  
  /**
   * Get all achievement progress for a specific user
   */
  async getUserAchievements(userId: number, tenantId: number): Promise<UserAchievement[]> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          `SELECT ua.* 
           FROM user_achievements ua 
           WHERE ua.user_id = $1 
           AND ua.tenant_id = $2`,
          [userId, tenantId]
        );
        return result.rows;
      });
    } catch (error) {
      console.error('Error getting user achievements:', error);
      throw new Error('Failed to fetch user achievements');
    }
  }
  
  /**
   * Get detailed user achievement progress with badge details
   */
  async getUserAchievementsWithBadgeDetails(userId: number, tenantId: number): Promise<any[]> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          `SELECT 
            ua.id, 
            ua.user_id, 
            ua.badge_id, 
            ua.current_level, 
            ua.progress,
            ua.points,
            ua.unlocked,
            ua.date_unlocked,
            ua.date_level_up,
            ab.name as badge_name,
            ab.description as badge_description,
            ab.icon,
            ab.category,
            ab.max_level,
            ab.thresholds,
            ab.color_class
           FROM user_achievements ua 
           JOIN achievement_badges ab ON ua.badge_id = ab.id
           WHERE ua.user_id = $1 
           AND ua.tenant_id = $2
           ORDER BY ab.category, ab.name`,
          [userId, tenantId]
        );
        return result.rows;
      });
    } catch (error) {
      console.error('Error getting user achievements with badge details:', error);
      throw new Error('Failed to fetch user achievements with badge details');
    }
  }
  
  /**
   * Track a performance metric for a user and check/update achievements
   */
  async trackPerformanceMetric(
    userId: number, 
    tenantId: number, 
    metricType: string, 
    value: number
  ): Promise<{
    metric: UserPerformanceMetric,
    updatedAchievements: UserAchievement[]
  }> {
    try {
      // First record the metric
      const metric = await this.recordPerformanceMetric(userId, tenantId, metricType, value);
      
      // Then check and update achievements based on this metric
      const updatedAchievements = await this.checkAndUpdateAchievements(userId, tenantId, metricType, value);
      
      return {
        metric,
        updatedAchievements
      };
    } catch (error) {
      console.error('Error tracking performance metric:', error);
      throw new Error('Failed to track performance metric');
    }
  }
  
  /**
   * Record a performance metric for a user
   */
  private async recordPerformanceMetric(
    userId: number, 
    tenantId: number, 
    metricType: string, 
    value: number
  ): Promise<UserPerformanceMetric> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          `INSERT INTO user_performance_metrics 
           (user_id, tenant_id, metric_type, value) 
           VALUES ($1, $2, $3, $4) 
           RETURNING *`,
          [userId, tenantId, metricType, value]
        );
        return result.rows[0];
      });
    } catch (error) {
      console.error('Error recording performance metric:', error);
      throw new Error('Failed to record performance metric');
    }
  }
  
  /**
   * Check for and update achievements based on performance metrics
   */
  private async checkAndUpdateAchievements(
    userId: number, 
    tenantId: number, 
    metricType: string, 
    value: number
  ): Promise<UserAchievement[]> {
    try {
      // Get all active badges for this tenant that could be affected by this metric type
      const relevantBadges = await executeQuery(async () => {
        const result = await pool.query(
          `SELECT * FROM achievement_badges 
           WHERE tenant_id = $1 
           AND is_active = true
           AND thresholds ? $2`,  // Check if thresholds JSON contains this metric type
          [tenantId, metricType]
        );
        return result.rows;
      });
      
      const updatedAchievements: UserAchievement[] = [];
      
      // For each relevant badge, check and update user progress
      for (const badge of relevantBadges) {
        // Get current user achievement for this badge
        let userAchievement = await executeQuery(async () => {
          const result = await pool.query(
            `SELECT * FROM user_achievements 
             WHERE user_id = $1 
             AND badge_id = $2 
             AND tenant_id = $3`,
            [userId, badge.id, tenantId]
          );
          return result.rows[0];
        });
        
        const thresholds = badge.thresholds;
        
        // If user doesn't have this achievement yet, create it
        if (!userAchievement) {
          userAchievement = await executeQuery(async () => {
            const result = await pool.query(
              `INSERT INTO user_achievements 
               (user_id, badge_id, tenant_id, current_level, progress, points_earned, unlocked) 
               VALUES ($1, $2, $3, 0, 0, 0, false) 
               RETURNING *`,
              [userId, badge.id, tenantId]
            );
            return result.rows[0];
          });
        }
        
        // Calculate progress based on this metric and thresholds
        const { 
          newProgress, 
          newLevel, 
          newlyUnlocked, 
          pointsEarned 
        } = this.calculateAchievementProgress(
          userAchievement, 
          badge, 
          metricType, 
          value
        );
        
        // If there are changes to apply
        if (
          newProgress !== userAchievement.progress || 
          newLevel !== userAchievement.current_level ||
          newlyUnlocked
        ) {
          const oldLevel = userAchievement.current_level;
          const oldProgress = userAchievement.progress;
          
          // Update the user achievement
          const updatedAchievement = await executeQuery(async () => {
            const updateFields = [];
            const updateValues = [];
            
            // Build update query based on what changed
            updateFields.push('progress = $1');
            updateValues.push(newProgress);
            
            updateFields.push('current_level = $2');
            updateValues.push(newLevel);
            
            if (newlyUnlocked) {
              updateFields.push('unlocked = $3');
              updateValues.push(true);
              
              updateFields.push('date_unlocked = $4');
              updateValues.push(new Date());
              
              updateValues.push(userId);
              updateValues.push(badge.id);
              updateValues.push(tenantId);
              
              const result = await pool.query(
                `UPDATE user_achievements 
                 SET ${updateFields.join(', ')}, points_earned = points_earned + $5
                 WHERE user_id = $6 AND badge_id = $7 AND tenant_id = $8
                 RETURNING *`,
                [...updateValues, pointsEarned]
              );
              return result.rows[0];
            } else if (newLevel > oldLevel) {
              // Level up but already unlocked
              updateFields.push('date_level_up = $3');
              updateValues.push(new Date());
              
              updateValues.push(userId);
              updateValues.push(badge.id);
              updateValues.push(tenantId);
              
              const result = await pool.query(
                `UPDATE user_achievements 
                 SET ${updateFields.join(', ')}, points_earned = points_earned + $5
                 WHERE user_id = $6 AND badge_id = $7 AND tenant_id = $8
                 RETURNING *`,
                [...updateValues, pointsEarned]
              );
              return result.rows[0];
            } else {
              // Just progress update
              updateValues.push(userId);
              updateValues.push(badge.id);
              updateValues.push(tenantId);
              
              const result = await pool.query(
                `UPDATE user_achievements 
                 SET ${updateFields.join(', ')}, points_earned = points_earned + $5
                 WHERE user_id = $6 AND badge_id = $7 AND tenant_id = $8
                 RETURNING *`,
                [...updateValues, pointsEarned]
              );
              return result.rows[0];
            }
          });
          
          // Log the achievement activity
          await this.logAchievementActivity(
            userId,
            badge.id,
            tenantId,
            newlyUnlocked ? 'unlock' : (newLevel > oldLevel ? 'level_up' : 'progress'),
            oldLevel,
            newLevel,
            oldProgress,
            newProgress,
            pointsEarned,
            `${newlyUnlocked ? 'Unlocked' : (newLevel > oldLevel ? 'Leveled up' : 'Made progress on')} the "${badge.name}" badge`
          );
          
          updatedAchievements.push(updatedAchievement);
        }
      }
      
      return updatedAchievements;
    } catch (error) {
      console.error('Error checking and updating achievements:', error);
      throw new Error('Failed to check and update achievements');
    }
  }
  
  /**
   * Calculate achievement progress based on metrics and thresholds
   */
  private calculateAchievementProgress(
    userAchievement: UserAchievement,
    badge: AchievementBadge,
    metricType: string,
    value: number
  ): {
    newProgress: number,
    newLevel: number,
    newlyUnlocked: boolean,
    pointsEarned: number
  } {
    try {
      const thresholds = badge.thresholds as any;
      
      // If badge doesn't depend on this metric, return current values
      if (!thresholds[metricType]) {
        return {
          newProgress: userAchievement.progress,
          newLevel: userAchievement.current_level,
          newlyUnlocked: false,
          pointsEarned: 0
        };
      }
      
      // Get the threshold levels for this metric
      const metricThresholds = thresholds[metricType];
      
      // Determine level based on value
      let newLevel = 0;
      let newlyUnlocked = false;
      let pointsEarned = 0;
      
      // Find the highest level threshold that's less than or equal to the value
      for (let i = 0; i < badge.max_level; i++) {
        if (metricThresholds[i] && value >= metricThresholds[i]) {
          newLevel = i + 1;
          
          // Award points based on level increase
          if (newLevel > userAchievement.current_level) {
            // Points for each new level achieved
            pointsEarned += (newLevel - Math.max(userAchievement.current_level, 0)) * 10;
          }
        }
      }
      
      // If not yet unlocked and now reaching level 1, mark as newly unlocked
      if (!userAchievement.unlocked && newLevel >= 1) {
        newlyUnlocked = true;
        pointsEarned += 50; // Bonus points for initial unlock
      }
      
      // Calculate progress toward next level (if not at max already)
      let newProgress = 100; // Default to 100% if at max level
      
      if (newLevel < badge.max_level) {
        const currentThreshold = newLevel === 0 ? 0 : metricThresholds[newLevel - 1];
        const nextThreshold = metricThresholds[newLevel];
        
        if (nextThreshold && nextThreshold > currentThreshold) {
          // Calculate percentage progress to next level
          newProgress = Math.min(
            Math.round(((value - currentThreshold) / (nextThreshold - currentThreshold)) * 100),
            99 // Cap at 99% until next level is reached
          );
        }
      }
      
      return {
        newProgress,
        newLevel,
        newlyUnlocked,
        pointsEarned
      };
    } catch (error) {
      console.error('Error calculating achievement progress:', error);
      // Return current values on error
      return {
        newProgress: userAchievement.progress,
        newLevel: userAchievement.current_level,
        newlyUnlocked: false,
        pointsEarned: 0
      };
    }
  }
  
  /**
   * Log an achievement activity
   */
  private async logAchievementActivity(
    userId: number,
    badgeId: number,
    tenantId: number,
    activityType: string,
    oldLevel: number,
    newLevel: number,
    oldProgress: number,
    newProgress: number,
    pointsAwarded: number,
    message: string
  ): Promise<AchievementActivityLog> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          `INSERT INTO achievement_activity_logs 
           (user_id, badge_id, tenant_id, activity_type, old_level, new_level, old_progress, new_progress, points_awarded, message) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
           RETURNING *`,
          [
            userId, 
            badgeId, 
            tenantId, 
            activityType, 
            oldLevel, 
            newLevel, 
            oldProgress, 
            newProgress, 
            pointsAwarded, 
            message
          ]
        );
        return result.rows[0];
      });
    } catch (error) {
      console.error('Error logging achievement activity:', error);
      throw new Error('Failed to log achievement activity');
    }
  }
  
  /**
   * Get achievement activity logs for a user
   */
  async getUserAchievementLogs(
    userId: number, 
    tenantId: number,
    limit: number = 20
  ): Promise<AchievementActivityLog[]> {
    try {
      return await executeQuery(async () => {
        const result = await pool.query(
          `SELECT aal.*, ab.name as badge_name, ab.icon 
           FROM achievement_activity_logs aal
           JOIN achievement_badges ab ON aal.badge_id = ab.id
           WHERE aal.user_id = $1 
           AND aal.tenant_id = $2
           ORDER BY aal.created_at DESC
           LIMIT $3`,
          [userId, tenantId, limit]
        );
        return result.rows;
      });
    } catch (error) {
      console.error('Error getting user achievement logs:', error);
      throw new Error('Failed to fetch user achievement logs');
    }
  }
  
  /**
   * Get achievement progress summary for a user
   */
  async getUserAchievementSummary(userId: number, tenantId: number): Promise<any> {
    try {
      return await executeQuery(async () => {
        // Get total badges count
        const totalBadgesResult = await pool.query(
          `SELECT COUNT(*) as total_badges
           FROM achievement_badges
           WHERE tenant_id = $1 AND is_active = true`,
          [tenantId]
        );
        
        // Get unlocked badges count
        const unlockedBadgesResult = await pool.query(
          `SELECT COUNT(*) as unlocked_badges
           FROM user_achievements
           WHERE user_id = $1 AND tenant_id = $2 AND unlocked = true`,
          [userId, tenantId]
        );
        
        // Get total points earned
        const pointsResult = await pool.query(
          `SELECT SUM(points_earned) as total_points
           FROM user_achievements
           WHERE user_id = $1 AND tenant_id = $2`,
          [userId, tenantId]
        );
        
        // Get category breakdown
        const categoryResult = await pool.query(
          `SELECT ab.category, COUNT(*) as total, 
           SUM(CASE WHEN ua.unlocked = true THEN 1 ELSE 0 END) as unlocked
           FROM achievement_badges ab
           LEFT JOIN user_achievements ua ON ab.id = ua.badge_id AND ua.user_id = $1
           WHERE ab.tenant_id = $2 AND ab.is_active = true
           GROUP BY ab.category`,
          [userId, tenantId]
        );
        
        // Calculate rank based on points (simple implementation)
        const rank = await this.calculateUserRank(userId, tenantId);
        
        return {
          totalBadges: parseInt(totalBadgesResult.rows[0].total_badges),
          unlockedBadges: parseInt(unlockedBadgesResult.rows[0].unlocked_badges),
          totalPoints: parseInt(pointsResult.rows[0].total_points) || 0,
          categoryBreakdown: categoryResult.rows,
          rank
        };
      });
    } catch (error) {
      console.error('Error getting user achievement summary:', error);
      throw new Error('Failed to fetch user achievement summary');
    }
  }
  
  /**
   * Calculate a user's rank based on total points
   */
  private async calculateUserRank(userId: number, tenantId: number): Promise<any> {
    try {
      return await executeQuery(async () => {
        // Get user's total points
        const userPointsResult = await pool.query(
          `SELECT SUM(points_earned) as user_points
           FROM user_achievements
           WHERE user_id = $1 AND tenant_id = $2`,
          [userId, tenantId]
        );
        
        const userPoints = parseInt(userPointsResult.rows[0].user_points) || 0;
        
        // Get count of users with more points
        const rankResult = await pool.query(
          `SELECT COUNT(*) as rank_position
           FROM (
             SELECT user_id, SUM(points_earned) as total_points
             FROM user_achievements
             WHERE tenant_id = $1
             GROUP BY user_id
             HAVING SUM(points_earned) > $2
           ) as higher_ranked_users`,
          [tenantId, userPoints]
        );
        
        // Get total number of users with points
        const totalUsersResult = await pool.query(
          `SELECT COUNT(DISTINCT user_id) as total_users
           FROM user_achievements
           WHERE tenant_id = $1`,
          [tenantId]
        );
        
        const position = parseInt(rankResult.rows[0].rank_position) + 1;
        const totalUsers = parseInt(totalUsersResult.rows[0].total_users);
        
        // Determine rank title based on points
        let rankTitle = 'Novice';
        if (userPoints >= 1000) {
          rankTitle = 'Master';
        } else if (userPoints >= 500) {
          rankTitle = 'Expert';
        } else if (userPoints >= 250) {
          rankTitle = 'Professional';
        } else if (userPoints >= 100) {
          rankTitle = 'Intermediate';
        } else if (userPoints >= 50) {
          rankTitle = 'Beginner';
        }
        
        return {
          points: userPoints,
          position,
          outOf: totalUsers,
          title: rankTitle,
          percentile: totalUsers > 0 ? Math.round(((totalUsers - position) / totalUsers) * 100) : 0
        };
      });
    } catch (error) {
      console.error('Error calculating user rank:', error);
      return {
        points: 0,
        position: 1,
        outOf: 1,
        title: 'Novice',
        percentile: 0
      };
    }
  }
  
  /**
   * Initialize default achievement badges for a tenant
   */
  async initializeDefaultBadges(tenantId: number): Promise<AchievementBadge[]> {
    try {
      const defaultBadges = [
        {
          name: 'Task Master',
          description: 'Complete tasks efficiently and on time',
          icon: 'task_alt',
          category: 'productivity',
          maxLevel: 3,
          thresholds: {
            tasks_completed: [5, 25, 100]
          },
          colorClass: 'bg-blue-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Quality Guardian',
          description: 'Maintain high quality standards in production',
          icon: 'verified',
          category: 'quality',
          maxLevel: 3,
          thresholds: {
            quality_score: [80, 90, 98]
          },
          colorClass: 'bg-emerald-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Efficiency Expert',
          description: 'Optimize production processes for maximum efficiency',
          icon: 'speed',
          category: 'efficiency',
          maxLevel: 3,
          thresholds: {
            efficiency_score: [70, 85, 95]
          },
          colorClass: 'bg-amber-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Deadline Champion',
          description: 'Complete projects ahead of schedule',
          icon: 'event_available',
          category: 'productivity',
          maxLevel: 3,
          thresholds: {
            early_completions: [3, 10, 25]
          },
          colorClass: 'bg-indigo-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Resource Optimizer',
          description: 'Reduce waste and optimize resource usage',
          icon: 'eco',
          category: 'efficiency',
          maxLevel: 3, 
          thresholds: {
            waste_reduction: [5, 15, 30]
          },
          colorClass: 'bg-green-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Innovation Pioneer',
          description: 'Contribute innovative ideas and improvements',
          icon: 'lightbulb',
          category: 'collaboration',
          maxLevel: 2,
          thresholds: {
            improvements_suggested: [3, 10]
          },
          colorClass: 'bg-purple-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Team Player',
          description: 'Collaborate effectively with team members',
          icon: 'groups',
          category: 'collaboration',
          maxLevel: 3,
          thresholds: {
            team_projects: [3, 10, 25]
          },
          colorClass: 'bg-rose-500',
          tenantId,
          isActive: true
        },
        {
          name: 'Learning and Growth',
          description: 'Continuously improve skills and knowledge',
          icon: 'school',
          category: 'collaboration',
          maxLevel: 3,
          thresholds: {
            training_completed: [1, 5, 15]
          },
          colorClass: 'bg-cyan-500',
          tenantId,
          isActive: true
        }
      ];
      
      const createdBadges: AchievementBadge[] = [];
      
      // For each default badge, check if it exists, if not create it
      for (const badge of defaultBadges) {
        const existingBadge = await executeQuery(async () => {
          const result = await pool.query(
            `SELECT * FROM achievement_badges 
             WHERE name = $1 AND tenant_id = $2`,
            [badge.name, tenantId]
          );
          return result.rows[0];
        });
        
        if (!existingBadge) {
          const newBadge = await this.createAchievementBadge(badge);
          createdBadges.push(newBadge);
        } else {
          createdBadges.push(existingBadge);
        }
      }
      
      return createdBadges;
    } catch (error) {
      console.error('Error initializing default badges:', error);
      throw new Error('Failed to initialize default badges');
    }
  }
}

export const achievementService = new AchievementService();