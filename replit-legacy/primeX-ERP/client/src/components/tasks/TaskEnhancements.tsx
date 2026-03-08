import * as React from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  CloudIcon, 
  CloudRainIcon, 
  SunIcon, 
  DropletIcon, 
  CoffeeIcon,
  HeartIcon,
  ActivityIcon,
  EyeIcon,
  TimerIcon,
  ZapIcon,
  ThumbsUpIcon,
  BellIcon,
  BadgeCheckIcon,
  GitPullRequestIcon,
  AlertTriangleIcon,
  SparklesIcon,
  ShieldIcon,
  AlertCircleIcon,
  ClockIcon,
  CheckCircle2Icon,
  BrainCircuitIcon
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

// Type definitions
export interface HealthReminder {
  id: number;
  type: string;
  message: string;
  icon: React.ReactNode;
  interval: number;
}

export interface WeatherData {
  city: string;
  country: string;
  temp: number;
  condition: string;
  forecast: {
    day: string;
    temp: number;
    condition: string;
    icon: string;
  }[];
  humidity: number;
  windSpeed: number;
}

export interface AIInsight {
  id: number;
  title: string;
  description: string;
  type: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  priority: "urgent" | "high" | "medium" | "low";
  status: "pending" | "in_progress" | "blocked" | "completed";
  dueDate?: string;
  completed?: boolean;
  tags?: string[];
  assignedTo?: string;
  department?: string;
  requiresApproval?: boolean;
  approvalLevel?: string;
  progress?: number;
}

// Function to fetch weather data for Dhaka
export const fetchWeatherData = async (): Promise<WeatherData> => {
  try {
    // In a real implementation, this would use an API like OpenWeatherMap
    // For now, we'll return mock data for Dhaka
    return {
      city: "Dhaka",
      country: "Bangladesh",
      temp: 32,
      condition: "Partly Cloudy",
      forecast: [
        { day: "Today", temp: 32, condition: "Partly Cloudy", icon: "sun" },
        { day: "Tomorrow", temp: 33, condition: "Sunny", icon: "sun" }
      ],
      humidity: 70,
      windSpeed: 12
    };
  } catch (error) {
    console.error("Error fetching weather data:", error);
    throw error;
  }
};

// Generate health reminders
export const generateHealthReminders = (): HealthReminder[] => {
  const currentHour = new Date().getHours();
  
  const reminders = [
    { 
      id: 1, 
      type: "water", 
      message: "Stay hydrated! Drink a glass of water.", 
      icon: <DropletIcon className="h-5 w-5 text-blue-500" />,
      interval: 60 // minutes
    },
    { 
      id: 2, 
      type: "posture", 
      message: "Check your posture. Sit up straight!", 
      icon: <ActivityIcon className="h-5 w-5 text-indigo-500" />,
      interval: 30
    },
    { 
      id: 3, 
      type: "eyes", 
      message: "Rest your eyes. Look at something 20 feet away for 20 seconds.", 
      icon: <EyeIcon className="h-5 w-5 text-purple-500" />,
      interval: 40
    },
    { 
      id: 4, 
      type: "break", 
      message: "Time for a short break! Stand up and stretch.", 
      icon: <TimerIcon className="h-5 w-5 text-orange-500" />,
      interval: 90
    },
    { 
      id: 5, 
      type: "focus", 
      message: "Take a deep breath. Focus on your next task.", 
      icon: <ZapIcon className="h-5 w-5 text-yellow-500" />,
      interval: 120
    }
  ];
  
  // Time-specific reminders
  if (currentHour >= 9 && currentHour < 10) {
    reminders.push({ 
      id: 6, 
      type: "morning", 
      message: "Good morning! Start your day with a positive mindset.", 
      icon: <SunIcon className="h-5 w-5 text-yellow-500" />,
      interval: 240
    });
  } else if (currentHour >= 12 && currentHour < 14) {
    reminders.push({ 
      id: 7, 
      type: "lunch", 
      message: "Time for lunch! Don't forget to take a proper break.", 
      icon: <CoffeeIcon className="h-5 w-5 text-green-500" />,
      interval: 240
    });
  } else if (currentHour >= 17 && currentHour < 18) {
    reminders.push({ 
      id: 8, 
      type: "evening", 
      message: "Wind down for the day. Prioritize remaining tasks.", 
      icon: <ClockIcon className="h-5 w-5 text-red-500" />,
      interval: 240
    });
  }
  
  return reminders;
};

