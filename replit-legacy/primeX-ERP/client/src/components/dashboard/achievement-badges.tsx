import React from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface AchievementBadgeProps {
  userId: number;
  limit?: number;
}

const AchievementBadges: React.FC<AchievementBadgeProps> = ({ 
  userId, 
  limit = 4 
}) => {
  // Fetch user achievements from our API
  const { data: userAchievements, isLoading } = useQuery({
    queryKey: [`/api/achievements/user/${userId}/achievements`],
    refetchOnWindowFocus: false,
  });

  // Filter to show only unlocked badges, sorted by most recent
  const recentUnlockedBadges = userAchievements
    ? userAchievements
        .filter((badge: any) => badge.unlocked)
        .sort((a: any, b: any) => {
          const dateA = new Date(a.date_unlocked || 0);
          const dateB = new Date(b.date_unlocked || 0);
          return dateB.getTime() - dateA.getTime();
        })
        .slice(0, limit)
    : [];

  // Get badge color class based on category
  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'productivity': return 'from-blue-500 to-blue-600';
      case 'quality': return 'from-emerald-500 to-emerald-600';
      case 'efficiency': return 'from-amber-500 to-amber-600';
      case 'collaboration': return 'from-purple-500 to-purple-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  // Get icon color class based on category
  const getIconColorClass = (category: string) => {
    switch(category) {
      case 'productivity': return 'text-blue-500';
      case 'quality': return 'text-emerald-500';
      case 'efficiency': return 'text-amber-500';
      case 'collaboration': return 'text-purple-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <Card className="overflow-hidden border-primary/10 shadow-md bg-white/90 backdrop-blur-sm">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm md:text-base font-medium flex items-center">
            <span className="material-icons mr-2 text-primary text-sm md:text-base">emoji_events</span>
            Recent Achievements
          </CardTitle>
          <Link to="/achievements">
            <Badge 
              variant="outline" 
              className="bg-primary/10 text-primary border-primary/20 text-xs cursor-pointer hover:bg-primary/20 transition-colors"
            >
              View All
            </Badge>
          </Link>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="ml-3 space-y-1 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-2 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : recentUnlockedBadges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <span className="material-icons text-3xl text-neutral-300 mb-2">emoji_events</span>
            <p className="text-sm text-neutral-500">
              No achievements yet. Start improving your performance to unlock badges!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentUnlockedBadges.map((badge: any) => (
              <div key={badge.id} className="flex items-center">
                <div className={`h-8 w-8 rounded-full bg-gradient-to-b ${getCategoryColor(badge.category)} flex items-center justify-center text-white`}>
                  <span className="material-icons text-sm">{badge.icon}</span>
                </div>
                
                <div className="ml-3 flex-1">
                  <div className="flex items-center">
                    <h3 className="text-sm font-medium">{badge.name}</h3>
                    <Badge 
                      variant="outline" 
                      className="ml-2 px-1.5 bg-primary/10 text-primary border-primary/20 text-xs"
                    >
                      Lv.{badge.current_level}
                    </Badge>
                  </div>
                  
                  <div className="flex justify-between text-xs text-neutral-dark mt-0.5">
                    <span>Progress</span>
                    <span>{badge.progress}%</span>
                  </div>
                  <Progress value={badge.progress} className="h-1 bg-neutral-100" />
                </div>
              </div>
            ))}
            
            <div className="pt-2 text-center">
              <Link to="/achievements" className="text-xs text-primary hover:text-primary-dark hover:underline transition-colors">
                View all achievements
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AchievementBadges;