// Health Reminder Card component
interface HealthReminderCardProps {
  reminder: HealthReminder;
  onDismiss: (id: number) => void;
  onSnooze: (id: number) => void;
}

export const HealthReminderCard: React.FC<HealthReminderCardProps> = ({ reminder, onDismiss, onSnooze }) => {
  return (
    <Card className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-white">
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <div className="rounded-full bg-blue-100 p-2">
            {reminder.icon}
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-blue-800">{reminder.type.charAt(0).toUpperCase() + reminder.type.slice(1)} Reminder</h4>
            <p className="text-sm text-gray-600">{reminder.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" size="sm" onClick={() => onSnooze(reminder.id)}>
            Snooze
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDismiss(reminder.id)}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Weather Widget Component
interface WeatherWidgetProps {
  weatherData: WeatherData;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weatherData }) => {
  if (!weatherData) return null;
  
  const getWeatherIcon = (condition: string) => {
    const conditionLower = condition.toLowerCase();
    if (conditionLower.includes('rain')) return <CloudRainIcon className="h-8 w-8 text-blue-500" />;
    if (conditionLower.includes('cloud')) return <CloudIcon className="h-8 w-8 text-gray-500" />;
    return <SunIcon className="h-8 w-8 text-yellow-500" />;
  };
  
  return (
    <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
      <CardContent className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-xl">{weatherData.city}, {weatherData.country}</h3>
            <p className="text-blue-100">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end">
              {getWeatherIcon(weatherData.condition)}
              <span className="text-3xl font-bold ml-2">{weatherData.temp}°C</span>
            </div>
            <p className="text-blue-100">{weatherData.condition}</p>
          </div>
        </div>
        <Separator className="my-3 bg-blue-300/50" />
        <div className="flex justify-between">
          <div className="flex flex-col items-center">
            <p className="text-sm text-blue-100">Humidity</p>
            <div className="flex items-center">
              <DropletIcon className="h-4 w-4 mr-1" />
              <span className="font-semibold">{weatherData.humidity}%</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-sm text-blue-100">Wind</p>
            <div className="flex items-center">
              <CloudIcon className="h-4 w-4 mr-1" />
              <span className="font-semibold">{weatherData.windSpeed} km/h</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <p className="text-sm text-blue-100">Tomorrow</p>
            <div className="flex items-center">
              {getWeatherIcon(weatherData.forecast[1].condition)}
              <span className="font-semibold ml-1">{weatherData.forecast[1].temp}°C</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// AI Assistant Widget
interface AIAssistantWidgetProps {
  task?: Task;
  insights: AIInsight[];
  isLoading: boolean;
}

export const AIAssistantWidget: React.FC<AIAssistantWidgetProps> = ({ task, insights, isLoading }) => {
  return (
    <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center space-x-2">
          <SparklesIcon className="h-5 w-5 text-purple-500" />
          <CardTitle className="text-lg font-semibold text-purple-800">AI Assistant</CardTitle>
        </div>
        <CardDescription className="text-purple-700">
          Intelligent suggestions based on your tasks
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <div className="flex justify-center items-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : insights && insights.length > 0 ? (
          <div className="space-y-3">
            {insights.slice(0, 3).map((insight, index) => (
              <div key={index} className="flex items-start space-x-2 p-2 rounded-md bg-white border border-purple-100">
                <BrainCircuitIcon className="h-5 w-5 text-purple-500 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm text-purple-800">{insight.title}</h4>
                  <p className="text-xs text-gray-600">{insight.description}</p>
                </div>
              </div>
            ))}
            {insights.length > 3 && (
              <Button variant="ghost" size="sm" className="w-full text-purple-600 hover:text-purple-700 hover:bg-purple-50">
                Show {insights.length - 3} more insights
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            <p>No insights available yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};